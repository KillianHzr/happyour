import React from "react";
import { Platform, View, Text, StyleSheet } from "react-native";
import { colors as staticColors, typography, spacing } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

interface TextStickerProps {
  text: string;
  fontSize?: number;
  backgroundColor?: string;
  isPostSticker?: boolean;
  padY?: number;
}

export const TextSticker = ({
  text,
  fontSize = 24, // var(--sds-typography-heading-size-base)
  backgroundColor,
  isPostSticker = false,
  padY = spacing.xs2,
}: TextStickerProps) => {
  const { colors } = useTheme();
  const bg = backgroundColor ?? colors.brand;
  const displayValue = text || "—";

  // var(--sds-size-space-150) horizontal padding = 6px (spacing.xs2)
  const padX = spacing.xs2;

  // ─── Vertical padding strategy per platform ───────────────────────────────
  //
  // Goal: the background padding should be visually equal on all four sides,
  // measured from the edges of the uppercase glyphs (cap top → top edge,
  // baseline → bottom edge — no descenders since text is always UPPERCASE).
  //
  // Inter SemiBold font metrics (unitsPerEm = 2048):
  //   ascender   = 1984  →  0.969 em
  //   descender  =  426  →  0.208 em  (below baseline)
  //   cap height = 1456  →  0.711 em
  //   natural line height = (1984 + 426) / 2048 ≈ 1.177 em
  //
  // ── iOS ──────────────────────────────────────────────────────────────────
  //   CoreText renders glyphs using the font's actual ascender/descender
  //   metrics regardless of the lineHeight prop. When lineHeight < natural
  //   line height (e.g. lineHeight = fontSize = 1.0 em), glyphs overflow
  //   ABOVE and BELOW the line box. The cap tops then protrude into the
  //   container's top padding, making it visually smaller.
  //
  //   Fix: let iOS use its natural line height (undefined → ~1.177 em).
  //   The line box is tall enough to contain the full ascender, so no
  //   overflow. The extra vertical space (≈ 0.177 em on each side compared
  //   to cap-height-only) acts as internal whitespace — we compensate by
  //   reducing the container padding so the total visual pad stays ≈ 6px.
  //
  //   Natural internal whitespace (symmetric within natural line height):
  //     half-leading ≈ (naturalLineHeight − 1) / 2 × fontSize
  //                  ≈ 0.177 / 2 × fontSize  ≈  0.089 × fontSize
  //   But cap-height offset inside natural line height is asymmetric:
  //     above cap  = (ascender − capHeight) / unitsPerEm × fontSize
  //                = (1984 − 1456) / 2048 × fontSize  ≈ 0.258 × fontSize
  //     below base = descender / unitsPerEm × fontSize
  //                = 426 / 2048 × fontSize              ≈ 0.208 × fontSize
  //   Average extra padding already baked in ≈ (0.258 + 0.208) / 2 ≈ 0.233 × fontSize
  //   So we shrink the container padding to: pad − (average_internal / 2)
  //   ≈ pad − 0.116 × fontSize.  Clamped to 0 to avoid negative padding.
  //
  //   In practice, a simpler measured value of ~0.10 × fontSize subtracted
  //   from each side gives the best visual result.
  //
  // ── Android ──────────────────────────────────────────────────────────────
  //   With includeFontPadding: false, Android removes internal font padding
  //   symmetrically. Setting lineHeight = fontSize tightly wraps the line
  //   box, and a symmetric negative margin trims the remaining whitespace:
  //     trim ≈ (1 − capRatio) / 2 × fontSize = (1 − 0.711) / 2 × fontSize
  //          ≈ 0.136 × fontSize
  // ─────────────────────────────────────────────────────────────────────────

  const isIOS = Platform.OS === "ios";

  // iOS: no lineHeight constraint — let CoreText use natural line height so
  //      glyphs are fully contained and don't bleed into the padding area.
  // Android: clamp to fontSize so the line box is tight (works with includeFontPadding:false).
  const lineHeight = isIOS ? undefined : fontSize;

  // iOS: no negative margins needed — natural line height already contains glyphs.
  //      Reduce container padding slightly to compensate for baked-in whitespace.
  // Android: symmetric trim via negative margins to remove internal whitespace.
  const marginTop = isIOS ? 0 : -(fontSize * 0.136);
  const marginBottom = isIOS ? 0 : -(fontSize * 0.136);

  // iOS padding: subtract the internal font whitespace above cap / below
  // baseline so the visual spacing stays close to the target `pad`.
  //   above cap (natural)  ≈ 0.258 × fontSize
  //   below base (natural) ≈ 0.208 × fontSize
  // We use the smaller of the two as the inset so we never over-shrink.
  const iosPaddingVertical = Math.max(0, padY - fontSize * 0.208);
  const containerPaddingTop = isIOS ? iosPaddingVertical : padY;
  const containerPaddingBottom = isIOS ? iosPaddingVertical : padY;

  // Text color: on orange (brand) bg always white regardless of theme.
  // isPostSticker uses the theme text color (rendered as overlay on a photo).
  const textColor = isPostSticker ? colors.text : staticColors.white;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bg,
          paddingHorizontal: padX,
          paddingTop: containerPaddingTop,
          paddingBottom: containerPaddingBottom,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            fontSize,
            lineHeight,
            marginTop,
            marginBottom,
            color: textColor,
          },
        ]}
        numberOfLines={1}
      >
        {displayValue}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 0, // no border radius per design spec
  },
  text: {
    fontFamily: typography.family.semibold, // Inter SemiBold (var(--sds-typography-heading-font-family))
    fontWeight: "600",
    textAlign: "center",
    includeFontPadding: false, // Android: remove extra internal font padding
    textAlignVertical: "center",
  },
});
