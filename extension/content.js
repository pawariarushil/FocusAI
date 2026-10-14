// FocusAI content script: extracts the page, asks the backend for a decision, shows the overlay.
(() => {
  if (window.__focusaiLoaded) return;
  window.__focusaiLoaded = true;

  const BLOCK_SELECTOR = "p, h1, h2, h3, h4, li, blockquote";
  const SKIP_ANCESTORS = "nav, header, footer, aside, form, [aria-hidden='true'], #focusai-host";
  let lastUrl = null;
  let pauseTimer = null;
  let heatmapOn = false;
  const heatBackup = new Map();

  // ---------- extraction ----------
  const isYouTube = () => /(^|\.)youtube\.com$/.test(location.hostname);
  const isYouTubeVideo = () => isYouTube() && (location.pathname === "/watch" || location.pathname.startsWith("/shorts/"));

  // ---------- YouTube: extract the individual video (title, description, channel, hashtags) ----------
  // The transcript is fetched by the backend from the video id: caption URLs in the page are signed and
  // short-lived, so reading them from a content script is unreliable. Every step here is best-effort.
  const normalizeText = (s) =>
    (s || "")
      .replace(/https?:\/\/\S+|www\.\S+/g, " ")
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
      .replace(/(\.\.\.more|Show more|Show less|…more)\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

  const textOf = (selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const t = el && (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t) return t;
    }
    return "";
  };

  function youTubeVideoId() {
    if (location.pathname === "/watch") return new URLSearchParams(location.search).get("v") || "";
    const m = location.pathname.match(/^\/shorts\/([^/?]+)/);
    return m ? m[1] : "";
  }

  // <meta> tags are NOT refreshed on YouTube's in-page navigation, so only trust them when the
  // canonical URL still points at the current video.
  function metaMatchesVideo(id) {
    const canon = document.querySelector("link[rel='canonical']");
    return !!(canon && id && canon.href.includes(id));
  }

  function youTubeTitle(id) {
    const dom = textOf(["ytd-watch-metadata h1", "h1.ytd-watch-metadata", "h1.slim-video-information-title", "ytd-reel-video-renderer[is-active] h2"]);
    if (dom) return dom;
    if (metaMatchesVideo(id)) {
      const m = document.querySelector("meta[name='title'], meta[property='og:title']");
      if (m && m.content) return m.content;
    }
    return document.title.replace(/^\(\d+\)\s*/, "").replace(/ - YouTube$/, "");
  }

  function youTubeDescription(id) {
    const dom = textOf(["ytd-watch-metadata #description-inner", "#description-inline-expander", "ytd-text-inline-expander", "#description"]);
    if (dom) return dom;
    if (metaMatchesVideo(id)) {
      const m = document.querySelector("meta[name='description'], meta[property='og:description']");
      if (m && m.content) return m.content;
    }
    return "";
  }

  function youTubeDomReady(id) {
    const flexy = document.querySelector("ytd-watch-flexy");
    const shown = flexy && flexy.getAttribute("video-id");
    if (shown && shown !== id) return false; // still showing the previous video
    const t = youTubeTitle(id).replace(/^\(\d+\)\s*/, "").trim().toLowerCase();
    return !!t && t !== "youtube";
  }

  async function waitFor(predicate, timeoutMs, stepMs, cancelled) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (cancelled()) return false;
      try { if (predicate()) return true; } catch (_) { /* keep waiting */ }
      await new Promise((r) => setTimeout(r, stepMs));
    }
    return false; // proceed anyway: the backend knows the authoritative title
  }

  async function buildYouTubePayload(url, cancelled) {
    const id = youTubeVideoId();
    await waitFor(() => youTubeDomReady(id), 3500, 250, cancelled);
    let metadata = { video_id: id };
    let title = "";
    try {
      title = normalizeText(youTubeTitle(id));
      const hashtags = Array.from(document.querySelectorAll("ytd-watch-metadata a[href^='/hashtag/']"))
        .map((a) => (a.textContent || "").replace(/^#/, "").trim()).filter(Boolean).slice(0, 10);
      metadata = {
        video_id: id,
        description: normalizeText(youTubeDescription(id)).slice(0, 2000),
        channel: textOf(["ytd-watch-metadata ytd-channel-name a", "#owner ytd-channel-name a", "ytd-video-owner-renderer a"]).slice(0, 200),
        keywords: hashtags,
      };
    } catch (_) { /* extraction must never throw: fall back to whatever we have */ }
    return { url, title, text: "", metadata };
  }

  function extractText() {
    const root = document.querySelector("article") || document.querySelector("main") || document.body;
    const parts = [];
    root.querySelectorAll(BLOCK_SELECTOR).forEach((el) => {
      if (el.closest(SKIP_ANCESTORS) || (["LI", "BLOCKQUOTE"].includes(el.tagName) && el.querySelector("p, li"))) return;
      const t = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (!t || (el.tagName !== "H1" && t.split(" ").length < 3)) return;
      parts.push(/[.!?:;"\u201d)]$/.test(t) ? t : t + ".");
    });
    let text = parts.join(" ");
    if (text.length < 200) text = (document.body.innerText || "").replace(/\s+/g, " ").trim();
    return text.slice(0, 30000);
  }

  function pageTitle() {
    return isYouTube() ? document.title.replace(/^\(\d+\)\s*/, "").replace(/ - YouTube$/, "") : document.title;
  }

  // ---------- tiny DOM helper (all text via textContent: page/backend text is never parsed as HTML) ----------
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    kids.flat().forEach((c) => c != null && el.append(c));
    return el;
  }

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(15,23,42,.94); display: flex; align-items: center; justify-content: center; color: #0f172a; }
    .card { background: #fff; border-radius: 16px; padding: 28px; width: min(560px, 92vw); max-height: 90vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
    .toast { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: min(380px, 92vw); background: #fff; color: #0f172a; border-radius: 14px; padding: 14px 16px; box-shadow: 0 10px 40px rgba(0,0,0,.28); border-left: 6px solid var(--c); }
    .pill { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; background: #16a34a; color: #fff; border-radius: 999px; padding: 8px 14px; font-size: 13px; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.25); }
    h2 { margin: 0 0 6px; font-size: 20px; } .toast h2 { font-size: 15px; }
    .score { font-weight: 700; color: var(--c); }
    p { margin: 8px 0; font-size: 14px; line-height: 1.45; } .toast p { font-size: 13px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    .chip { background: #eef2ff; color: #3730a3; border-radius: 999px; padding: 2px 10px; font-size: 12px; }
    ul { margin: 6px 0 0 18px; padding: 0; font-size: 13px; color: #475569; }
    .row { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
    button { cursor: pointer; border: 0; border-radius: 10px; padding: 9px 14px; font-size: 14px; font-weight: 600; }
    .primary { background: #4f46e5; color: #fff; } .ghost { background: #e2e8f0; color: #0f172a; }
    .legend { font-size: 11px; color: #64748b; margin-top: 8px; }
    .brand { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
  `;

  const COLORS = { ALLOW: "#16a34a", WARN: "#d97706", BLOCK: "#dc2626" };
  let hostEl = null;

  function mount(...nodes) {
    unmount();
    hostEl = h("div", { id: "focusai-host" });
    const root = hostEl.attachShadow({ mode: "closed" });
    root.append(h("style", {}, STYLE), ...nodes);
    document.documentElement.append(hostEl);
  }

  function unmount() {
    if (hostEl) hostEl.remove();
    hostEl = null;
    clearInterval(pauseTimer);
    document.documentElement.style.removeProperty("overflow");
  }

  function details(r, includeHeatmapButton) {
    const nodes = [];
    nodes.push(h("p", {}, r.explanation));
    if (r.matching_concepts.length) {
      nodes.push(h("div", { class: "chips" }, r.matching_concepts.slice(0, 6).map((c) => h("span", { class: "chip" }, c))));
    }
    if (r.reasons.length) nodes.push(h("ul", {}, r.reasons.slice(0, 4).map((x) => h("li", {}, x))));
    if (includeHeatmapButton && r.heatmap.length) {
      nodes.push(h("div", { class: "legend" }, "Heatmap: green = relevant, yellow = partly, red = unrelated passages"));
    }
    return nodes;
  }

  // ---------- UI states ----------
  function showBlock(r, payload) {
    const color = COLORS.BLOCK;
    const card = h("div", { class: "card", style: `--c:${color}` },
      h("div", { class: "brand" }, "FocusAI"),
      h("h2", {}, "This page looks like a distraction"),
      h("p", {}, h("span", { class: "score" }, `${Math.round(r.relevance_score)}% relevant`), " to your current study goal."),
      ...details(r, false),
      h("div", { class: "row" },
        h("button", { class: "primary", onclick: goBack }, "Go back to studying"),
        h("button", { class: "ghost", onclick: () => proceed(payload) }, "Continue anyway (logged)"),
      ),
    );
    mount(h("div", { class: "overlay" }, card));
    document.documentElement.style.setProperty("overflow", "hidden");
    const pause = () => document.querySelectorAll("video, audio").forEach((m) => { try { m.pause(); } catch (_) {} });
    pause();
    pauseTimer = setInterval(pause, 500);
  }

  function showToast(r, decision) {
    const color = COLORS[decision];
    const title = decision === "WARN" ? "Only partly related to your goal" : "On topic";
    const toast = h("div", { class: "toast", style: `--c:${color}` },
      h("h2", {}, title, " \u2014 ", h("span", { class: "score" }, `${Math.round(r.relevance_score)}%`)),
      ...details(r, true),
      h("div", { class: "row" },
        r.heatmap.length ? h("button", { class: "primary", onclick: () => toggleHeatmap(r.heatmap) }, "Toggle heatmap") : "",
        h("button", { class: "ghost", onclick: unmount }, "Dismiss"),
      ),
    );
    mount(toast);
  }

  function showPill(r) {
    const pill = h("div", { class: "pill", onclick: () => showToast(r, "ALLOW") }, `FocusAI \u2713 ${Math.round(r.relevance_score)}% relevant`);
    mount(pill);
    setTimeout(() => { if (hostEl && pill.isConnected) unmount(); }, 4500);
  }

  function goBack() {
    unmount();
    if (history.length > 1) history.back();
    else location.href = "about:blank";
  }

  async function proceed(payload) {
    try { await chrome.runtime.sendMessage({ type: "OVERRIDE", payload }); } catch (_) { /* logging is best-effort */ }
    unmount();
  }

  // ---------- in-page relevance heatmap (element-level shading from sentence scores) ----------
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

  function toggleHeatmap(heatmap) {
    if (heatmapOn) {
      heatBackup.forEach((prev, el) => el.style.setProperty("background-color", prev || "", prev ? "important" : ""));
      heatBackup.clear();
      heatmapOn = false;
      return;
    }
    const snippets = heatmap.filter((s) => s.text.length > 20).map((s) => ({ key: norm(s.text).slice(0, 60), score: s.score }));
    document.querySelectorAll(BLOCK_SELECTOR).forEach((el) => {
      if (el.closest(SKIP_ANCESTORS)) return;
      const text = norm(el.innerText || "");
      let best = null;
      for (const s of snippets) if (text.includes(s.key)) best = Math.max(best ?? 0, s.score);
      if (best == null) return;
      const color = best >= 60 ? "rgba(34,197,94,.30)" : best >= 30 ? "rgba(250,204,21,.34)" : "rgba(239,68,68,.16)";
      heatBackup.set(el, el.style.getPropertyValue("background-color"));
      el.style.setProperty("background-color", color, "important");
    });
    heatmapOn = true;
  }

  // ---------- Phase 7: activity tracking (hostname only, never full URLs or page text) ----------
  let trackDecision = null;
  let trackHost = "";
  let visibleSecs = 0;
  let lastClick = 0;
  let lastScroll = 0;

  function track(event_type, metadata = {}) {
    try {
      const p = chrome.runtime.sendMessage({ type: "TRACK", events: [{ event_type, metadata }] });
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* extension reloaded: ignore */ }
  }

  function flushDwell() {
    if (trackDecision && visibleSecs >= 1) {
      track("dwell_time", { seconds: visibleSecs, decision: trackDecision, host: trackHost });
    }
    visibleSecs = 0;
  }

  setInterval(() => {
    if (trackDecision && document.visibilityState === "visible" && document.hasFocus()) visibleSecs += 1;
  }, 1000);
  setInterval(flushDwell, 15000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushDwell(); });
  window.addEventListener("pagehide", flushDwell);
  document.addEventListener("click", () => {
    const n = Date.now();
    if (trackDecision && n - lastClick > 5000) { lastClick = n; track("click"); }
  }, true);
  document.addEventListener("scroll", () => {
    const n = Date.now();
    if (trackDecision && n - lastScroll > 5000) { lastScroll = n; track("scroll"); }
  }, { capture: true, passive: true });
  // ---------- main flow ----------
  let runId = 0;
  async function run() {
    const url = location.href.split("#")[0];
    if (url === lastUrl) return;
    lastUrl = url;
    flushDwell();
    trackDecision = null;
    const myRun = ++runId; // a newer navigation invalidates this run
    const stale = () => myRun !== runId || location.href.split("#")[0] !== url;
    unmount();
    heatBackup.forEach((prev, el) => el.style.removeProperty("background-color"));
    heatBackup.clear();
    heatmapOn = false;

    // YouTube home/search/channel pages are navigation hubs: judge the individual videos, not the site.
    if (isYouTube() && !isYouTubeVideo()) return;

    let payload;
    try {
      payload = isYouTube() ? await buildYouTubePayload(url, stale) : { url, title: pageTitle(), text: extractText() };
    } catch (_) {
      return; // extraction failed: stay out of the way
    }
    if (stale()) return;

    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "ANALYZE_PAGE", payload });
    } catch (_) {
      return; // extension reloaded or service worker unavailable: fail open
    }
    if (!res || !res.result || stale()) return; // skipped, failed (fail-open) or navigated away

    const r = res.result;
    trackDecision = r.decision;
    trackHost = location.hostname;
    if (r.decision === "BLOCK") showBlock(r, payload);
    else if (r.decision === "WARN") showToast(r, "WARN");
    else showPill(r);
  }

  // Single-page apps (YouTube etc.) change the URL without reloading.
  // The poller only schedules a URL that is not already scheduled: otherwise a delay longer than the
  // poll interval (YouTube waits 1.5s for its DOM) would be pushed back forever and never run.
  const currentUrl = () => location.href.split("#")[0];
  let debounce = null;
  let scheduledUrl = null;
  const schedule = (delay) => {
    scheduledUrl = currentUrl();
    clearTimeout(debounce);
    debounce = setTimeout(run, delay);
  };
  schedule(isYouTube() ? 1500 : 300);
  window.addEventListener("yt-navigate-finish", () => schedule(1200));
  document.addEventListener("yt-navigate-finish", () => schedule(1200));
  window.addEventListener("popstate", () => schedule(800));
  setInterval(() => {
    const cur = currentUrl();
    if (cur !== lastUrl && cur !== scheduledUrl) schedule(isYouTube() ? 1500 : 600);
  }, 1000);
})();
