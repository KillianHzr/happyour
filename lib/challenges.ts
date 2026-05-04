import { supabase } from "./supabase";
import { r2Storage } from "./r2";

export type ChallengeCapture = "PHOTO" | "TEXTE" | "AUDIO" | "DESSIN";

export type ChallengeTheme = {
  id: string;
  label: string;
  capture_type: ChallengeCapture;
};

export type WeeklyChallenge = {
  id: string;
  group_id: string;
  theme_id: string;
  target_user_id: string;
  period: 1 | 2;
  week_start: string;
  theme: ChallengeTheme;
  target_username: string;
  target_avatar_url: string | null;
};

export type ChallengeResponse = {
  id: string;
  challenge_id: string;
  user_id: string;
  image_path: string;
  second_image_path: string | null;
  note: string | null;
  second_note: string | null;
  is_target_response: boolean;
  created_at: string;
  url: string;
  username: string;
  avatar_url: string | null;
};

export type ChallengeVote = {
  id: string;
  challenge_id: string;
  response_id: string;
  voter_id: string;
};

export type ChallengeWithData = WeeklyChallenge & {
  responses: ChallengeResponse[];
  votes: ChallengeVote[];
};

export type ActiveChallenge = {
  challengeId: string;
  captureType: ChallengeCapture;
  promptText: string;
  groupId: string;
  isTarget: boolean;
};

// Period 1: Monday (1) – Wednesday (3)
// Period 2: Thursday (4) – Sunday (0) before 20:00
// Gap: Sunday >= 20:00 → null
export function getCurrentChallengePeriod(now: Date = new Date()): 1 | 2 | null {
  const day = now.getDay();
  const hour = now.getHours();
  if (day === 0 && hour >= 20) return null;
  if (day >= 1 && day <= 3) return 1;
  return 2;
}

export function getChallengeWeekStart(d: Date = new Date()): string {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
  return copy.toISOString().slice(0, 10);
}

// Returns the Monday of the week that was revealed at prevRevealDate
export function getRevealChallengeWeekStart(prevRevealDate: Date): string {
  // prevRevealDate is Sunday 20:00; subtract 3 days → Thursday, getMondayOf that Thursday
  return getChallengeWeekStart(new Date(prevRevealDate.getTime() - 3 * 24 * 60 * 60 * 1000));
}

// Astronomical season start dates for the current year (spring-first ordering)
export function getCurrentSeasonStart(now: Date = new Date()): Date {
  const y = now.getFullYear();
  const seasons = [
    new Date(y, 2, 20),   // Spring Mar 20
    new Date(y, 5, 21),   // Summer Jun 21
    new Date(y, 8, 22),   // Autumn Sep 22
    new Date(y, 11, 21),  // Winter Dec 21
  ];
  let current = new Date(y - 1, 11, 21); // previous year's winter
  for (const s of seasons) {
    if (now >= s) current = s;
  }
  return current;
}

export const TARGET_CHALLENGE_PROMPT = "Tu es la cible ! Prends une photo qui te représente 📸";

export function mapChallenge(row: any): WeeklyChallenge {
  const theme = Array.isArray(row.challenge_themes) ? row.challenge_themes[0] : row.challenge_themes;
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: row.id,
    group_id: row.group_id,
    theme_id: row.theme_id,
    target_user_id: row.target_user_id,
    period: row.period as 1 | 2,
    week_start: row.week_start,
    theme: {
      id: theme?.id ?? "",
      label: theme?.label ?? "",
      capture_type: (theme?.capture_type ?? "PHOTO") as ChallengeCapture,
    },
    target_username: profile?.username ?? "Quelqu'un",
    target_avatar_url: profile?.avatar_url ?? null,
  };
}

export const CHALLENGE_SELECT =
  "id, group_id, theme_id, target_user_id, period, week_start, " +
  "challenge_themes:theme_id(id, label, capture_type), " +
  "profiles:target_user_id(username, avatar_url)";

// Lazy generation: fetch existing or create for this group/period/week.
// Race condition is handled by UNIQUE constraint (ON CONFLICT → re-read).
export async function fetchOrGenerateChallenge(
  groupId: string,
  period: 1 | 2,
  weekStart: string,
  members: { user_id: string }[],
  now: Date = new Date()
): Promise<WeeklyChallenge | null> {
  // Period 2 can only be generated once period 1 has ended (Thursday)
  if (period === 2) {
    const day = now.getDay();
    if (day >= 1 && day <= 3) return null;
  }

  // Try to read existing first
  const { data: existing } = await supabase
    .from("weekly_challenges")
    .select(CHALLENGE_SELECT)
    .eq("group_id", groupId)
    .eq("period", period)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existing) return mapChallenge(existing);

  // Get all themes
  const { data: themes } = await supabase
    .from("challenge_themes")
    .select("id, label, capture_type");
  if (!themes || themes.length === 0) return null;
  if (members.length === 0) return null;

  // Rotation: exclude recent targets (last memberCount-1 challenges)
  const { data: recent } = await supabase
    .from("weekly_challenges")
    .select("target_user_id")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(members.length - 1);

  const excluded = new Set((recent ?? []).map((c: any) => c.target_user_id));

  // For period 2, also exclude period 1 target of same week
  if (period === 2) {
    const { data: p1 } = await supabase
      .from("weekly_challenges")
      .select("target_user_id")
      .eq("group_id", groupId)
      .eq("period", 1)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (p1) excluded.add(p1.target_user_id);
  }

  let eligible = members.filter((m) => !excluded.has(m.user_id));
  if (eligible.length === 0) eligible = members;

  const target = eligible[Math.floor(Math.random() * eligible.length)];
  const theme = themes[Math.floor(Math.random() * themes.length)];

  // Insert — ignore conflict (another device may have beaten us)
  await supabase
    .from("weekly_challenges")
    .insert({ group_id: groupId, theme_id: theme.id, target_user_id: target.user_id, period, week_start: weekStart })
    .maybeSingle();

  // Re-read the canonical row
  const { data: final } = await supabase
    .from("weekly_challenges")
    .select(CHALLENGE_SELECT)
    .eq("group_id", groupId)
    .eq("period", period)
    .eq("week_start", weekStart)
    .maybeSingle();

  return final ? mapChallenge(final) : null;
}

// Fetch challenges + responses + votes for a group and a given week.
// Used by [id].tsx for both reveal and vault.
export async function fetchChallengeData(
  groupId: string,
  weekStart: string,
  members: { user_id: string; username: string; avatar_url?: string | null }[]
): Promise<{ period1: ChallengeWithData | null; period2: ChallengeWithData | null }> {
  const { data: challenges } = await supabase
    .from("weekly_challenges")
    .select(CHALLENGE_SELECT)
    .eq("group_id", groupId)
    .eq("week_start", weekStart);

  if (!challenges || challenges.length === 0) {
    return { period1: null, period2: null };
  }

  const ids = challenges.map((c: any) => c.id);

  const [responsesRes, votesRes] = await Promise.all([
    supabase.from("challenge_responses").select("*").in("challenge_id", ids),
    supabase.from("challenge_votes").select("*").in("challenge_id", ids),
  ]);

  const allResponses = responsesRes.data ?? [];
  const allVotes = votesRes.data ?? [];

  const enrich = (c: any): ChallengeWithData => {
    const base = mapChallenge(c);
    const responses: ChallengeResponse[] = allResponses
      .filter((r: any) => r.challenge_id === c.id)
      .map((r: any) => {
        const m = members.find((x) => x.user_id === r.user_id);
        return {
          ...r,
          url: r.image_path === "text_mode" ? "" : r2Storage.getPublicUrl(r.image_path),
          username: m?.username ?? "Anonyme",
          avatar_url: m?.avatar_url ?? null,
        };
      });
    const votes: ChallengeVote[] = allVotes.filter((v: any) => v.challenge_id === c.id);
    return { ...base, responses, votes };
  };

  const p1 = challenges.find((c: any) => c.period === 1);
  const p2 = challenges.find((c: any) => c.period === 2);

  return {
    period1: p1 ? enrich(p1) : null,
    period2: p2 ? enrich(p2) : null,
  };
}

// Build the challenge prompt string
export function getChallengePrompt(targetUsername: string, themeLabel: string): string {
  const vowels = "aeiouyAEIOUY";
  const startsWithVowel = vowels.includes(themeLabel[0] ?? "");
  return `Si ${targetUsername} était un${startsWithVowel ? "" : "·e"} ${themeLabel}, ça serait...`;
}

// Compute winning response ids (most votes; ties = all tied ids)
export function getWinnerResponseIds(
  responses: ChallengeResponse[],
  votes: ChallengeVote[]
): string[] {
  const nonTarget = responses.filter((r) => !r.is_target_response);
  if (nonTarget.length === 0) return [];

  const counts: Record<string, number> = {};
  for (const r of nonTarget) counts[r.id] = 0;
  for (const v of votes) {
    if (counts[v.response_id] !== undefined) counts[v.response_id]++;
  }

  const max = Math.max(...Object.values(counts));
  if (max === 0) return [];
  return Object.entries(counts).filter(([, n]) => n === max).map(([id]) => id);
}
