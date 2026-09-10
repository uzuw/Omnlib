"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TYPE_META } from "@/lib/format";

type Event = {
  mediaId: number;
  title: string;
  mediaType: keyof typeof TYPE_META;
  coverUrl: string | null;
  episode: number;
  episodeTitle: string | null;
  airedAt: string;
};

export default function SchedulePage() {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    fetch("/api/schedule?days=14")
      .then((r) => r.json())
      .then((j) => setEvents(j.events ?? []));
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, Event[]>();
    for (const e of events) {
      const day = new Date(e.airedAt).toDateString();
      m.set(day, [...(m.get(day) ?? []), e]);
    }
    return [...m.entries()];
  }, [events]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="h1-display text-4xl">Coming up</h1>
        <p className="eyebrow mt-2">
          NEXT 14 DAYS OF EPISODES YOU TRACK
        </p>
      </header>

      {byDay.length === 0 && (
        <p className="pt-10 text-center text-[var(--ink-dim)]">
          No upcoming episodes in the next two weeks. Track ongoing anime or webseries — then hit the{" "}
          <em className="italic" style={{ color: "var(--ember)" }}>Sync now</em> button in the top bar to pull fresh air dates.
        </p>
      )}

      <div className="space-y-6">
        {byDay.map(([day, items]) => {
          const isToday = day === new Date().toDateString();
          return (
            <section key={day} className="space-y-2">
              <h2 className="font-mono2 flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
                <span className="dot" style={{ background: isToday ? "var(--ember)" : "var(--ink-faint)" }} />
                {isToday ? "Today" : new Date(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </h2>
              <div className="space-y-2">
                {items.map((e) => (
                  <Link key={e.mediaId + "-" + e.episode} href={`/media/${e.mediaId}`} className="card flex items-center gap-4 px-4 py-3 transition-colors hover:border-[var(--ember)]">
                    <div className="h-12 w-9 shrink-0 overflow-hidden rounded-md" style={{ border: "1px solid var(--line)" }}>
                      {e.coverUrl ? <img src={e.coverUrl} alt="" className="h-full w-full object-cover" /> : <div className="cover-fallback text-sm">{e.title[0]}</div>}
                    </div>
                    <span className={`font-display w-8 shrink-0 text-xl italic ${TYPE_META[e.mediaType].accent}`}>E{e.episode}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{e.title}</p>
                      {e.episodeTitle && <p className="truncate text-xs text-[var(--ink-faint)]">{e.episodeTitle}</p>}
                    </div>
                    <span className="font-mono2 shrink-0 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                      {TYPE_META[e.mediaType].label}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}