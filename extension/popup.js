const DEFAULTS = { backendUrl: "http://127.0.0.1:8000", enabled: true, sessionId: "", topic: "" };
const $ = (id) => document.getElementById(id);

async function loadSessions(cfg) {
  const select = $("session");
  select.replaceChildren(new Option("\u2014 no active session \u2014", ""));
  try {
    const { token } = await chrome.storage.session.get("token");
    const resp = await fetch(`${cfg.backendUrl}/api/sessions`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (resp.status === 401) {
      $("session-hint").textContent = "Log in to the FocusAI web app first, then reopen this popup.";
      return;
    }
    if (!resp.ok) throw new Error(resp.status);
    for (const s of await resp.json()) {
      const topic = s.study_context ? s.study_context.topic : s.title;
      select.add(new Option(`${s.title} \u2014 ${topic}`, s.id));
      select.lastChild.dataset.topic = topic;
    }
    if (cfg.sessionId && !Array.from(select.options).some((o) => o.value === cfg.sessionId)) {
      select.add(new Option(`Session ${cfg.sessionId.slice(0, 8)}\u2026 (${cfg.topic || "unknown"})`, cfg.sessionId));
    }
    select.value = cfg.sessionId;
  } catch (_) {
    $("session-hint").textContent = "Cannot reach the backend \u2014 is it running?";
  }
}

async function showTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const state = await chrome.runtime.sendMessage({ type: "GET_TAB_STATE", tabId: tab.id });
  if (!state) return;
  const r = state.result;
  $("tab-state").hidden = false;
  const badge = document.createElement("span");
  badge.className = `badge ${r.decision}`;
  badge.textContent = `${r.decision} \u00b7 ${Math.round(r.relevance_score)}%`;
  $("tab-decision").replaceChildren(badge);
  $("tab-explanation").textContent = r.explanation;
  $("tab-concepts").replaceChildren(...r.matching_concepts.slice(0, 6).map((c) => Object.assign(document.createElement("span"), { className: "chip", textContent: c })));
}

(async () => {
  const cfg = await chrome.storage.local.get(DEFAULTS);
  $("enabled").checked = cfg.enabled;
  $("backend").value = cfg.backendUrl;
  await loadSessions(cfg);
  await showTab();

  $("enabled").addEventListener("change", (e) => chrome.storage.local.set({ enabled: e.target.checked }));
  $("session").addEventListener("change", (e) => {
    const opt = e.target.selectedOptions[0];
    chrome.runtime.sendMessage({ type: "SET_SESSION", sessionId: e.target.value, topic: (opt && opt.dataset.topic) || "" });
  });
  $("save").addEventListener("click", async () => {
    const backendUrl = $("backend").value.replace(/\/+$/, "") || DEFAULTS.backendUrl;
    await chrome.storage.local.set({ backendUrl });
    $("status").textContent = "Saved.";
    loadSessions({ ...cfg, backendUrl });
  });
  $("test").addEventListener("click", async () => {
    try {
      const resp = await fetch(`${$("backend").value.replace(/\/+$/, "")}/api/health`);
      const data = await resp.json();
      $("status").textContent = `Connected: ${data.service} is ${data.status}.`;
    } catch (_) {
      $("status").textContent = "Could not connect. Start the backend and check the URL.";
    }
  });
})();
