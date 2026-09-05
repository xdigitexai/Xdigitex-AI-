const TRANSIENT_DB = /deadlock|serialization|connection|timeout|temporar|ECONNRESET|57P01|40001|40P01/i;

export async function startOrResumeTask(pool, { runId, taskId, owner, semanticKey }, { retries = 2 } = {}) {
  if (!runId || !taskId || !semanticKey) throw Object.assign(new Error("A persisted run, task, and semantic key are required before tool execution"), { code: "ORPHAN_TOOL_CALL" });
  for (let attempt = 0; attempt <= retries; attempt++) {
    const client = await pool.connect();
    let released = false;
    try {
      await client.query("BEGIN");
      const item = await client.query(`SELECT i.id,i.status,i.position,i.title,i.semantic_key FROM agent_task_items i JOIN agent_tasks t ON t.id=i.task_id WHERE i.task_id=$1 AND t.run_id=$2 AND i.semantic_key=$3 FOR UPDATE`, [taskId, runId, semanticKey]);
      if (!item.rowCount) throw Object.assign(new Error(`Task ${semanticKey} does not exist in this run`), { code: "TASK_PERSISTENCE_FAILED" });
      const row = item.rows[0];
      if (["completed", "blocked", "failed", "skipped"].includes(row.status)) throw Object.assign(new Error(`Task ${semanticKey} is already ${row.status}`), { code: "TASK_TRANSITION_FAILED" });
      if (row.status === "pending" || row.status === "created") await client.query("UPDATE agent_task_items SET status='running',started_at=COALESCE(started_at,NOW()),owner=COALESCE(owner,$2),updated_at=NOW() WHERE id=$1", [row.id, owner || "orchestrator"]);
      await client.query("UPDATE coding_agent_runs SET phase='running',metadata=jsonb_set(jsonb_set(metadata,'{currentTaskId}',to_jsonb($2::text),true),'{currentTaskSemanticKey}',to_jsonb($3::text),true),heartbeat_at=NOW(),updated_at=NOW() WHERE id=$1", [runId, String(row.id), semanticKey]);
      if (row.status !== "running") await client.query(`INSERT INTO agent_run_events(run_id,sequence,type,payload) SELECT $1,COALESCE(MAX(sequence),0)+1,'todo.started',$2 FROM agent_run_events WHERE run_id=$1`, [runId, JSON.stringify({ taskId: row.id, taskSemanticKey: semanticKey, owner: owner || "orchestrator", title: row.title })]);
      await client.query("COMMIT");
      return { ...row, status: "running", resumed: row.status === "running" };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {}); client.release(); released = true;
      if (attempt < retries && TRANSIENT_DB.test(String(error?.message ?? error))) continue;
      throw error;
    } finally { if (!released) client.release(); }
  }
}

export async function reconcileRun(pool, runId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const run = await client.query("SELECT id,status,phase,metadata FROM coding_agent_runs WHERE id=$1 FOR UPDATE", [runId]);
    if (!run.rowCount) throw Object.assign(new Error("Run not found"), { code: "RUN_NOT_FOUND" });
    const tools = await client.query("SELECT DISTINCT task_item_id FROM agent_tool_calls WHERE run_id=$1 AND task_item_id IS NOT NULL AND status IN ('running','completed','failed','timeout')", [runId]);
    for (const { task_item_id } of tools.rows) await client.query("UPDATE agent_task_items SET status=CASE WHEN status IN ('created','pending') THEN 'running' ELSE status END,started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=$1", [task_item_id]);
    const active = await client.query(`SELECT i.id,i.semantic_key FROM agent_task_items i JOIN agent_tasks t ON t.id=i.task_id WHERE t.run_id=$1 AND i.status='running' ORDER BY i.position LIMIT 1`, [runId]);
    await client.query("UPDATE coding_agent_runs SET phase=CASE WHEN phase IN ('created','planning','initializing_tasks','compacting','replanning') AND $2::boolean THEN 'running' ELSE phase END,metadata=CASE WHEN $2::boolean THEN jsonb_set(jsonb_set(metadata,'{currentTaskId}',to_jsonb($3::text),true),'{currentTaskSemanticKey}',to_jsonb($4::text),true) ELSE metadata END,updated_at=NOW() WHERE id=$1", [runId, Boolean(active.rowCount), String(active.rows[0]?.id || ""), active.rows[0]?.semantic_key || ""]);
    await client.query("COMMIT"); return { repaired: tools.rowCount, currentTaskId: active.rows[0]?.id || null, currentTaskSemanticKey: active.rows[0]?.semantic_key || null };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export function classifyTaskRuntimeFailure(error, { startupStage, firstToolStartedAt, phase } = {}) {
  const message = String(error?.message ?? error); const code = error?.code;
  if (!firstToolStartedAt && phase !== "running") return { code: code || (startupStage === "task.start" ? "FIRST_TASK_START_FAILED" : "AGENT_STARTUP_FAILED"), stage: startupStage, message, recoverable: TRANSIENT_DB.test(message) };
  return { code: code || (TRANSIENT_DB.test(message) ? "TASK_PERSISTENCE_FAILED" : "TASK_TRANSITION_FAILED"), stage: "running", message, recoverable: TRANSIENT_DB.test(message) || code === "TASK_PERSISTENCE_FAILED" };
}
