import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

export const ATTACHMENT_LIMITS = Object.freeze({ maxFileBytes: 25 * 1024 * 1024, maxFilesPerMessage: 8, maxMessageBytes: 50 * 1024 * 1024, maxArchiveFiles: 5000, maxExtractedBytes: 250 * 1024 * 1024 })
const allowedExtensions = new Set([".zip", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf", ".txt", ".md", ".json", ".csv", ".sql", ".log", ".yaml", ".yml", ".toml", ".ini", ".conf", ".env.example", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".css", ".scss", ".html", ".php", ".py", ".rb", ".go", ".java", ".rs", ".sh", ".xml"])

const safeName = value => path.basename(String(value || "attachment")).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180)
const publicRow = row => ({ id: row.public_id, conversationId: row.conversation_public_id, messageId: row.message_public_id, runId: row.run_public_id, name: row.name, mimeType: row.mime_type, size: Number(row.size_bytes), sha256: row.sha256, comment: row.comment, status: row.processing_status, preview: row.preview, manifest: row.manifest, uploadedAt: row.created_at, processedAt: row.processed_at })

export function inspectZip(buffer, limits = ATTACHMENT_LIMITS) {
  const files = [], top = new Set(); let total = 0, offset = 0
  while ((offset = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset)) >= 0) {
    if (offset + 46 > buffer.length) throw new Error("Invalid ZIP directory")
    const compressed = buffer.readUInt32LE(offset + 20), expanded = buffer.readUInt32LE(offset + 24), nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32)
    const raw = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"), normalized = raw.replace(/\\/g, "/")
    if (!normalized || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized) || normalized.split("/").includes("..") || normalized.includes("\0")) throw new Error("Unsafe ZIP path")
    const mode = buffer.readUInt32LE(offset + 38) >>> 16
    if ((mode & 0xf000) === 0xa000) throw new Error("ZIP symlinks are not allowed")
    total += expanded
    if (expanded > limits.maxExtractedBytes || total > limits.maxExtractedBytes) throw new Error("ZIP expands beyond the allowed size")
    files.push({ path: normalized, compressedBytes: compressed, extractedBytes: expanded })
    top.add(normalized.split("/")[0])
    if (files.length > limits.maxArchiveFiles) throw new Error("ZIP contains too many files")
    offset += 46 + nameLength + extraLength + commentLength
  }
  if (!files.length) throw new Error("ZIP has no readable file manifest")
  const manifests = files.map(x => x.path).filter(x => /(^|\/)(package\.json|pnpm-lock\.yaml|Dockerfile|docker-compose\.ya?ml|composer\.json|requirements\.txt|pyproject\.toml|go\.mod|Cargo\.toml|README(?:\.md)?)$/i.test(x)).slice(0, 50)
  return { fileCount: files.length, extractedBytes: total, topLevel: [...top].slice(0, 100), manifests, files: files.slice(0, 250) }
}

export function routeAttachment(attachment) {
  const name = String(attachment.name || "").toLowerCase(), mime = String(attachment.mimeType || "").toLowerCase()
  if (/\.sql$/.test(name)) return ["database"]
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/.test(name)) return ["frontend", "testing"]
  if (/dockerfile|docker-compose|\.zip$/i.test(name)) return ["deployment"]
  if (/\.patch$|\.diff$/.test(name)) return ["coding", "github"]
  if (/\.(js|mjs|cjs|ts|tsx|jsx|py|rb|go|java|rs|php|css|scss|html)$/.test(name)) return ["coding"]
  return ["orchestrator"]
}

export async function installAttachmentRuntime(app, pool, { authenticate, storageRoot = process.env.ATTACHMENT_STORAGE_ROOT || path.join(process.cwd(), "storage", "attachments"), limits = ATTACHMENT_LIMITS } = {}) {
  await mkdir(storageRoot, { recursive: true })
  await pool.query(`CREATE TABLE IF NOT EXISTS chat_attachments(id BIGSERIAL PRIMARY KEY,public_id TEXT UNIQUE NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,message_id BIGINT REFERENCES conversation_messages(id) ON DELETE SET NULL,run_id BIGINT REFERENCES coding_agent_runs(id) ON DELETE SET NULL,queued_instruction_id BIGINT,name TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes BIGINT NOT NULL,storage_ref TEXT NOT NULL,sha256 TEXT NOT NULL,comment TEXT,processing_status TEXT NOT NULL DEFAULT 'uploaded',preview TEXT,manifest JSONB,metadata JSONB NOT NULL DEFAULT '{}',processed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  await pool.query(`CREATE INDEX IF NOT EXISTS chat_attachments_conversation_idx ON chat_attachments(conversation_id,created_at)`)
  const auth = authenticate || ((_req, res) => res.status(500).json({ error: "Authentication unavailable" }))
  const own = async (serverId, conversationId, userId) => (await pool.query("SELECT c.* FROM conversations c WHERE c.public_id=$1 AND c.user_id=$2 AND c.server_id=$3", [conversationId, userId, Number(serverId)])).rows[0]
  app.get("/api/servers/:serverId/conversations/:conversationId/attachments", auth, async (req, res, next) => { try { const c = await own(req.params.serverId, req.params.conversationId, res.locals.userId); if (!c) return res.status(404).json({ error: "Conversation not found" }); const rows = await pool.query("SELECT a.*,c.public_id conversation_public_id,m.public_id message_public_id,r.public_id run_public_id FROM chat_attachments a JOIN conversations c ON c.id=a.conversation_id LEFT JOIN conversation_messages m ON m.id=a.message_id LEFT JOIN coding_agent_runs r ON r.id=a.run_id WHERE a.conversation_id=$1 ORDER BY a.id", [c.id]); res.json({ items: rows.rows.map(publicRow), limits }) } catch (e) { next(e) } })
  app.post("/api/servers/:serverId/conversations/:conversationId/attachments", auth, async (req, res, next) => { try {
    const c = await own(req.params.serverId, req.params.conversationId, res.locals.userId); if (!c) return res.status(404).json({ error: "Conversation not found" })
    const files = Array.isArray(req.body.files) ? req.body.files : []; if (!files.length || files.length > limits.maxFilesPerMessage) return res.status(400).json({ error: `Choose 1-${limits.maxFilesPerMessage} files` })
    const decoded = files.map(file => ({ ...file, name: safeName(file.name), buffer: Buffer.from(String(file.data || "").replace(/^data:[^,]+,/, ""), "base64") }))
    if (decoded.some(file => !file.name || !allowedExtensions.has(path.extname(file.name).toLowerCase()) && !file.name.endsWith(".env.example") && !/^(Dockerfile|Makefile|Procfile)$/i.test(file.name))) return res.status(415).json({ error: "One or more file types are not allowed" })
    if (decoded.some(file => !file.buffer.length || file.buffer.length > limits.maxFileBytes) || decoded.reduce((n, file) => n + file.buffer.length, 0) > limits.maxMessageBytes) return res.status(413).json({ error: "Attachment size limit exceeded" })
    const results = []
    for (const file of decoded) { const id = randomUUID(), userDir = path.join(storageRoot, String(res.locals.userId), c.public_id), storageRef = path.join(userDir, id); await mkdir(userDir, { recursive: true }); await writeFile(storageRef, file.buffer, { flag: "wx", mode: 0o600 }); const sha = createHash("sha256").update(file.buffer).digest("hex"); let status = "ready", manifest = null, preview = null
      try { if (path.extname(file.name).toLowerCase() === ".zip") { status = "processing"; manifest = inspectZip(file.buffer, limits); status = "ready" } else if (/^(text\/|application\/(json|sql|xml))/.test(file.type || "") || /\.(txt|md|json|csv|sql|log|ya?ml|toml|ini|conf|js|mjs|ts|tsx|jsx|css|html|php|py|rb|go|java|rs|sh)$/.test(file.name)) preview = file.buffer.subarray(0, 8192).toString("utf8") } catch (error) { status = "failed"; manifest = { error: error.message } }
      const row = await pool.query("INSERT INTO chat_attachments(public_id,user_id,conversation_id,name,mime_type,size_bytes,storage_ref,sha256,comment,processing_status,preview,manifest,processed_at,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CASE WHEN $10 IN('ready','failed') THEN NOW() END,$13) RETURNING *", [id, res.locals.userId, c.id, file.name, String(file.type || "application/octet-stream").slice(0, 120), file.buffer.length, storageRef, sha, String(file.comment || "").slice(0, 1000) || null, status, preview, manifest && JSON.stringify(manifest), JSON.stringify({ specialists: routeAttachment({ name: file.name, mimeType: file.type }) })]); results.push(publicRow({ ...row.rows[0], conversation_public_id: c.public_id })) }
    res.status(201).json({ items: results })
  } catch (e) { next(e) } })
  app.patch("/api/servers/:serverId/conversations/:conversationId/attachments/:attachmentId", auth, async (req, res, next) => { try { const c = await own(req.params.serverId, req.params.conversationId, res.locals.userId); if (!c) return res.status(404).json({ error: "Conversation not found" }); const row = await pool.query("UPDATE chat_attachments SET comment=$4,updated_at=NOW() WHERE public_id=$1 AND conversation_id=$2 AND user_id=$3 AND message_id IS NULL RETURNING *", [req.params.attachmentId, c.id, res.locals.userId, String(req.body.comment || "").slice(0, 1000) || null]); if (!row.rowCount) return res.status(409).json({ error: "Attachment is already bound or missing" }); res.json(publicRow({ ...row.rows[0], conversation_public_id: c.public_id })) } catch (e) { next(e) } })
  app.delete("/api/servers/:serverId/conversations/:conversationId/attachments/:attachmentId", auth, async (req, res, next) => { try { const c = await own(req.params.serverId, req.params.conversationId, res.locals.userId); if (!c) return res.status(404).end(); const row = await pool.query("DELETE FROM chat_attachments WHERE public_id=$1 AND conversation_id=$2 AND user_id=$3 AND message_id IS NULL RETURNING storage_ref", [req.params.attachmentId, c.id, res.locals.userId]); if (!row.rowCount) return res.status(409).json({ error: "Attachment is already bound or missing" }); await rm(row.rows[0].storage_ref, { force: true }); res.status(204).end() } catch (e) { next(e) } })
  return { routeAttachment, inspectZip, async readOwned(id, userId) { const row = (await pool.query("SELECT * FROM chat_attachments WHERE public_id=$1 AND user_id=$2", [id, userId])).rows[0]; return row ? { ...publicRow(row), buffer: await readFile(row.storage_ref) } : null } }
}
