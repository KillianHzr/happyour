import type { ShapeName } from "../Shape";

/**
 * Lottie central de la single (GroupRoom).
 *
 * On choisit le Lottie selon :
 *  - le TYPE du dernier moment posté (photo / vidéo / dessin) ;
 *    audio, texte (et tout le reste) retombent sur le set "photo".
 *  - la VERSION = nombre de moments du groupe, borné à [1, 5].
 *
 * Le Lottie est figé sur sa frame 0 par défaut ; son animation est pilotée
 * manuellement via `progress` (voir GroupRoom) et joue jusqu'à `morphProgress`
 * (fin visuelle de l'anim) avant d'ouvrir le reveal.
 */
type RevealType = "photo" | "video" | "dessin";

const LOTTIES: Record<RevealType, any[]> = {
  photo: [
    require("../../assets/lotties/reveal/photo_1.json"),
    require("../../assets/lotties/reveal/photo_2.json"),
    require("../../assets/lotties/reveal/photo_3.json"),
    require("../../assets/lotties/reveal/photo_4.json"),
    require("../../assets/lotties/reveal/photo_5.json"),
  ],
  video: [
    require("../../assets/lotties/reveal/video_1.json"),
    require("../../assets/lotties/reveal/video_2.json"),
    require("../../assets/lotties/reveal/video_3.json"),
    require("../../assets/lotties/reveal/video_4.json"),
    require("../../assets/lotties/reveal/video_5.json"),
  ],
  dessin: [
    require("../../assets/lotties/reveal/dessin_1.json"),
    require("../../assets/lotties/reveal/dessin_2.json"),
    require("../../assets/lotties/reveal/dessin_3.json"),
    require("../../assets/lotties/reveal/dessin_4.json"),
    require("../../assets/lotties/reveal/dessin_5.json"),
  ],
};

function shapeToType(shape: ShapeName | null): RevealType {
  if (shape === "video") return "video";
  if (shape === "dessin") return "dessin";
  return "photo"; // photo, audio, texte, stop, null → fallback photo
}

/**
 * Timeline du Lottie. On fige la frame à `FREEZE_SECONDS` (tout ce qui précède
 * n'est jamais vu) et on anime ensuite, à vitesse réelle (linéaire, 1:1), jusqu'à
 * la dernière keyframe utile (shape totalement disparue / envolée).
 * Tout est exprimé en `progress` (0→1) sur l'intervalle [ip, op] du Lottie.
 */
const FREEZE_SECONDS = 1.0;

function lottieTiming(src: any): { freezeProgress: number; endProgress: number; durationMs: number } {
  const fr = src?.fr || 60;
  const ip = src?.ip ?? 0;
  const op = src?.op ?? fr;
  const span = Math.max(1, op - ip);

  // Dernière keyframe utile (le Lottie traîne une queue statique après l'envol).
  let last = ip;
  const walk = (o: any) => {
    if (Array.isArray(o)) {
      o.forEach(walk);
    } else if (o && typeof o === "object") {
      if (Array.isArray(o.k) && o.k.length && typeof o.k[0] === "object") {
        for (const kf of o.k) if (typeof kf.t === "number") last = Math.max(last, kf.t);
      }
      for (const key in o) walk(o[key]);
    }
  };
  walk(src?.layers ?? []);
  const endFrame = Math.min(op, last + 1);

  // Frame figée = FREEZE_SECONDS après le début.
  const freezeFrame = Math.min(endFrame, ip + fr * FREEZE_SECONDS);

  const freezeProgress = Math.max(0, Math.min(1, (freezeFrame - ip) / span));
  const endProgress = Math.max(freezeProgress, Math.min(1, (endFrame - ip) / span));
  const durationMs = Math.max(300, ((endFrame - freezeFrame) / fr) * 1000);
  return { freezeProgress, endProgress, durationMs };
}

export type RevealLottie = {
  source: any;
  freezeProgress: number;
  endProgress: number;
  durationMs: number;
};

/** Source Lottie + timing pour le dernier moment (`shape`) et le total (`count`). */
export function getRevealLottie(shape: ShapeName | null, count: number): RevealLottie {
  const type = shapeToType(shape);
  const version = Math.min(Math.max(count, 1), 5);
  const source = LOTTIES[type][version - 1];
  return { source, ...lottieTiming(source) };
}
