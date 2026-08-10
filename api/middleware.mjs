import express from 'express';
import http from 'http';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const UPSTREAM_PORT = 4001;
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── PATCH: GET /api/referrals → inject promoCode ──
app.get('/api/referrals', async (req, res) => {
  try {
    const data = await upstreamJSON(req, '/api/referrals');
    data.promoCode = 'XDIGITEX12';
    data.promoBonus = 12;
    data.promoDescription = 'New users can claim up to $12 bonus credits on their first plan upgrade';
    return res.json(data);
  } catch(e) { return res.status(500).json({ error: e.message }); }
});

// ── PATCH: GET /api/projects/:id/logs → real task history ──
app.get('/api/projects/:id/logs', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    // Map project → server (1=VPS, 2=184.94.x, 3=VPS again)
    const serverMap = { 1: 1, 2: 8, 3: 1 };
    const serverId = serverMap[id] ?? 1;
    const { rows } = await pool.query(
      `SELECT id,
              COALESCE(NULLIF(TRIM(title),''), LEFT(task,100)) AS message,
              status,
              created_at AS timestamp,
              summary, task, iterations, total_tokens, duration_ms
       FROM server_task_history
       WHERE server_id = $1
       ORDER BY id DESC LIMIT 50`,
      [serverId]
    );
    return res.json(rows.map(r => ({
      id: r.id,
      message: r.message || 'Task executed',
      level: r.status === 'failed' ? 'error' : r.status === 'running' ? 'warn' : 'info',
      timestamp: r.timestamp,
      summary: r.summary,
      iterations: r.iterations,
      tokens: r.total_tokens,
      duration: r.duration_ms
    })));
  } catch(e) { return res.status(500).json({ error: e.message }); }
});

// ── PATCH: GET /api/projects → enrich with server history count ──
app.get('/api/projects', async (req, res) => {
  try {
    const data = await upstreamJSON(req, `/api/projects${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`);
    const serverMap = { 1: 1, 2: 8, 3: 1 };
    const enriched = await Promise.all(data.map(async p => {
      const sid = serverMap[p.id] ?? 1;
      const { rows } = await pool.query(
        'SELECT COUNT(*) as cnt FROM server_task_history WHERE server_id=$1', [sid]);
      p.historyCount = parseInt(rows[0].cnt);
      return p;
    }));
    return res.json(enriched);
  } catch(e) { return res.status(500).json({ error: e.message }); }
});

// ── PROXY everything else ──
app.use('/', (req, res) => {
  const opts = {
    hostname: '127.0.0.1', port: UPSTREAM_PORT,
    path: req.url, method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${UPSTREAM_PORT}` }
  };
  const proxy = http.request(opts, upRes => {
    res.writeHead(upRes.statusCode, upRes.headers);
    upRes.pipe(res, { end: true });
  });
  proxy.on('error', e => res.status(502).json({ error: e.message }));
  req.pipe(proxy, { end: true });
});

async function upstreamJSON(req, path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port: UPSTREAM_PORT,
      path, method: 'GET',
      headers: { ...req.headers, host: `127.0.0.1:${UPSTREAM_PORT}` }
    };
    const r = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch(e) { reject(e); } });
    });
    r.on('error', reject);
    r.end();
  });
}

app.listen(4000, () => console.log('[middleware] Listening on :4000 → upstream :4001'));
