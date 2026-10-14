import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { CurvePoint, TrendPoint } from "../dashApi";

const AXIS = "#94a3b8";
const GRID = "#334155";
const tip = {
  contentStyle: { background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" },
};
const margin = { top: 8, right: 12, left: -12, bottom: 0 };
const shortDate = (d: string) => d.slice(5);

export function StatCard({ label, value, hint }: { label: string; value: string | number | null; hint?: string }) {
  return (
    <div className="d-card stat">
      <div className="d-label">{label}</div>
      <div className="d-value">{value ?? "–"}</div>
      {hint && <div className="d-hint">{hint}</div>}
    </div>
  );
}

export function Insights({ items }: { items: string[] }) {
  return (
    <div className="d-card">
      <h3>Personalized insights</h3>
      <ul className="d-list">{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

export function DaysSelect({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <select className="d-input" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {[7, 14, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
    </select>
  );
}

export function FocusTrend({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={margin}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={shortDate} stroke={AXIS} fontSize={12} />
        <YAxis domain={[0, 100]} stroke={AXIS} fontSize={12} />
        <Tooltip {...tip} />
        <Line type="monotone" dataKey="avg_focus" name="Avg focus" stroke="#818cf8"
          strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MinutesChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={margin}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={shortDate} stroke={AXIS} fontSize={12} />
        <YAxis stroke={AXIS} fontSize={12} />
        <Tooltip {...tip} />
        <Bar dataKey="study_minutes" name="Study minutes" fill="#34d399" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DistractionChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={margin}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={shortDate} stroke={AXIS} fontSize={12} />
        <YAxis stroke={AXIS} fontSize={12} />
        <Tooltip {...tip} />
        <Bar dataKey="distractions" name="Distractions" fill="#f87171" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DistributionChart({ data }: { data: { range: string; students: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={margin}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="range" stroke={AXIS} fontSize={12} />
        <YAxis allowDecimals={false} stroke={AXIS} fontSize={12} />
        <Tooltip {...tip} />
        <Bar dataKey="students" name="Students" fill="#818cf8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DecayChart({ current, curve }: { current?: number | null; curve: CurvePoint[] }) {
  const points = curve.map((c) => ({ window: c.window, predicted: c.predicted, band: [c.lower, c.upper] }));
  const data = current == null ? points : [{ window: 0, predicted: current, band: [current, current] }, ...points];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={margin}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="window" stroke={AXIS} fontSize={12} tickFormatter={(w: number) => (w === 0 ? "now" : `+${w}`)} />
        <YAxis domain={[0, 100]} stroke={AXIS} fontSize={12} />
        <Tooltip {...tip} />
        <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="4 4"
          label={{ value: "alert level", fill: "#f59e0b", fontSize: 11, position: "insideTopRight" }} />
        <Area type="monotone" dataKey="band" name="Likely range" stroke="none" fill="#6366f1" fillOpacity={0.22} />
        <Line type="monotone" dataKey="predicted" name="Predicted focus" stroke="#a5b4fc" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}