import os from "node:os";

const ADMIN_ROLES = new Set(["super_admin", "admin", "moderator", "support"]);
const ipOf = req => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim().slice(0, 64);
const tokenUserId = req => Number(String(req.headers.authorization || "").match(/^Bearer mock-token-(\d+)$/)?.[1] || 0);

// Build a public execution summary from durable run metadata/events. This is
// intentionally operational telemetry only: prompts and model reasoning are
// never returned to the admin console.
export function summarizeSpecialistActivity(metadata = {}, events = [], tools = []) {
  const safeName = value => String(value || "").trim().slice(0, 80);
  const specialists = new Map();
  const ensure = name => { const key=safeName(name)||"orchestrator"; if(!specialists.has(key)) specialists.set(key,{name:key,tokens:0,duration_ms:0,actions:0,retries:0,tasks:0}); return specialists.get(key); };
  const declared = Array.isArray(metadata.specialists) ? metadata.specialists : [];
  for (const item of declared) { const source=typeof item==="string"?{name:item}:item||{}; Object.assign(ensure(source.name||source.id||source.role),{tokens:Number(source.tokens||0),duration_ms:Number(source.duration_ms||source.durationMs||0),actions:Number(source.actions||0),retries:Number(source.retries||0),tasks:Number(source.tasks||0)}); }
  const skills = new Map(), handoffs=[];
  let active=safeName(metadata.activeSpecialist||metadata.currentSpecialist||metadata.active_specialist);
  for (const event of events) {
    const p=event.payload||{}, type=String(event.type||"");
    const name=safeName(p.specialist||p.agent||p.owner||p.role||p.toSpecialist||p.to);
    if (name) {
      const s=ensure(name); s.tokens+=Number(p.tokens||p.tokenCount||0); s.duration_ms+=Number(p.duration_ms||p.durationMs||0);
      if (/tool|action|command/.test(type)) s.actions+=1;
      if (/retry/.test(type)) s.retries+=1;
      if (/task\.(?:assigned|started|completed)/.test(type)) s.tasks+=1;
      if (/(?:specialist|agent)\.(?:started|active|selected)|task\.assigned/.test(type)) active=name;
    }
    if (/handoff|delegat/.test(type)) { const to=safeName(p.toSpecialist||p.to||p.specialist); handoffs.push({from:safeName(p.fromSpecialist||p.from||p.previous),to,at:event.created_at,reason:safeName(p.reason||p.summary)}); if(to) active=to; }
    const loaded=p.skills||p.loadedSkills||(p.skill?[p.skill]:[]);
    for (const skill of Array.isArray(loaded)?loaded:[]) { const x=typeof skill==="string"?{name:skill}:skill||{}, n=safeName(x.name||x.id); if(n) skills.set(n,{name:n,version:safeName(x.version)||null}); }
  }
  for (const tool of tools) { const name=safeName(tool.specialist||tool.owner||tool.input?.specialist); const s=ensure(name||"orchestrator"); s.actions+=1; s.duration_ms+=Number(tool.duration_ms||0); if(tool.status==="failed") s.retries+=Number(tool.input?.retry||0); }
  const metadataSkills=metadata.skillsLoaded||metadata.loadedSkills||[];
  for(const skill of Array.isArray(metadataSkills)?metadataSkills:[]){const x=typeof skill==="string"?{name:skill}:skill||{},n=safeName(x.name||x.id);if(n)skills.set(n,{name:n,version:safeName(x.version)||null});}
  return {active_specialist:active||null,specialists:[...specialists.values()],handoffs:handoffs.slice(-50),skills:[...skills.values()]};
}

export async function ensureAdminSchema(pool) {
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS admin_login_events(id BIGSERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id),identifier TEXT,ip TEXT NOT NULL,user_agent TEXT,success BOOLEAN NOT NULL,failure_category TEXT,session_ref TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS admin_ip_blocks(id BIGSERIAL PRIMARY KEY,ip TEXT NOT NULL UNIQUE,reason TEXT NOT NULL,notes TEXT,expires_at TIMESTAMPTZ,active BOOLEAN NOT NULL DEFAULT TRUE,created_by INTEGER REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS admin_credit_ledger(id BIGSERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),type TEXT NOT NULL,amount INTEGER NOT NULL,balance_before INTEGER NOT NULL,balance_after INTEGER NOT NULL,reference TEXT,idempotency_key TEXT UNIQUE,reason TEXT NOT NULL,admin_id INTEGER REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS admin_action_audit(id BIGSERIAL PRIMARY KEY,actor_id INTEGER REFERENCES users(id),action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT,result TEXT NOT NULL DEFAULT 'success',ip TEXT,metadata JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS account_warnings(id BIGSERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,message TEXT NOT NULL,severity TEXT NOT NULL CHECK(severity IN('info','warning','critical')),created_by INTEGER REFERENCES users(id),read_at TIMESTAMPTZ,dismissed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS admin_api_requests(id BIGSERIAL PRIMARY KEY,request_id TEXT,user_id INTEGER REFERENCES users(id),endpoint TEXT NOT NULL,method TEXT NOT NULL,status INTEGER NOT NULL,latency_ms INTEGER NOT NULL,ip TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS admin_login_events_created_idx ON admin_login_events(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS admin_login_events_ip_idx ON admin_login_events(ip,created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_action_audit(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS admin_credit_user_idx ON admin_credit_ledger(user_id,created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS coding_runs_status_started_idx ON coding_agent_runs(status,started_at DESC)`
    ,`CREATE INDEX IF NOT EXISTS admin_api_requests_created_idx ON admin_api_requests(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS admin_api_requests_user_idx ON admin_api_requests(user_id,created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS account_warnings_user_idx ON account_warnings(user_id,created_at DESC)`
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
    const started = Date.now(), userId = tokenUserId(req) || null;
    res.on("finish", () => pool.query(`INSERT INTO admin_api_requests(request_id,user_id,endpoint,method,status,latency_ms,ip) VALUES($1,$2,$3,$4,$5,$6,$7)`, [String(req.id || ""), userId, req.path.slice(0, 500), req.method, res.statusCode, Date.now() - started, ip]).catch(() => {}));
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
    const [usage, logins, ledger, runs, warnings, activity, apiUsage] = await Promise.all([
      pool.query(`SELECT provider,model,SUM(input_tokens)::bigint input_tokens,SUM(output_tokens)::bigint output_tokens,SUM(provider_cost)::numeric cost,COUNT(*)::int requests FROM agent_usage_ledger WHERE user_id=$1 AND status='settled' GROUP BY provider,model ORDER BY cost DESC`, [id]),
      pool.query(`SELECT id,ip,user_agent,success,failure_category,created_at FROM admin_login_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]),
      pool.query(`SELECT id,type,amount,balance_before,balance_after,reference,reason,admin_id,created_at FROM admin_credit_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]),
      pool.query(`SELECT public_id run_id,status,phase,started_at,completed_at,error,metadata FROM coding_agent_runs WHERE user_id=$1 ORDER BY started_at DESC LIMIT 50`, [id]),
      pool.query(`SELECT id,title,message,severity,read_at,dismissed_at,created_at FROM account_warnings WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]),
      pool.query(`SELECT created_at,action,target_type,target_id,result,metadata FROM admin_action_audit WHERE target_type='user' AND target_id=$1 ORDER BY created_at DESC LIMIT 50`, [String(id)]),
      pool.query(`SELECT COUNT(*) FILTER(WHERE created_at>=CURRENT_DATE)::int requests_today,COUNT(*) FILTER(WHERE created_at>=NOW()-INTERVAL '30 days')::int requests_30d,COUNT(*) FILTER(WHERE status>=400)::int errors,MAX(created_at) last_request FROM admin_api_requests WHERE user_id=$1`, [id])]);
    res.json({ user: user.rows[0], usage: usage.rows, logins: logins.rows, creditLedger: ledger.rows, runs: runs.rows, warnings: warnings.rows, adminActivity: activity.rows, apiUsage: apiUsage.rows[0] });
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
  app.post(`${route}/users/:id/warnings`, auth, async (req,res)=>{const title=String(req.body.title||"").trim(),message=String(req.body.message||"").trim(),severity=String(req.body.severity||"warning");if(!title||!message||!["info","warning","critical"].includes(severity))return res.status(400).json({error:"Title, message, and valid severity are required"});const q=await pool.query(`INSERT INTO account_warnings(user_id,title,message,severity,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[Number(req.params.id),title,message,severity,req.adminUser.id]);await audit(req,"USER_WARNING_SENT","user",req.params.id,{title,severity});res.status(201).json(q.rows[0]);});
  app.get(`${route}/runs`, auth, async (req, res) => { const limit=Math.max(1,Math.min(100,Number(req.query.limit)||50)); const q=await pool.query(`SELECT r.id,r.public_id run_id,r.status,r.phase,r.started_at,r.completed_at,r.error,r.metadata,u.id user_id,u.email,c.public_id conversation_id,s.name server_name FROM coding_agent_runs r JOIN users u ON u.id=r.user_id LEFT JOIN conversations c ON c.id=r.conversation_id LEFT JOIN servers s ON s.id=c.server_id ORDER BY r.started_at DESC LIMIT $1`,[limit]); const ids=q.rows.map(x=>x.id); let events=[],tools=[]; if(ids.length){[events,tools]=await Promise.all([pool.query(`SELECT run_id,sequence,type,payload,created_at FROM agent_run_events WHERE run_id=ANY($1::bigint[]) ORDER BY run_id,sequence`,[ids]),pool.query(`SELECT run_id,name,status,input,duration_ms FROM agent_tool_calls WHERE run_id=ANY($1::bigint[]) ORDER BY run_id,id`,[ids])]);} const items=q.rows.map(({id,...run})=>({...run,observability:summarizeSpecialistActivity(run.metadata,events.rows?.filter(x=>Number(x.run_id)===Number(id))||[],tools.rows?.filter(x=>Number(x.run_id)===Number(id))||[])})); res.json({items}); });
  app.get(`${route}/audit`, auth, async (req,res)=>{const limit=Math.max(1,Math.min(100,Number(req.query.limit)||50));const q=await pool.query(`SELECT a.*,u.email actor_email FROM admin_action_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT $1`,[limit]);res.json({items:q.rows});});
  app.get(`${route}/security`, auth, async (_req,res)=>{const [logins,blocks]=await Promise.all([pool.query(`SELECT * FROM admin_login_events ORDER BY created_at DESC LIMIT 100`),pool.query(`SELECT b.*,u.email created_by_email FROM admin_ip_blocks b LEFT JOIN users u ON u.id=b.created_by ORDER BY b.created_at DESC LIMIT 100`)]);res.json({loginEvents:logins.rows,blockedIps:blocks.rows});});
  app.post(`${route}/ip-blocks`, auth, async (req,res)=>{const ip=String(req.body.ip||"").trim(),reason=String(req.body.reason||"").trim(),notes=String(req.body.notes||"").trim(),expiresAt=req.body.expiresAt||null;if(!ip||!reason||ip===ipOf(req))return res.status(400).json({error:"IP and reason are required; current admin IP cannot be blocked"});const q=await pool.query(`INSERT INTO admin_ip_blocks(ip,reason,notes,expires_at,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(ip) DO UPDATE SET reason=$2,notes=$3,expires_at=$4,active=TRUE,updated_at=NOW() RETURNING *`,[ip,reason,notes,expiresAt,req.adminUser.id]);await audit(req,"ADMIN_IP_BLOCKED","ip",ip,{reason,expiresAt});res.status(201).json(q.rows[0]);});
  app.delete(`${route}/ip-blocks/:id`, auth, async (req,res)=>{const q=await pool.query(`UPDATE admin_ip_blocks SET active=FALSE,updated_at=NOW() WHERE id=$1 RETURNING *`,[Number(req.params.id)]);if(!q.rowCount)return res.status(404).json({error:"Block not found"});await audit(req,"ADMIN_IP_UNBLOCKED","ip",q.rows[0].ip,{});res.json(q.rows[0]);});
  app.get(`${route}/providers`, auth, async (_req,res)=>{const ids={openai:"OPENAI_API_KEY",gemini:"GEMINI_API_KEY",deepseek:"DEEPSEEK_API_KEY",nvidia:"NVIDIA_API_KEY",xai:"XAI_API_KEY",openrouter:"OPENROUTER_API_KEY",requesty:"REQUESTRY_API_KEY"};res.json(Object.entries(ids).map(([id,key])=>{const v=process.env[key]||"";return{id,label:id[0].toUpperCase()+id.slice(1),configured:v.length>10,masked:v?`${v.slice(0,3)}••••${v.slice(-4)}`:null}}));});
  app.get(`${route}/models`, auth, async (_req,res)=>{const q=await pool.query(`SELECT l.provider,l.model,COUNT(DISTINCT l.run_id)::int runs,SUM(l.input_tokens+l.output_tokens+l.cached_tokens+l.reasoning_tokens)::bigint tokens,SUM(l.provider_cost)::numeric cost,BOOL_OR(ar.model=l.model) routed FROM agent_usage_ledger l LEFT JOIN agent_routing ar ON ar.provider=l.provider AND ar.model=l.model WHERE l.status='settled' GROUP BY l.provider,l.model ORDER BY tokens DESC`);const configured=await pool.query(`SELECT agent_type,provider,model FROM agent_routing ORDER BY agent_type`);res.json({items:q.rows,routing:configured.rows});});
  app.get(`${route}/routing`, auth, async (_req,res)=>{const q=await pool.query(`SELECT agent_type,provider,model,updated_at FROM agent_routing ORDER BY agent_type`);res.json({items:q.rows});});
  app.put(`${route}/routing`, auth, async (req,res)=>{const routes=Array.isArray(req.body.routes)?req.body.routes:[];if(!routes.length||routes.some(x=>!x.agentType||!x.provider||!x.model))return res.status(400).json({error:"Valid routes are required"});const c=await pool.connect();try{await c.query("BEGIN");for(const x of routes)await c.query(`INSERT INTO agent_routing(agent_type,provider,model,updated_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(agent_type) DO UPDATE SET provider=$2,model=$3,updated_at=NOW()`,[x.agentType,x.provider,x.model]);await c.query("COMMIT");await audit(req,"ROUTING_UPDATED","routing","production",{routes:routes.map(x=>x.agentType)});res.json({ok:true})}catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}});
  app.get(`${route}/billing`, auth, async (_req,res)=>{const [summary,ledger,invoices]=await Promise.all([pool.query(`SELECT COALESCE(SUM(charged_credits),0)::bigint credits_consumed,COALESCE(SUM(provider_cost),0)::numeric provider_cost,COALESCE(SUM(input_tokens+output_tokens+cached_tokens+reasoning_tokens),0)::bigint tokens FROM agent_usage_ledger WHERE status='settled'`),pool.query(`SELECT l.created_at,u.email,l.type,l.amount,l.balance_before,l.balance_after,l.reference,l.reason,a.email admin FROM admin_credit_ledger l JOIN users u ON u.id=l.user_id LEFT JOIN users a ON a.id=l.admin_id ORDER BY l.created_at DESC LIMIT 200`),pool.query(`SELECT invoice_ref,amount,currency,status,date,created_at FROM invoices ORDER BY created_at DESC LIMIT 200`)]);res.json({summary:summary.rows[0],ledger:ledger.rows,invoices:invoices.rows});});
  app.get(`${route}/costs`, auth, async (req,res)=>{const days=Math.max(1,Math.min(365,Number(req.query.days)||30));const q=await pool.query(`SELECT provider,model,COUNT(DISTINCT run_id)::int runs,SUM(input_tokens+output_tokens+cached_tokens+reasoning_tokens)::bigint tokens,SUM(charged_credits)::bigint credits,SUM(provider_cost)::numeric cost FROM agent_usage_ledger WHERE status='settled' AND created_at>=NOW()-($1||' days')::interval GROUP BY provider,model ORDER BY cost DESC`,[days]);res.json({days,items:q.rows});});
  app.get(`${route}/promotions`, auth, async (_req,res)=>{const q=await pool.query(`SELECT id,name,type,status,discount,start_date,end_date,usage_count,created_at FROM promotions ORDER BY created_at DESC`);res.json({items:q.rows});});
  app.post(`${route}/promotions`, auth, async (req,res)=>{const {name,type,discount,startDate,endDate}=req.body;if(!name||!["coupon","discount","free_credits","partner"].includes(type)||!startDate||!endDate)return res.status(400).json({error:"Valid promotion fields are required"});const q=await pool.query(`INSERT INTO promotions(name,type,status,discount,start_date,end_date) VALUES($1,$2,'scheduled',$3,$4,$5) RETURNING *`,[name,type,discount||null,startDate,endDate]);await audit(req,"PROMOTION_CREATED","promotion",q.rows[0].id,{name,type});res.status(201).json(q.rows[0]);});
  app.get(`${route}/referrals`, auth, async (_req,res)=>{const q=await pool.query(`SELECT r.id,u.email referrer,r.referred_email,r.referred_name,r.status,r.commission,r.joined_at,l.code referral_code FROM referrals r JOIN users u ON u.id=r.referrer_id LEFT JOIN referral_links l ON l.user_id=r.referrer_id ORDER BY r.joined_at DESC`);res.json({items:q.rows});});
  app.get(`${route}/deployments`, auth, async (_req,res)=>{const q=await pool.query(`SELECT d.*,u.email owner_email,p.name project_name,p.repository_url FROM deployments d LEFT JOIN projects p ON p.id=d.project_id LEFT JOIN users u ON u.id=p.owner_id ORDER BY d.created_at DESC LIMIT 200`);res.json({items:q.rows});});
  app.get(`${route}/bots`, auth, async (_req,res)=>{const q=await pool.query(`SELECT id,name,description,status,purpose,users,messages,deployments,created_at,updated_at FROM bots ORDER BY created_at DESC LIMIT 200`);res.json({items:q.rows});});
  app.get(`${route}/marketplace`, auth, async (_req,res)=>{const q=await pool.query(`SELECT id,name,description,author,category,downloads,rating,price,status,created_at FROM templates ORDER BY created_at DESC`);res.json({items:q.rows});});
  app.patch(`${route}/marketplace/:id`, auth, async (req,res)=>{const status=String(req.body.status||"");if(!["draft","review","approved","rejected"].includes(status))return res.status(400).json({error:"Invalid status"});const q=await pool.query(`UPDATE templates SET status=$1 WHERE id=$2 RETURNING id,name,status`,[status,Number(req.params.id)]);if(!q.rowCount)return res.status(404).json({error:"Listing not found"});await audit(req,"MARKETPLACE_STATUS_CHANGED","marketplace",req.params.id,{status});res.json(q.rows[0]);});
  app.get(`${route}/secrets`, auth, async (_req,res)=>{const q=await pool.query(`SELECT id,name,description,type,environment,created_at,updated_at FROM secrets ORDER BY updated_at DESC`);res.json({items:q.rows.map(x=>({...x,status:"configured"}))});});
  app.get(`${route}/analytics`, auth, async (_req,res)=>{const [users,runs,usage]=await Promise.all([pool.query(`SELECT created_at::date AS usage_day,COUNT(*)::int users FROM users WHERE created_at>=CURRENT_DATE-29 GROUP BY 1`),pool.query(`SELECT started_at::date AS usage_day,COUNT(*)::int runs,COUNT(*)FILTER(WHERE status='completed')::int completed,COUNT(*)FILTER(WHERE status IN('failed','blocked'))::int failed FROM coding_agent_runs WHERE started_at>=CURRENT_DATE-29 GROUP BY 1`),pool.query(`SELECT created_at::date AS usage_day,SUM(input_tokens+output_tokens+cached_tokens+reasoning_tokens)::bigint tokens,SUM(charged_credits)::bigint credits FROM agent_usage_ledger WHERE status='settled' AND created_at>=CURRENT_DATE-29 GROUP BY 1`)]);const key=v=>new Date(v).toISOString().slice(0,10),um=new Map(users.rows.map(x=>[key(x.usage_day),x])),rm=new Map(runs.rows.map(x=>[key(x.usage_day),x])),lm=new Map(usage.rows.map(x=>[key(x.usage_day),x])),items=[];for(let i=29;i>=0;i--){const d=new Date();d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-i);const k=key(d),u=um.get(k)||{},r=rm.get(k)||{},l=lm.get(k)||{};items.push({date:k,new_users:u.users||0,runs:r.runs||0,completed:r.completed||0,failed:r.failed||0,tokens:l.tokens||0,credits:l.credits||0})}res.json({items});});
  app.get(`${route}/api-requests`, auth, async (_req,res)=>{const q=await pool.query(`SELECT r.request_id,r.endpoint,r.method,r.status,r.latency_ms,r.ip,r.created_at,u.email FROM admin_api_requests r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 200`);res.json({items:q.rows});});
  app.get(`${route}/health`, auth, async (_req,res)=>{const started=Date.now();let database={status:"failed",latency:null};try{await pool.query("SELECT 1");database={status:"healthy",latency:Date.now()-started}}catch{}res.json({api:{status:"healthy",uptimeSeconds:Math.floor(process.uptime())},database,host:{load:os.loadavg(),memoryUsedBytes:os.totalmem()-os.freemem(),memoryTotalBytes:os.totalmem(),uptimeSeconds:Math.floor(os.uptime())}});});
  app.get(`/api/account/warnings`, async (req,res)=>{const id=tokenUserId(req);if(!id)return res.status(401).json({error:"Unauthorized"});const q=await pool.query(`SELECT id,title,message,severity,read_at,created_at FROM account_warnings WHERE user_id=$1 AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT 20`,[id]);res.json({items:q.rows});});
  app.post(`/api/account/warnings/:id/read`, async (req,res)=>{const id=tokenUserId(req);if(!id)return res.status(401).json({error:"Unauthorized"});const q=await pool.query(`UPDATE account_warnings SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING id,read_at`,[Number(req.params.id),id]);if(!q.rowCount)return res.status(404).json({error:"Warning not found"});res.json(q.rows[0]);});
}
