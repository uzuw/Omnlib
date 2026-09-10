"use client";
import { useEffect, useRef, useState } from "react";

type State = "idle" | "syncing" | "done" | "error";

/** In-app "live call" sync: pulls fresh episodes/air-dates/metadata from providers into the DB. */
export default function SyncButton({
  mediaId,
  compact = false,
  onDone,
}: {
  /** sync just this catalog item instead of the whole tracked library */
  mediaId?: number;
  compact?: boolean;
  onDone?: () => void;
}) {
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/sync")
      .then((r) => r.json())
      .then((j) => j.lastSyncAt && setLastSync(j.lastSyncAt))
      .catch(() => {});
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function run() {
    setState("syncing");
    setMsg("");
    try {
      const res = await fetch("/api/sync" + (mediaId ? `?mediaId=${mediaId}` : ""), { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "sync failed");
      const parts = [];
      if (j.ok?.length) parts.push(`${j.ok.length} updated`);
      if (j.failed?.length) parts.push(`${j.failed.length} failed`);
      if (!parts.length) parts.push("nothing to refresh");
      setMsg(parts.join(" · "));
      setState("done");
      if (j.lastSyncAt) setLastSync(j.lastSyncAt);
      onDone?.();
    } catch (e) {
      setMsg((e as Error).message);
      setState("error");
    }
  }

  useEffect(() => {
    if (state !== "done" && state !== "error") return;
    timer.current = setTimeout(() => setState("idle"), 5000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state]);

  const spinning = state === "syncing";
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className={compact ? "chip" : "btn"}
        data-on={state === "done"}
        onClick={run}
        disabled={spinning}
        title={
          lastSync
            ? `Last synced ${new Date(lastSync).toLocaleString()}`
            : "Pull latest episodes / air-dates / metadata from providers into your local DB"
        }
      >
        <span style={{ display: "inline-block", animation: spinning ? "spin 1s linear infinite" : "none" }}>↻</span>
        {spinning ? "Syncing…" : state === "done" ? "✓ Synced" : mediaId ? "Refresh" : "Sync now"}
      </button>
      {(msg || lastSync) && !spinning && (
        <span className="font-mono2 text-[10px] text-[var(--ink-faint)]">
          {msg || `synced ${new Date(lastSync!).toLocaleTimeString()}`}
        </span>
      )}
    </span>
  );
}