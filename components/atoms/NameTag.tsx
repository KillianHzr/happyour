import React from "react";
import { View, Text } from "react-native";
import { radii, spacing, typography } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

/**
 * Étiquette "nom de groupe" utilisée dans les sliders (défis + groupes).
 * Texte en `text/default/default` sur fond `background/brand/default`, incliné de 2°.
 */
export function NameTag({ text, fontSize = 32 }: { text: string; fontSize?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ transform: [{ rotate: "2deg" }] }}>
      <View
        style={{
          backgroundColor: colors.brand,
          borderRadius: radii.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          alignSelf: "flex-start",
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontFamily: typography.family.bold,
            fontSize,
            textTransform: "uppercase",
          }}
          numberOfLines={1}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}
