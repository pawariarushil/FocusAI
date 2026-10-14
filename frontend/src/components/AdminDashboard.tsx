import { useEffect, useState } from "react";
import { dash, fmtMinutes } from "../dashApi";
import type { AdminOverview } from "../dashApi";
import { DaysSelect, DistractionChart, FocusTrend, MinutesChart, StatCard } from "./charts";

export default function AdminDashboard() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    dash.admin(days)
      .then((d) => { if (!cancelled) { setData(d); setError(""); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [days]);

  if (error) return <div className="d-error">{error}</div>;
  if (!data) return <p className="d-hint">Loading platform analytics...</p>;

  return (
    <div className="d-wrap">
      <div className="d-row"><h2 style={{ margin: 0 }}>Administrator dashboard</h2><DaysSelect value={days} onChange={setDays} /></div>
      <div className="d-grid">
        <StatCard label="Total students" value={data.total_students} />
        <StatCard label="Active teachers" value={data.active_teachers} hint={`${data.total_teachers} teacher accounts`} />
        <StatCard label="Cohorts / courses" value={data.total_cohorts} />
        <StatCard label="Study sessions" value={data.total_sessions} />
        <StatCard label="Active students (7d)" value={data.active_students_7d} />
        <StatCard label="Platform study hours" value={data.platform_study_hours_all_time} hint="all time" />
        <StatCard label="Avg focus" value={data.summary.avg_focus} hint={`last ${data.days} days`} />
        <StatCard label="Study time" value={fmtMinutes(data.summary.study_minutes)} hint={`last ${data.days} days`} />
      </div>
      <div className="d-card"><h3>Platform focus by day</h3><FocusTrend data={data.trend} /></div>
      <div className="d-card"><h3>Platform study minutes</h3><MinutesChart data={data.trend} /></div>
      <div className="d-card"><h3>Platform distraction trend</h3><DistractionChart data={data.trend} /></div>
      <div className="d-card">
        <h3>System health</h3>
        <p>Database: <span className={`d-badge ${data.system.database === "ok" ? "allow" : "block"}`}>{data.system.database}</span></p>
        <p>Focus prediction model:{" "}
          <span className={`d-badge ${data.system.focus_model_trained ? "allow" : "warn"}`}>
            {data.system.focus_model_trained ? "trained" : "not trained"}
          </span>
        </p>
      </div>
    </div>
  );
}