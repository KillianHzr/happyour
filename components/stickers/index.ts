import ChanmeSvg from "../../assets/stickers/Chanme-Stickers.svg";
import MiamiSvg from "../../assets/stickers/Miami-Stickers.svg";
import CharbonneurSvg from "../../assets/stickers/Charbonneur-Stickers.svg";
import CanardSvg from "../../assets/stickers/Canard-Stickers.svg";
import WowSvg from "../../assets/stickers/Wow-Stickers.svg";
import OkSvg from "../../assets/stickers/Ok-Stickers.svg";
import LolSvg from "../../assets/stickers/Lol-Stickers.svg";
import MdrSvg from "../../assets/stickers/Mdr-Stickers.svg";
import SwagSvg from "../../assets/stickers/Swag-Stickers.svg";

export const ALL_STICKERS = [
  { id: "chanme",      label: "Chanmé",      Component: ChanmeSvg },
  { id: "miami",       label: "Miami",       Component: MiamiSvg },
  { id: "charbonneur", label: "Charbonneur", Component: CharbonneurSvg },
  { id: "canard",      label: "Canard !",    Component: CanardSvg },
  { id: "wow",         label: "Wow",         Component: WowSvg },
  { id: "ok",          label: "Ok",          Component: OkSvg },
  { id: "lol",         label: "Lol !",       Component: LolSvg },
  { id: "mdr",         label: "Mdr",         Component: MdrSvg },
  { id: "swag",        label: "Swag",        Component: SwagSvg },
] as const;

export type StickerId = typeof ALL_STICKERS[number]["id"];

/**
 * Returns the stickers available for the current month.
 * The 5-sticker rotation is scheduled to start in June 2026.
 * Until then (current date is April 2026), it only displays the original 4 stickers.
 */
export function getMonthlyStickers() {
  const date = new Date();
  const month = date.getMonth(); // 0-11
  const year = date.getFullYear();

  // New release date adjusted to June 2026 based on current environment date (April 2026)
  const isReleased = year > 2026 || (year === 2026 && month >= 5);

  if (!isReleased) {
    // Return only the original 4 stickers
    return ALL_STICKERS.slice(0, 4);
  }

  // Rotation logic for 5 stickers starting June 2026
  const totalMonthsSinceStart = (year - 2026) * 12 + month;
  const startIndex = (totalMonthsSinceStart) % ALL_STICKERS.length;
  
  const stickers = [];
  for (let i = 0; i < 5; i++) {
    stickers.push(ALL_STICKERS[(startIndex + i) % ALL_STICKERS.length]);
  }
  return stickers;
}

// For backward compatibility and rendering of ALL existing reactions in the feed
export const STICKERS = ALL_STICKERS;
