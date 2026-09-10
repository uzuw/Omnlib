// UI helpers shared across pages (pure, no server deps).
import type { MediaType } from "./db/schema";

export const TYPE_META: Record<MediaType, { label: string; accent: string; dot: string }> = {
  anime: { label: "Anime", accent: "t-anime", dot: "var(--anime)" },
  manga: { label: "Manga", accent: "t-manga", dot: "var(--manga)" },
  light_novel: { label: "Light Novel", accent: "t-light_novel", dot: "var(--light-novel)" },
  webseries: { label: "Webseries", accent: "t-webseries", dot: "var(--webseries)" },
  movie: { label: "Movies", accent: "t-movie", dot: "var(--movie)" },
  book: { label: "Books", accent: "t-book", dot: "var(--book)" },
};

export function timeAgo(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 86400 * 30) return Math.floor(s / 86400) + "d ago";
  return d.toLocaleDateString();
}

export const STATUS_LABEL: Record<string, string> = {
  planned: "Planning",
  in_progress: "Active",
  completed: "Completed",
  on_hold: "On hold",
  dropped: "Dropped",
};