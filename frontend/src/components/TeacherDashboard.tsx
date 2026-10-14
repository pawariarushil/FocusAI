import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { dash, fmtChange, fmtMinutes } from "../dashApi";
import type { CohortAnalytics } from "../dashApi";
import { DaysSelect, DistractionChart, DistributionChart, FocusTrend, MinutesChart, StatCard } from "./charts";

function CohortCard({ c, onChanged }: { c: CohortAnalytics; onChanged: () => void }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const r = await dash.addStudent(c.cohort_id, email.trim());
      setMsg(`Added. This cohort now has ${r.student_count} students.`);
      setEmail("");
      onChanged();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not add student");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="d-card">
      <h3>{c.name}</h3>
      <p className="d-hint">{c.description ? `${c.description} · ` : ""}{c.student_count} students</p>
      {c.suppressed ? (
        <div className="d-alert">{c.message}</div>
      ) : (
        <>
          <div className="d-grid">
            <StatCard label="Avg focus" value={c.summary.avg_focus} hint={fmtChange(c.focus_change_vs_previous_week)} />
            <StatCard label="Avg study time / student"
              value={c.avg_study_minutes_per_student === null ? null : fmtMinutes(c.avg_study_minutes_per_student)} />
            <StatCard label="Active students (7d)" value={c.active_students_7d} />
            <StatCard label="Distractions" value={c.summary.distractions} />
          </div>
          <h4>Average focus by day</h4>
          <FocusTrend data={c.trend} />
          <h4>Study minutes by day (whole cohort)</h4>
          <MinutesChart data={c.trend} />
          <h4>Distraction trend</h4>
          <DistractionChart data={c.trend} />
          <h4>How students' average focus is spread</h4>
          <DistributionChart data={c.focus_distribution} />
        </>
      )}
      <form className="d-row" onSubmit={add}>
        <input className="d-input" type="email" placeholder="Add a student by email" value={email} required
          onChange={(e) => setEmail(e.target.value)} />
        <button className="d-btn ghost" disabled={busy} type="submit">Add student</button>
      </form>
      {msg && <p className="d-hint">{msg}</p>}
    </section>
  );
}

export default function TeacherDashboard() {
  const [days, setDays] = useState(14);
  const [cohorts, setCohorts] = useState<CohortAnalytics[] | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let cancelled = false;
    dash.cohorts(days)
      .then((d) => { if (!cancelled) { setCohorts(d); setError(""); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [days, tick]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    try {
      await dash.createCohort(name.trim(), desc.trim());
      setName("");
      setDesc("");
      setTick((t) => t + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create cohort");
    }
  }

  return (
    <div className="d-wrap">
      <div className="d-row"><h2 style={{ margin: 0 }}>Teacher dashboard</h2><DaysSelect value={days} onChange={setDays} /></div>
      <p className="d-hint">
        You see anonymized cohort-level numbers only: no student names, emails or browsing history. Cohorts with
        fewer than 3 students stay hidden to protect privacy.
      </p>

      <form className="d-card" onSubmit={create}>
        <h3>New cohort</h3>
        <div className="d-row">
          <input className="d-input" placeholder="Cohort name" value={name} required onChange={(e) => setName(e.target.value)} />
          <input className="d-input" placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <button className="d-btn" type="submit">Create</button>
        </div>
        {formError && <div className="d-error">{formError}</div>}
      </form>

      {error && <div className="d-error">{error}</div>}
      {!cohorts && !error && <p className="d-hint">Loading cohorts...</p>}
      {cohorts && cohorts.length === 0 && <p className="d-hint">No cohorts yet. Create one above.</p>}
      {cohorts?.map((c) => <CohortCard key={c.cohort_id} c={c} onChanged={() => setTick((t) => t + 1)} />)}
    </div>
  );
}