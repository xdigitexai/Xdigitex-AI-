import os from "node:os";

const ADMIN_ROLES = new Set(["super_admin", "admin", "moderator", "support"]);
const ipOf = req => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim().slice(0, 64);
const tokenUserId = req => Number(String(req.headers.authorization || "").match(/^Bearer mock-token-(\d+)$/)?.[1] || 0);

export async function ensureAdminSchema(pool) {
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS admin_login_events(id BIGSERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id),identifier TEXT,ip TEXT NOT NULL,user_agent TEXT,success BOOLEAN NOT NULL,failure_category TEXT,session_ref TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS admin_ip_blocks(id BIGSERIAL PRIMARY KEY,ip TEXT NOT NULL UNIQUE,reason TEXT NOT NULL,notes TEXT,expires_at TIMESTAMPTZ,active BOOLEAN NOT NULL DEFAULT TRUE,created_by INTEGER REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS admin_credit_ledger(id BIGSERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),type TEXT NOT NULL,amount INTEGER NOT NULL,balance_before INTEGER NOT NULL,balance_after INTEGER NOT NULL,reference TEXT,idempotency_key TEXT UNIQUE,reason TEXT NOT NULL,admin_id INTEGER REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS admin_action_audit(id BIGSERIAL PRIMARY KEY,actor_id INTEGER REFERENCES users(id),action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,result TEXT NOT NULL DEFAULT 'success',ip TEXT,metadata JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS admin_login_events_created_idx ON admin_login_events(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS admin_login_events_ip_idx ON admin_login_events(ip,created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_action_audit(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS admin_credit_user_idx ON admin_credit_ledger(user_id,created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS coding_runs_status_started_idx ON coding_agent_runs(status,started_at DESC)`
  ]) await pool.query(sql);
}

export async function recordLoginAttempt(pool, req, { userId = null, identifier = null, success, failure = null, sessionRef = null }) {
  await ensureAdminSchema(pool);
  await pool.query(`INSERT INTO admin_login_events(user_id,identifier,ip,user_agent,success,failure_category,session_ref) VALUES($1,$2,$3,$4,$5,$6,$7)`, [userId, identifier ? String(identifier).slice(0, 254) : null, ipOf(req), String(req.headers["user-agent"] || "").slice(0, 1000), !!success, failure, sessionRef]);
}

export async function installAdminRuntime(app, pool) {
  await ensureAdminSchema(pool);
  app.use(async (req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    const ip = ipOf(req);
    const blocked = await pool.query(`SELECT 1 FROM admin_ip_blocks WHERE ip=$1 AND active=TRUE AND (expires_at IS NULL OR expires_at>NOW()) LIMIT 1`, [ip]);
    if (blocked.rowCount) return res.status(403).json({ error: "Access blocked by platform security policy" });
    next();
  });
  const auth = async (req, res, next) => {
    const id = tokenUserId(req), q = id ? await pool.query(`SELECT id,name,email,role,status FROM users WHERE id=$1`, [id]) : { rows: [] };
    const user = q.rows[0];
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!ADMIN_ROLES.has(user.role)) return res.status(403).json({ error: "Forbidden" });
    if (user.status !== "active") return res.status(403).json({ error: "Admin account is not active" });
    req.adminUser = user; next();
  };
  const audit = (req, action, targetType, targetId, metadata = {}, result = "success") => pool.query(`INSERT INTO admin_action_audit(actor_id,action,target_type,target_id,result,ip,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)`, [req.adminUser.id, action, targetType, String(targetId), result, ipOf(req), JSON.stringify(metadata)]);
  const route = "/api/admin/ops";
  app.get(`${route}/overview`, auth, async (req, res) => {
    const hours = Math.max(1, Math.min(24 * 90, Number(req.query.hours) || 24));
    const q = await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM users) total_users,
      (SELECT COUNT(*)::int FROM users WHERE status='active') active_users,
      (SELECT COUNT(*)::int FROM users WHERE created_at>=NOW()-($1||' hours')::interval) new_users,
      (SELECT COUNT(*)::int FROM users WHERE status<>'active') restricted_users,
      (SELECT COUNT(*)::int FROM coding_agent_runs WHERE status IN('queued','running','waiting_approval','cancelling')) active_runs,
      (SELECT COUNT(*)::int FROM coding_agent_runs WHERE started_at>=NOW()-($1||' hours')::interval AND status='completed') completed_runs,
      (SELECT COUNT(*)::int FROM coding_agent_runs WHERE started_at>=NOW()-($1||' hours')::interval AND status IN('failed','blocked')) failed_runs,
      (SELECT COALESCE(SUM(input_tokens+output_tokens),0)::bigint FROM usage_logs WHERE created_at>=NOW()-($1||' hours')::interval) tokens,
      (SELECT COALESCE(SUM(cost),0)::numeric FROM usage_logs WHERE created_at>=NOW()-($1||' hours')::interval) provider_cost,
      (SELECT COUNT(*)::int FROM admin_ip_blocks WHERE active AND (expires_at IS NULL OR expires_at>NOW())) blocked_ips,
      (SELECT COUNT(*)::int FROM admin_login_events WHERE created_at>=NOW()-($1||' hours')::interval AND NOT success) failed_logins`, [hours]);
    const activity = await pool.query(`SELECT created_at,action,target_type,target_id,result,ip,metadata FROM admin_action_audit WHERE created_at>=NOW()-($1||' hours')::interval ORDER BY created_at DESC LIMIT 30`, [hours]);
    res.json({ rangeHours: hours, metrics: q.rows[0], activity: activity.rows });
  });
  app.get(`${route}/users`, auth, async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1), limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25)), search = String(req.query.search || "").trim(), status = String(req.query.status || "").trim();
    const vals = [], where = [];
    if (search) { vals.push(`%${search}%`); where.push(`(u.email ILIKE $${vals.length} OR u.name ILIKE $${vals.length})`); }
    if (status) { vals.push(status); where.push(`u.status=$${vals.length}`); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = await pool.query(`SELECT COUNT(*)::int count FROM users u ${clause}`, vals);
    vals.push(limit, (page - 1) * limit);
    const rows = await pool.query(`SELECT u.id,u.name,u.email,u.role,u.status,u.plan,u.credits,u.created_at,u.updated_at,
      COALESCE((SELECT SUM(l.input_tokens+l.output_tokens+l.cached_tokens+l.reasoning_tokens) FROM agent_usage_ledger l WHERE l.user_id=u.id AND l.status='settled'),0)::bigint tokens_used,
      COALESCE((SELECT SUM(l.provider_cost) FROM agent_usage_ledger l WHERE l.user_id=u.id AND l.status='settled'),0)::numeric estimated_cost,
      (SELECT COUNT(*)::int FROM coding_agent_runs r WHERE r.user_id=u.id) agent_runs,
      (SELECT MAX(created_at) FROM admin_login_events e WHERE e.user_id=u.id AND e.success) last_login_at
      FROM users u ${clause} ORDER BY u.created_at DESC LIMIT $${vals.length-1} OFFSET $${vals.length}`, vals);
    res.json({ items: rows.rows, page, limit, total: total.rows[0].count, pages: Math.ceil(total.rows[0].count / limit) });
  });
  app.get(`${route}/users/:id`, auth, async (req, res) => {
    const id = Number(req.params.id); const user = await pool.query(`SELECT id,name,email,role,status,plan,credits,created_at,updated_at FROM users WHERE id=$1`, [id]);
    if (!user.rowCount) return res.status(404).json({ error: "User not found" });
    const [usage, logins, ledger, runs] = await Promise.all([
      pool.query(`SELECT provider,model,SUM(input_tokens)::bigint input_tokens,SUM(output_tokens)::bigint output_tokens,SUM(provider_cost)::numeric cost,COUNT(*)::int requests FROM agent_usage_ledger WHERE user_id=$1 AND status='settled' GROUP BY provider,model ORDER BY cost DESC`, [id]),
      pool.query(`SELECT id,ip,user_agent,success,failure_category,created_at FROM admin_login_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]),
      pool.query(`SELECT id,type,amount,balance_before,balance_after,reference,reason,admin_id,created_at FROM admin_credit_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]),
      pool.query(`SELECT public_id run_id,status,phase,started_at,completed_at,error,metadata FROM coding_agent_runs WHERE user_id=$1 ORDER BY started_at DESC LIMIT 50`, [id])]);
    res.json({ user: user.rows[0], usage: usage.rows, logins: logins.rows, creditLedger: ledger.rows, runs: runs.rows });
  });
  app.post(`${route}/users/:id/status`, auth, async (req, res) => {
    const status = String(req.body.status || ""), reason = String(req.body.reason || "").trim();
    if (!new Set(["active","suspended","banned"]).has(status) || !reason) return res.status(400).json({ error: "Valid status and reason are required" });
    const row = await pool.query(`UPDATE users SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,name,email,role,status`, [status, Number(req.params.id)]);
    if (!row.rowCount) return res.status(404).json({ error: "User not found" });
    await audit(req, status === "active" ? "ADMIN_USER_UNSUSPENDED" : "ADMIN_USER_SUSPENDED", "user", req.params.id, { reason });
    res.json(row.rows[0]);
  });
  app.post(`${route}/users/:id/credits`, auth, async (req, res) => {
    const amount = Number(req.body.amount), reason = String(req.body.reason || "").trim(), key = String(req.headers["idempotency-key"] || req.body.idempotencyKey || "");
    if (!Number.isInteger(amount) || amount === 0 || !reason || key.length < 8) return res.status(400).json({ error: "Integer amount, reason, and idempotency key are required" });
    const client = await pool.connect(); try { await client.query("BEGIN"); const exists = await client.query(`SELECT * FROM admin_credit_ledger WHERE idempotency_key=$1`, [key]); if (exists.rowCount) { await client.query("ROLLBACK"); return res.json(exists.rows[0]); }
      const u = await client.query(`SELECT credits FROM users WHERE id=$1 FOR UPDATE`, [Number(req.params.id)]); if (!u.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "User not found" }); }
      const before = u.rows[0].credits, after = before + amount; if (after < 0) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Adjustment would make balance negative" }); }
      await client.query(`UPDATE users SET credits=$1,updated_at=NOW() WHERE id=$2`, [after, Number(req.params.id)]); const entry = await client.query(`INSERT INTO admin_credit_ledger(user_id,type,amount,balance_before,balance_after,idempotency_key,reason,admin_id) VALUES($1,'manual_adjustment',$2,$3,$4,$5,$6,$7) RETURNING *`, [Number(req.params.id), amount, before, after, key, reason, req.adminUser.id]); await audit(req,"ADMIN_CREDIT_ADJUSTED","user",req.params.id,{amount,reason,balanceBefore:before,balanceAfter:after}); await client.query("COMMIT"); res.json(entry.rows[0]);
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  });
  app.get(`${route}/runs`, auth, async (req, res) => { const limit=Math.max(1,Math.min(100,Number(req.query.limit)||50)); const q=await pool.query(`SELECT r.public_id run_id,r.status,r.phase,r.started_at,r.completed_at,r.error,r.metadata,u.id user_id,u.email,c.public_id conversation_id,s.name server_name FROM coding_agent_runs r JOIN users u ON u.id=r.user_id LEFT JOIN conversations c ON c.id=r.conversation_id LEFT JOIN servers s ON s.id=c.server_id ORDER BY r.started_at DESC LIMIT $1`,[limit]); res.json({items:q.rows}); });
  app.get(`${route}/audit`, auth, async (req,res)=>{const limit=Math.max(1,Math.min(100,Number(req.query.limit)||50));const q=await pool.query(`SELECT a.*,u.email actor_email FROM admin_action_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT $1`,[limit]);res.json({items:q.rows});});
  app.get(`${route}/security`, auth, async (_req,res)=>{const [logins,blocks]=await Promise.all([pool.query(`SELECT * FROM admin_login_events ORDER BY created_at DESC LIMIT 100`),pool.query(`SELECT b.*,u.email created_by_email FROM admin_ip_blocks b LEFT JOIN users u ON u.id=b.created_by ORDER BY b.created_at DESC LIMIT 100`)]);res.json({loginEvents:logins.rows,blockedIps:blocks.rows});});
  app.post(`${route}/ip-blocks`, auth, async (req,res)=>{const ip=String(req.body.ip||"").trim(),reason=String(req.body.reason||"").trim(),notes=String(req.body.notes||"").trim(),expiresAt=req.body.expiresAt||null;if(!ip||!reason||ip===ipOf(req))return res.status(400).json({error:"IP and reason are required; current admin IP cannot be blocked"});const q=await pool.query(`INSERT INTO admin_ip_blocks(ip,reason,notes,expires_at,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(ip) DO UPDATE SET reason=$2,notes=$3,expires_at=$4,active=TRUE,updated_at=NOW() RETURNING *`,[ip,reason,notes,expiresAt,req.adminUser.id]);await audit(req,"ADMIN_IP_BLOCKED","ip",ip,{reason,expiresAt});res.status(201).json(q.rows[0]);});
  app.delete(`${route}/ip-blocks/:id`, auth, async (req,res)=>{const q=await pool.query(`UPDATE admin_ip_blocks SET active=FALSE,updated_at=NOW() WHERE id=$1 RETURNING *`,[Number(req.params.id)]);if(!q.rowCount)return res.status(404).json({error:"Block not found"});await audit(req,"ADMIN_IP_UNBLOCKED","ip",q.rows[0].ip,{});res.json(q.rows[0]);});
  app.get(`${route}/providers`, auth, async (_req,res)=>{const ids={openai:"OPENAI_API_KEY",gemini:"GEMINI_API_KEY",deepseek:"DEEPSEEK_API_KEY",nvidia:"NVIDIA_API_KEY",xai:"XAI_API_KEY",openrouter:"OPENROUTER_API_KEY",requesty:"REQUESTRY_API_KEY"};res.json(Object.entries(ids).map(([id,key])=>{const v=process.env[key]||"";return{id,label:id[0].toUpperCase()+id.slice(1),configured:v.length>10,masked:v?`${v.slice(0,3)}••••${v.slice(-4)}`:null}}));});
  app.get(`${route}/health`, auth, async (_req,res)=>{const started=Date.now();let database={status:"failed",latency:null};try{await pool.query("SELECT 1");database={status:"healthy",latency:Date.now()-started}}catch{}res.json({api:{status:"healthy",uptimeSeconds:Math.floor(process.uptime())},database,host:{load:os.loadavg(),memoryUsedBytes:os.totalmem()-os.freemem(),memoryTotalBytes:os.totalmem(),uptimeSeconds:Math.floor(os.uptime())}});});
}
