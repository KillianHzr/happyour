import React from "react";
import { View, Text } from "react-native";
import { spacing, typography, textStyles } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

/**
 * Pastille "nom" (compte ou groupe) : fond brand, incliné 2°, texte sur fond brand.
 * Pas de mise en majuscule (le nom est affiché tel quel).
 */
export function NamePill({ name }: { name: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ transform: [{ rotate: "2deg" }] }}>
      <View
        style={{
          height: 40,
          paddingHorizontal: spacing.xs2,
          backgroundColor: colors.brand,
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Text
          style={{
            fontFamily: textStyles.subtitleStrong.fontFamily,
            fontSize: typography.size.subtitle,
            color: colors.textInverse,
            includeFontPadding: false,
          } as any}
          numberOfLines={1}
        >
          {name}
        </Text>
      </View>
    </View>
  );
}
