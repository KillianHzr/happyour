import type { PhotoEntry } from "../components/PhotoFeed";

/**
 * Calcule qui a tenu la couronne le plus longtemps
 * dans la fenêtre [windowStart, windowEnd].
 *
 * Algorithme :
 *   - Trier les posts par created_at ASC
 *   - post[i] a tenu la couronne de post[i].created_at → post[i+1].created_at
 *   - Le dernier post tient la couronne jusqu'à windowEnd
 *   - Winner = celui qui cumule le plus de temps
 */
export type CrownResult = {
  winnerId: string;
  durationMs: number;
} | null;

export function computeCrownWinner(
  photos: PhotoEntry[],
  windowStart: Date,
  windowEnd: Date
): CrownResult {
  const sorted = [...photos]
    .filter((p) => {
      const t = new Date(p.created_at).getTime();
      return t >= windowStart.getTime() && t < windowEnd.getTime();
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (sorted.length === 0) return null;

  const durations: Record<string, number> = {};
  const endMs = windowEnd.getTime();

  for (let i = 0; i < sorted.length; i++) {
    const userId = sorted[i].user_id;
    const startMs = new Date(sorted[i].created_at).getTime();
    const nextMs =
      i < sorted.length - 1
        ? new Date(sorted[i + 1].created_at).getTime()
        : endMs;
    durations[userId] = (durations[userId] ?? 0) + (nextMs - startMs);
  }

  let winnerId: string | null = null;
  let maxMs = 0;
  for (const [userId, ms] of Object.entries(durations)) {
    if (ms > maxMs) {
      maxMs = ms;
      winnerId = userId;
    }
  }

  if (!winnerId) return null;
  return { winnerId, durationMs: maxMs };
}
