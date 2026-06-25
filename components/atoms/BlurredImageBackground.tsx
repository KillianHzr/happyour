import React from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { cardBlur } from "../../lib/theme";

interface BlurredImageBackgroundProps {
  /** Image source à flouter en fond. Si absente, rien n'est rendu. */
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fond image flouté unifié de l'app : applique le flou "card" (token `cardBlur`)
 * — image floutée gaussienne + voile sombre. C'est le SEUL flou de fond image à
 * utiliser (cartes de groupe, reveal…), à la place des `BlurView`/intensités ad hoc.
 */
export const BlurredImageBackground = ({ uri, style }: BlurredImageBackgroundProps) => {
  if (!uri) return null;
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={0}
        cachePolicy="memory-disk"
        blurRadius={cardBlur.radius}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: cardBlur.overlay }]} />
    </View>
  );
};

export default BlurredImageBackground;
