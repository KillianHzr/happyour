import CaveSvg from "../../assets/stickers/Cave-Stickers.svg";
import ChanmeSvg from "../../assets/stickers/Chanme-Stickers.svg";
import MiamiSvg from "../../assets/stickers/Miami-Stickers.svg";
import CharbonneurSvg from "../../assets/stickers/Charbonneur-Stickers.svg";
import CanardSvg from "../../assets/stickers/Canard-Stickers.svg";

export const STICKERS = [
  { id: "cave",        label: "Cave",        Component: CaveSvg },
  { id: "chanme",      label: "Chanmé",      Component: ChanmeSvg },
  { id: "miami",       label: "Miami",       Component: MiamiSvg },
  { id: "charbonneur", label: "Charbonneur", Component: CharbonneurSvg },
  { id: "canard",      label: "Canard !",    Component: CanardSvg },
] as const;

export type StickerId = typeof STICKERS[number]["id"];
