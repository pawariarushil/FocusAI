import { useEffect, useState } from "react";
import { api } from "./api";
import type { EngineInfo } from "./api";
import { auth, clearToken, getToken } from "./dashApi";
import type { AuthUser } from "./dashApi";
import Analyzer from "./components/Analyzer";
import SessionSetup from "./components/SessionSetup";
import AuthScreen from "./components/AuthScreen";
import StudentDashboard from "./components/StudentDashboard";
import TeacherDashboard from "./components/TeacherDashboard";
import AdminDashboard from "./components/AdminDashboard";
import "./App.css";
import "./dashboard.css";
export interface ActiveSession { sessionId: string; topic: string; objectives: string; keywords: string[] }

const STORAGE_KEY = "focusai_active_session";

function loadActive(): ActiveSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return parsed?.sessionId ? { objectives: "", keywords: [], ...parsed } : null;
  } catch {
    return null;
  }
}

// Forget the local study session (and tell the extension) so the next person to log in starts clean.
function endLocalSession() {
  localStorage.removeItem(STORAGE_KEY);
  window.postMessage({ type: "FOCUSAI_SESSION_ENDED" }, window.location.origin);
}

function BackendStatus() {
  const [text, setText] = useState("Connecting to backend...");
  const [online, setOnline] = useState(false);
  useEffect(() => {
    api.health()
      .then((d) => { setText(`${d.service} is ${d.status}`); setOnline(true); })
      .catch(() => { setText("Unable to connect to FocusAI backend"); setOnline(false); });
  }, []);
  return <span className={`status ${online ? "up" : "down"}`}>{text}</span>;
}

function StudentShell({ user }: { user: AuthUser }) {
  const [tab, setTab] = useState<"session" | "analyze" | "dashboard">("session");
  const [active, setActive] = useState<ActiveSession | null>(loadActive);
  const [engine, setEngine] = useState<EngineInfo | null>(null);

  useEffect(() => {
    api.engine().then(setEngine).catch(() => setEngine(null));
  }, []);

  // Keep the Chrome extension in sync with the active study session.
  useEffect(() => {
    if (active) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      window.postMessage({ type: "FOCUSAI_SESSION", sessionId: active.sessionId, topic: active.topic }, window.location.origin);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      window.postMessage({ type: "FOCUSAI_SESSION_ENDED" }, window.location.origin);
    }
  }, [active]);

  return (
    <>
      {engine && (
        <p className="muted small">
          Embeddings: <code>{engine.embedding_backend}</code> · LLM reviewer: {engine.llm_enabled ? "on" : "off"} ·
          allow ≥ {engine.allow_threshold}%, warn ≥ {engine.warn_threshold}%
        </p>
      )}
      <nav className="tabs">
        <button className={tab === "session" ? "active" : ""} onClick={() => setTab("session")}>Study session</button>
        <button className={tab === "analyze" ? "active" : ""} onClick={() => setTab("analyze")}>Analyze content</button>
        <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>My dashboard</button>
      </nav>
      {tab === "session" ? (
        <SessionSetup student={user} active={active} onStart={setActive} onEnd={() => setActive(null)} />
      ) : tab === "analyze" ? (
        <Analyzer active={active} />
      ) : (
        <StudentDashboard />
      )}
    </>
  );
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState<boolean>(() => getToken() !== null);

  useEffect(() => {
    if (getToken() === null) return;
    auth.me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const onLogout = () => { clearToken(); endLocalSession(); setUser(null); };
    window.addEventListener("focusai-logout", onLogout);
    return () => window.removeEventListener("focusai-logout", onLogout);
  }, []);

  function logout() {
    clearToken();
    endLocalSession();
    setUser(null);
  }

  return (
    <div className="app">
      <header>
        <h1>FocusAI</h1>
        <BackendStatus />
        {user && (
          <div className="d-userbar">
            <span>{user.full_name} <em className="d-badge">{user.role}</em></span>
            <button className="d-btn ghost" onClick={logout}>Log out</button>
          </div>
        )}
      </header>
      {checking ? (
        <p className="d-hint">Checking your login...</p>
      ) : !user ? (
        <AuthScreen onAuth={setUser} />
      ) : user.role === "ADMIN" ? (
        <AdminDashboard />
      ) : user.role === "TEACHER" ? (
        <TeacherDashboard />
      ) : (
        <StudentShell user={user} />
      )}
    </div>
  );
}

export default App;