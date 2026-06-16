import { useMemo, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { TextSticker } from "../atoms/TextSticker";
import { radii, typography, type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";
import { Reaction } from "../../lib/feed-types";

// Placement against the parent overlay (mirrors the post frame). Stickers straddle the
// horizontal edges: a negative inset pokes them out past each side. Vertical position is
// a percentage so it follows the frame as it resizes, with no measuring.
const EDGE_OVERHANG = 40; // px the sticker pokes out past each left/right edge
const ROW_STEP_PCT = 20;  // vertical gap between stacked stickers on a side (% of height)
const STICKER_FONT_SIZE = typography.size.xxl; // heading/size-base (24)

// True for emoji/symbol reactions, false for plain text stickers (which is what we
// render here). Code-point check (no unicode literals) so plain text like "JVBBB" is
// never misclassified as emoji.
const isEmoji = (str: string) => {
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (
      cp === 0x00a9 || // ©
      cp === 0x00ae || // ®
      (cp >= 0x2000 && cp <= 0x3300) || // punctuation/symbols/CJK punctuation
      (cp >= 0x1f000 && cp <= 0x1faff) // astral emoji (😀 etc.)
    ) {
      return true;
    }
  }
  return false;
};

function FloatingSticker({ side, topPct, rotation, text, avatarUrl, username, previewScale, removing, hidden }: {
  side: "left" | "right"; topPct: number; rotation: number; text: string; avatarUrl: string | null; username: string; previewScale?: SharedValue<number>; removing?: boolean; hidden?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  // Scale drives every transition: pop in on mount / when un-hidden (spring), shrink to
  // 0 when hidden (e.g. typing a comment) or being deleted. Runs on mount too, so the
  // initial appearance pops in.
  const popScale = useSharedValue(0);
  useEffect(() => {
    if (removing) {
      popScale.value = withTiming(0, { duration: 350 });
      return;
    }
    popScale.value = hidden
      ? withTiming(0, { duration: 220 })
      : withSpring(1, { damping: 9, stiffness: 190, mass: 0.6 });
  }, [hidden, removing]);
  // The overlay scales with the preview; counter-scale by 1/previewScale so the sticker
  // keeps a fixed on-screen size (avatar 24×24, text at heading/size-base) regardless of
  // how small the preview gets.
  const animatedStyle = useAnimatedStyle(() => {
    const inv = previewScale && previewScale.value > 0 ? 1 / previewScale.value : 1;
    return { transform: [{ rotate: `${rotation}deg` }, { scale: popScale.value * inv }] };
  });
  return (
    <Reanimated.View
      style={[styles.sticker, { top: `${topPct}%`, [side]: -EDGE_OVERHANG }, animatedStyle]}
    >
      <TextSticker text={text} fontSize={STICKER_FONT_SIZE} isPostSticker={true} />
      <View style={styles.stickerAvatar}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} />
        ) : (
          <Text style={styles.avatarFallbackText}>{(username || "?")[0].toUpperCase()}</Text>
        )}
      </View>
    </Reanimated.View>
  );
}

/**
 * Reaction stickers rendered in an overlay that mirrors the post frame. Text reactions
 * alternate left/right, hugging each horizontal edge, stacked and centered vertically.
 * They keep a fixed size via the `previewScale` counter-scale (see FloatingSticker).
 */
export function ReactionStickers({ reactions, previewScale, removingUserId, hidden }: { reactions: Reaction[]; previewScale?: SharedValue<number>; removingUserId?: string | null; hidden?: boolean }) {
  const text = useMemo(() => reactions.filter((r) => !isEmoji(r.sticker_id)), [reactions]);
  if (text.length === 0) return null;
  const leftCount = Math.ceil(text.length / 2);
  const rightCount = text.length - leftCount;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {text.map((r, i) => {
        const isLeft = i % 2 === 0;
        const row = Math.floor(i / 2);
        const colCount = isLeft ? leftCount : rightCount;
        // Center each side's column vertically around the middle of the image.
        const topPct = 50 + (row - (colCount - 1) / 2) * ROW_STEP_PCT;
        return (
          <FloatingSticker
            key={r.id}
            side={isLeft ? "left" : "right"}
            topPct={topPct}
            rotation={(isLeft ? -1 : 1) * 6}
            text={r.sticker_id}
            avatarUrl={r.avatar_url ?? null}
            username={r.username ?? ""}
            previewScale={previewScale}
            removing={!!removingUserId && r.user_id === removingUserId}
            hidden={hidden}
          />
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    sticker: {
      position: "absolute",
    },
    stickerAvatar: {
      position: "absolute",
      top: -10,
      left: -10,
      width: 24,
      height: 24,
      borderRadius: radii.xs,
      backgroundColor: colors.brand,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.borderNeutral,
    },
    avatarFallbackText: {
      color: colors.white,
      fontFamily: typography.family.bold,
      fontSize: 10,
    },
  });

export type ReactionDisplay = { reactions: Reaction[]; popId?: string };
