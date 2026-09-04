(function () {
  "use strict";
  let active = null;
  let stopping = false;
  const terminal = new Set(["completed", "partially_completed", "blocked", "failed", "cancelled"]);
  const auth = () => {
    try { const token = JSON.parse(localStorage.getItem("xdx_auth") || "null")?.token; return token ? { Authorization: `Bearer ${token}` } : {}; }
    catch { return {}; }
  };
  const format = (milliseconds) => {
    const seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  async function refreshRun() {
    try {
      const serversResponse = await fetch("/api/servers", { headers: auth() });
      if (!serversResponse.ok) return;
      const servers = await serversResponse.json();
      const contexts = await Promise.all(servers.map(async (server) => {
        const response = await fetch(`/api/servers/${server.id}/agent-context`, { headers: auth() });
        return response.ok ? response.json() : null;
      }));
      active = contexts.find((context) => context?.run && !terminal.has(context.run.status)) || null;
      if (!active) stopping = false;
    } catch {}
  }
  async function stop() {
    if (!active?.run?.task_id || stopping) return;
    stopping = true;
    render();
    try {
      await fetch(`/api/servers/${active.server.id}/tasks/${active.run.task_id}/cancel`, { method: "POST", headers: { ...auth(), "Content-Type": "application/json" }, body: "{}" });
      await refreshRun();
      window.dispatchEvent(new CustomEvent("xd:run_completed", { detail: { serverId: active?.server?.id, status: "cancelled" } }));
    } finally { stopping = false; render(); }
  }
  function render() {
    const input = [...document.querySelectorAll("textarea")].find((node) => /agent is working|ask me to fix|reply, ask/i.test(node.placeholder || ""));
    let bar = document.getElementById("xd-server-run-control");
    if (!active || !input) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "xd-server-run-control";
      bar.style.cssText = "display:flex;align-items:center;gap:12px;margin-bottom:8px;padding:8px 10px;border:1px solid rgba(239,68,68,.35);border-radius:8px;background:rgba(24,24,27,.92);font:12px system-ui;color:#e4e4e7";
      input.parentElement?.parentElement?.insertBefore(bar, input.parentElement);
    }
    const started = Date.parse(active.run.started_at || new Date().toISOString());
    const elapsed = active.run.finished_at ? Number(active.run.elapsed_ms) : Date.now() - started;
    const target = `${active.server.name} · ${active.server.username}@${active.server.host}:${active.server.port}`;
    bar.innerHTML = `<span style="flex:1"><strong>${stopping ? "Stopping…" : "Working"} · ${format(elapsed)}</strong><br><span style="color:#a1a1aa">${target}${active.run.current_step ? ` · ${String(active.run.current_step).replace(/[<>]/g, "")}` : ""}</span></span>`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = stopping ? "Stopping…" : "Stop";
    button.disabled = stopping;
    button.style.cssText = "padding:7px 14px;border-radius:7px;border:1px solid #ef4444;background:#7f1d1d;color:white;font-weight:700;cursor:pointer";
    button.onclick = stop;
    bar.appendChild(button);
  }
  setInterval(render, 1000);
  setInterval(refreshRun, 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshRun(); });
  refreshRun();
})();
