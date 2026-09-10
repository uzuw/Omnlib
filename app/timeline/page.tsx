"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { timeAgo, TYPE_META } from "@/lib/format";

const ACTION_META: Record<string, { label: string; color: string }> = {
  added: { label: "added to library", color: "var(--book)" },
  progress_update: { label: "progress", color: "var(--ember)" },
  status_change: { label: "status change", color: "var(--manga)" },
  rated: { label: "rated", color: "var(--anime)" },
  imported: { label: "imported", color: "var(--light-novel)" },
  removed: { label: "removed", color: "var(--ink-faint)" },
};

type Event = {
  id: number;
  action: string;
  value: Record<string, unknown> | null;
  occurredAt: string;
  media: { id: number; title: string; mediaType: keyof typeof TYPE_META; coverUrl: string | null } | null;
};

function describe(e: Event): string {
  const v = e.value ?? {};
  if (e.action === "progress_update") return `→ ${v.progress} ${v.completed ? "· completed!" : ""}`;
  if (e.action === "status_change") return `${String(v.from ?? "").replaceAll("_", " ")} → ${String(v.to ?? "").replaceAll("_", " ")}`;
  if (e.action === "rated") return `★ ${v.rating}/10`;
  if (e.action === "added") return `(${String(v.status ?? "planned").replaceAll("_", " ")})`;
  return "";
}

export default function TimelinePage() {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    fetch("/api/timeline?limit=100")
      .then((r) => r.json())
      .then((j) => setEvents(j.events ?? []));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="h1-display text-4xl">Timeline</h1>
        <p className="eyebrow mt-2">EVERY STORY, ONE STREAM</p>
      </header>

      {events.length === 0 && (
        <p className="pt-10 text-center text-[var(--ink-dim)]">
          No activity yet. <Link href="/" className="underline decoration-[var(--ember)] underline-offset-4">Start tracking →</Link>
        </p>
      )}

      <div className="relative space-y-5 before:absolute before:left-[13px] before:top-2 before:bottom-2 before:w-px before:bg-[var(--line)]">
        {events.map((e) => {
          const meta = ACTION_META[e.action] ?? ACTION_META.added;
          return (
            <div key={e.id} className="relative flex gap-4 pl-8">
              <span
                className="absolute left-0 top-1.5 h-[10px] w-[10px] rounded-full border-2 border-[var(--bg)]"
                style={{ background: meta.color }}
              />
              <div className="card flex flex-1 items-center gap-3 p-3.5 transition-colors hover:border-[var(--line-strong)]">
                {e.media && (
                  <Link href={`/media/${e.media.id}`} className="h-14 w-10 shrink-0 overflow-hidden rounded-md" style={{ border: "1px solid var(--line)" }}>
                    {e.media.coverUrl ? <img src={e.media.coverUrl} alt="" className="h-full w-full object-cover" /> : <div className="cover-fallback text-sm">{e.media.title[0]}</div>}
                  </Link>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-mono2 text-[10px] uppercase tracking-widest" style={{ color: meta.color }}>
                      {meta.label}
                    </span>{" "}
                    {e.media && (
                      <Link href={`/media/${e.media.id}`} className="font-semibold hover:text-[var(--ember)]">
                        {e.media.title}
                      </Link>
                    )}
                  </p>
                  {describe(e) && <p className="truncate text-xs text-[var(--ink-faint)]">{describe(e)}</p>}
                </div>
                <span className="font-mono2 shrink-0 text-[10px] text-[var(--ink-faint)]">{timeAgo(e.occurredAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}