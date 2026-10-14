import { useEffect, useState } from "react";
import { dash, fmtChange, fmtDate, fmtMinutes } from "../dashApi";
import type { Prediction, StudentOverview } from "../dashApi";
import { DaysSelect, DecayChart, DistractionChart, FocusTrend, Insights, MinutesChart, StatCard } from "./charts";

export default function StudentDashboard() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<StudentOverview | null>(null);
  const [error, setError] = useState("");
  const [pred, setPred] = useState<Prediction | null>(null);
  const [predError, setPredError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dash.student(days)
      .then((d) => { if (!cancelled) { setData(d); setError(""); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [days]);

  async function predict() {
    const id = data?.recent_sessions[0]?.id;
    if (!id) { setPredError("Start a study session first."); return; }
    setBusy(true);
    setPredError("");
    try {
      setPred(await dash.predict(id));
    } catch (e) {
      setPredError(e instanceof Error ? e.message : "Prediction failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="d-error">{error}</div>;
  if (!data) return <p className="d-hint">Loading your dashboard...</p>;
  const s = data.summary;

  return (
    <div className="d-wrap">
      <div className="d-row"><h2 style={{ margin: 0 }}>My dashboard</h2><DaysSelect value={days} onChange={setDays} /></div>

      <div className="d-grid">
        <StatCard label="Avg focus score" value={s.avg_focus} hint={fmtChange(data.focus_change_vs_previous_week)} />
        <StatCard label="Productivity score" value={s.avg_productivity} />
        <StatCard label="Study time" value={fmtMinutes(s.study_minutes)} />
        <StatCard label="Distractions" value={s.distractions} />
        <StatCard label="Blocked pages" value={data.blocked_count} />
        <StatCard label="Tab switches" value={s.tab_switches} />
      </div>

      <Insights items={data.insights} />

      <div className="d-card"><h3>Focus score by day</h3><FocusTrend data={data.trend} /></div>
      <div className="d-card"><h3>Study minutes by day</h3><MinutesChart data={data.trend} /></div>
      <div className="d-card"><h3>Distractions by day</h3><DistractionChart data={data.trend} /></div>

      <div className="d-card">
        <h3>Focus Decay Curve</h3>
        <p className="d-hint">Predicts your focus for the next 5 activity windows from your latest session.</p>
        <button className="d-btn" onClick={predict} disabled={busy}>{busy ? "Predicting..." : "Predict my focus"}</button>
        {predError && <div className="d-error">{predError}</div>}
        {pred ? (
          <>
            <div className={pred.alert ? "d-alert" : "d-ok"}>{pred.message}</div>
            <DecayChart current={pred.current_focus} curve={pred.curve} />
            <p className="d-hint">{pred.model_note}</p>
          </>
        ) : data.focus_decay ? (
          <>
            <p className="d-hint">Last saved prediction ({fmtDate(data.focus_decay.created_at)})</p>
            <DecayChart curve={data.focus_decay.curve} />
          </>
        ) : null}
      </div>

      <div className="d-card">
        <h3>Recent sessions</h3>
        {data.recent_sessions.length === 0 ? <p className="d-hint">No sessions yet.</p> : (
          <table className="d-table">
            <thead><tr><th>Title</th><th>Started</th><th>Avg focus</th></tr></thead>
            <tbody>
              {data.recent_sessions.map((r) => (
                <tr key={r.id}><td>{r.title}</td><td>{fmtDate(r.start_time)}</td><td>{r.avg_focus ?? "–"}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="d-card">
        <h3>Relevance history</h3>
        {data.relevance_history.length === 0 ? <p className="d-hint">No analyzed pages in this period.</p> : (
          <table className="d-table">
            <thead><tr><th>Page</th><th>Relevance</th><th>Decision</th></tr></thead>
            <tbody>
              {data.relevance_history.map((h, i) => (
                <tr key={i}>
                  <td>{h.title || h.url}</td>
                  <td>{Math.round(h.relevance_score)}%</td>
                  <td><span className={`d-badge ${h.decision.toLowerCase()}`}>{h.decision}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}