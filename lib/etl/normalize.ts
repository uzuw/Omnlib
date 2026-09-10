// Shared normalization helpers used by every provider mapper.

/** AniList / MAL style 0-100 score -> 0-10 (1 decimal). */
export function normalizeRating100(score?: number | null): number | null {
  if (score == null) return null;
  return Math.round((score / 10) * 10) / 10;
}

/** Strip HTML tags (AniList synopses are HTML). */
export function stripHtml(input?: string | null): string | null {
  if (!input) return null;
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Coerce http:// -> https:// (some providers return http covers); pass https through. */
export function toHttps(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://")) return "https://" + url.slice(7);
  return url;
}

/** First 4-digit year in a date-like string. */
export function extractYear(raw?: string | { year?: number | null } | null): number | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw.year ?? null;
  const m = String(raw).match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

/** Pick highest-priority cover from a list of candidates (first non-null wins). */
export function pickCover(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (c) return toHttps(c);
  }
  return null;
}