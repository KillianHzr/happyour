import React from "react";
import { View } from "react-native";
import { TextSticker } from "./TextSticker";

/**
 * Étiquette "nom de groupe" utilisée dans les sliders (défis + groupes) et l'intro reveal.
 * Reprend exactement le style des stickers de réaction (TextSticker), sans forcer les
 * majuscules. Légèrement inclinée pour l'effet "autocollant".
 */
export function NameTag({ text, fontSize = 32, maxLines }: { text: string; fontSize?: number; maxLines?: number }) {
  // Seulement la première lettre du nom en majuscule (le reste tel que saisi).
  const display = text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  return (
    <View style={{ transform: [{ rotate: "2deg" }] }}>
      <TextSticker text={display} fontSize={fontSize} uppercase={false} multiline maxLines={maxLines} bold />
    </View>
  );
}
