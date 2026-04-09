export const ALL_STICKERS = [
  { id: "chanme",      label: "Chanmé",      text: "CHANMÉ" },
  { id: "miami",       label: "Miami",       text: "MIAMI" },
  { id: "charbonneur", label: "Charbonneur", text: "CHARBON" },
  { id: "canard",      label: "Canard !",    text: "CANARD !" },
  { id: "wow",         label: "Wow",         text: "WOW" },
  { id: "ok",          label: "Ok",          text: "OK" },
  { id: "lol",         label: "Lol !",       text: "LOL !" },
  { id: "mdr",         label: "Mdr",         text: "MDR" },
  { id: "swag",        label: "Swag",        text: "SWAG" },
] as const;

export type StickerId = string;

/**
 * Returns the stickers available for the current month.
 * Until June 2026, it only displays the original 4 stickers.
 */
export function getMonthlyStickers() {
  const date = new Date();
  const month = date.getMonth(); // 0-11
  const year = date.getFullYear();

  const isReleased = year > 2026 || (year === 2026 && month >= 5);

  if (!isReleased) {
    return ALL_STICKERS.slice(0, 4);
  }

  const totalMonthsSinceStart = (year - 2026) * 12 + month;
  const startIndex = (totalMonthsSinceStart) % ALL_STICKERS.length;
  
  const stickers = [];
  for (let i = 0; i < 5; i++) {
    stickers.push(ALL_STICKERS[(startIndex + i) % ALL_STICKERS.length]);
  }
  return stickers;
}

export const STICKERS = ALL_STICKERS;
