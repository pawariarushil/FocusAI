import { useState } from "react";
import type { FormEvent } from "react";
import { auth } from "../dashApi";
import type { AuthUser } from "../dashApi";

export default function AuthScreen({ onAuth }: { onAuth: (u: AuthUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"STUDENT" | "TEACHER">("STUDENT");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = mode === "login"
        ? await auth.login(email.trim(), password)
        : await auth.register(email.trim(), name.trim(), password, role);
      onAuth(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="d-card auth-card" onSubmit={submit}>
      <h3>{mode === "login" ? "Log in to FocusAI" : "Create your account"}</h3>
      {mode === "register" && (
        <input className="d-input" placeholder="Full name" value={name} required
          autoComplete="name" onChange={(e) => setName(e.target.value)} />
      )}
      <input className="d-input" type="email" placeholder="Email" value={email} required
        autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
      <input className="d-input" type="password" placeholder="Password (at least 8 characters)" value={password}
        required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"}
        onChange={(e) => setPassword(e.target.value)} />
      {mode === "register" && (
        <select className="d-input" value={role} onChange={(e) => setRole(e.target.value as "STUDENT" | "TEACHER")}>
          <option value="STUDENT">I am a student</option>
          <option value="TEACHER">I am a teacher</option>
        </select>
      )}
      {error && <div className="d-error">{error}</div>}
      <button className="d-btn" disabled={busy} type="submit">
        {busy ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
      </button>
      <button className="d-btn ghost" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
        {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
      </button>
      <p className="d-hint">Administrator accounts are created by an administrator, not through sign up.</p>
    </form>
  );
}