"use client";
import { useEffect, useState } from "react";
import { STATUS_LABEL, TYPE_META } from "@/lib/format";

type Stats = {
  totals: { items: number; completed: number };
  countsByType: Record<string, number>;
  countsByStatus: Record<string, number>;
  avgRating: number | null;
  watched: { episodes: number; hours: number };
  chaptersRead: number;
  completionRate: number;
  genreCount: number;
  topGenres: { name: string; count: number }[];
  monthlyActivity: { month: string; label: string; n: number }[];
};

const PALETTE = [
  "var(--ember)", "var(--anime)", "var(--manga)", "var(--light-novel)",
  "var(--webseries)", "var(--movie)", "var(--book)", "#6d7084",
];

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = end - start <= 180 ? 0 : 1;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  if (!stats) return <p className="pt-24 text-center text-[var(--ink-dim)]">Crunching numbers…</p>;

  const maxType = Math.max(1, ...Object.values(stats.countsByType));
  const maxStatus = Math.max(1, ...Object.values(stats.countsByStatus));
  const totalActivity = stats.monthlyActivity.reduce((s, m) => s + m.n, 0);
  const maxMonth = Math.max(1, ...stats.monthlyActivity.map((m) => m.n));

  // ---- line chart geometry ----
  const W = 640;
  const H = 200;
  const PAD = 14;
  const plotH = H - 44;
  const pts = stats.monthlyActivity.map((m, i) => {
    const x = PAD + (i / (stats.monthlyActivity.length - 1)) * (W - 2 * PAD);
    const y = H - 34 - (m.n / maxMonth) * plotH;
    return { x, y, m };
  });
  const linePoints = pts.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" ");
  const areaPath = "M " + pts[0].x.toFixed(1) + " " + (H - 34) + " L " + pts.map(function (p) { return p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" L ") + " L " + pts[pts.length - 1].x.toFixed(1) + " " + (H - 34) + " Z";

  // ---- donut geometry ----
  const segments = stats.topGenres.slice(0, 6);
  const restCount = stats.topGenres.length > 6 ? stats.topGenres.slice(6).reduce(function (s, g) { return s + g.count; }, 0) : 0;
  const donutData = segments.concat(restCount > 0 ? [{ name: "Other", count: restCount }] : []);
  const donutTotal = donutData.reduce(function (s, g) { return s + g.count; }, 0) || 1;
  const C = 90;
  const R = 72;
  const PAD_ANG = donutData.length > 1 ? 2 : 0;
  let angle = -90;
  const arcs = donutData.map(function (g, i) {
    const sweep = (g.count / donutTotal) * 360;
    const start = angle;
    const end = angle + sweep - PAD_ANG;
    angle += sweep;
    return { g: g, path: arcPath(C, C, R, start, Math.max(start + 0.5, end)), color: PALETTE[i % PALETTE.length] };
  });
  const topGenre = segments[0];

  const hero = [
    { label: "Stories tracked", value: String(stats.totals.items) },
    { label: "Completed", value: String(stats.totals.completed) },
    { label: "Completion rate", value: stats.completionRate + "%" },
    { label: "Episodes watched", value: String(stats.watched.episodes) },
    { label: "Est. time spent", value: stats.watched.hours + "h" },
    { label: "Chapters read", value: String(stats.chaptersRead) },
    { label: "Genres explored", value: String(stats.genreCount) },
    { label: "Avg rating", value: stats.avgRating != null ? stats.avgRating.toFixed(1) : "—" },
  ];

  const showActivity = totalActivity > 0;

  return (
    <div className="space-y-12">
      <header>
        <p className="eyebrow mb-2">YOUR STORIES, MEASURED</p>
        <h1 className="h1-display text-4xl">Stats</h1>
      </header>

      {/* hero metrics */}
      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {hero.map(function (h) {
          return (
            <div key={h.label} className="card card-hover p-4">
              <p className="h1-display text-3xl" style={{ color: "var(--ember)" }}>{h.value}</p>
              <p className="font-mono2 mt-1 text-[10px] uppercase tracking-widest text-[var(--ink-faint)]">{h.label}</p>
            </div>
          );
        })}
      </div>

      {/* activity line chart */}
      <section className="card p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="h2-display text-xl">Activity · last 12 months</h2>
          <span className="badge">{totalActivity} events</span>
        </div>
        {!showActivity ? (
          <p className="mt-6 text-center text-sm text-[var(--ink-faint)]">Activity appears here as you add and update your library.</p>
        ) : (
          <div className="mt-4">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Monthly activity line chart">
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--ember)" stopOpacity="0.34" />
                  <stop offset="100%" stopColor="var(--ember)" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {[0, 0.5, 1].map(function (f) {
                const y = H - 34 - f * plotH;
                return <line key={f} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 5" />;
              })}
              <path d={areaPath} fill="url(#areaGrad)" />
              <polyline points={linePoints} fill="none" stroke="var(--ember)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {pts.map(function (p, i) {
                return (
                  <g key={p.m.month}>
                    <circle cx={p.x} cy={p.y} r={p.m.n > 0 ? 4 : 2} fill={p.m.n > 0 ? "var(--ember)" : "rgba(255,255,255,0.15)"}>
                      <title>{p.m.label}: {p.m.n}</title>
                    </circle>
                    {i % 2 === 0 && <text x={p.x} y={H - 14} textAnchor="middle" fontSize="10" fill="var(--ink-faint)" fontFamily="var(--font-mono)">{p.m.label}</text>}
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </section>

      {/* formats + status */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="h2-display text-xl">Formats</h2>
          <div className="mt-5 space-y-3">
            {(Object.keys(TYPE_META) as (keyof typeof TYPE_META)[])
              .filter(function (t) { return (stats.countsByType[t] ?? 0) > 0; })
              .map(function (t) {
                return (
                  <div key={t} className="flex items-center gap-3">
                    <span className={`w-28 shrink-0 text-sm font-semibold ${TYPE_META[t].accent}`}>{TYPE_META[t].label}</span>
                    <div className="progress-track flex-1"><div className="progress-fill" style={{ width: ((stats.countsByType[t] ?? 0) / maxType) * 100 + "%" }} /></div>
                    <span className="font-mono2 w-10 text-right text-xs text-[var(--ink-faint)]">{stats.countsByType[t]}</span>
                  </div>
                );
              })}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="h2-display text-xl">Status</h2>
          <div className="mt-5 space-y-3">
            {Object.keys(stats.countsByStatus).map(function (s) {
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-sm text-[var(--ink-dim)]">{STATUS_LABEL[s] ?? s}</span>
                  <div className="progress-track flex-1"><div className="progress-fill" style={{ width: ((stats.countsByStatus[s] ?? 0) / maxStatus) * 100 + "%", background: "linear-gradient(90deg, var(--manga), var(--anime))" }} /></div>
                  <span className="font-mono2 w-10 text-right text-xs text-[var(--ink-faint)]">{stats.countsByStatus[s]}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* genre donut */}
      {donutData.length > 0 && (
        <section className="card p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="h2-display text-xl">Genres you collect</h2>
            <span className="badge">{stats.genreCount} explored</span>
          </div>
          <div className="mt-5 flex flex-col items-center gap-8 md:flex-row">
            <div className="relative shrink-0">
              <svg width="200" height="200" viewBox="0 0 180 180" role="img" aria-label="Genre distribution donut">
                {arcs.map(function (a) {
                  return <path key={a.g.name} d={a.path} stroke={a.color} strokeWidth="20" fill="none" strokeLinecap={a.g.name === "Other" ? "butt" : "round"} />;
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="h1-display text-2xl">{topGenre ? topGenre.count : ""}</span>
                <span className="font-mono2 max-w-[110px] truncate text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{topGenre ? topGenre.name : ""}</span>
              </div>
            </div>
            <div className="w-full space-y-2">
              {donutData.map(function (g, i) {
                return (
                  <div key={g.name} className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink-dim)]">{g.name}</span>
                    <span className="font-mono2 text-xs text-[var(--ink-faint)]">{Math.round((g.count / donutTotal) * 100)}%</span>
                    <span className="font-mono2 w-8 text-right text-xs text-[var(--ink-dim)]">{g.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}