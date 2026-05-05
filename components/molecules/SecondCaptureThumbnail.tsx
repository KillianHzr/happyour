import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Svg, Path } from "react-native-svg";
import { r2Storage } from "../../lib/r2";
import { colors, spacing, radii, typography } from "../../lib/theme";

interface SecondCaptureThumbnailProps {
  secondPath: string;
  secondNote?: string | null;
  onPress: () => void;
}

export const SecondCaptureThumbnail = ({ secondPath, secondNote, onPress }: SecondCaptureThumbnailProps) => {
  const isText = secondPath === "text_mode";
  const isAudio = secondPath.endsWith(".m4a");
  const isVideo = secondPath.endsWith(".mp4");
  const isDrawing = secondPath.includes("_draw");

  const renderContent = () => {
    if (isText) {
      return (
        <View style={[styles.secondThumbBg, { backgroundColor: colors.black, justifyContent: "center", padding: spacing.xs }]}>
          <Text style={styles.secondThumbText} numberOfLines={5}>{secondNote ?? ""}</Text>
        </View>
      );
    }
    if (isAudio) {
      return (
        <View style={[styles.secondThumbBg, { backgroundColor: colors.black, gap: spacing.xs }]}>
          {/* Mini waveform */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            {[8, 14, 10, 18, 12, 16, 9].map((h, i) => (
              <View key={i} style={{ width: 2.5, height: h, borderRadius: radii.xs, backgroundColor: colors.textMuted }} />
            ))}
          </View>
          {/* Play icon */}
          <View style={styles.secondThumbPlayBadge}>
            <Svg width="8" height="8" viewBox="0 0 24 24" fill={colors.white}>
              <Path d="M8 5v14l11-7z" />
            </Svg>
          </View>
        </View>
      );
    }
    if (isVideo) {
      return (
        <View style={[styles.secondThumbBg, { backgroundColor: colors.black }]}>
          <Image
            source={{ uri: r2Storage.getPublicUrl(secondPath) }}
            style={styles.secondThumbImage}
            contentFit="cover"
          />
          {/* Play badge over video */}
          <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center" }]}>
            <View style={styles.secondThumbPlayCircle}>
              <Svg width="10" height="10" viewBox="0 0 24 24" fill={colors.white}>
                <Path d="M8 5v14l11-7z" />
              </Svg>
            </View>
          </View>
        </View>
      );
    }
    if (isDrawing) {
      return (
        <Image
          source={{ uri: r2Storage.getPublicUrl(secondPath) }}
          style={styles.secondThumbImage}
          contentFit="contain"
        />
      );
    }
    // Regular photo
    return (
      <Image
        source={{ uri: r2Storage.getPublicUrl(secondPath) }}
        style={styles.secondThumbImage}
        contentFit="cover"
      />
    );
  };

  // Drawing uses 3:4 ratio (same as in the reveal), others use 9:16 portrait
  const thumbStyle = isDrawing
    ? [styles.secondThumb, { width: 83, height: 110 }]
    : [styles.secondThumb, { width: 90, height: 160 }];

  return (
    <TouchableOpacity onPress={onPress} style={thumbStyle} activeOpacity={0.8}>
      {renderContent()}
      {/* Swap indicator */}
      <View style={styles.secondThumbOverlay}>
        <Svg width="8" height="8" viewBox="0 0 20 18" fill="none">
          <Path d="M1 13L5 17M5 17L9 13M5 17L5 1M19 5L15 1M15 1L11 5M15 1L15 17" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  secondThumb: { 
    position: "absolute", 
    bottom: 140, 
    right: spacing.lg, 
    borderRadius: radii.md, 
    overflow: "hidden", 
    borderWidth: 2, 
    borderColor: colors.glassBorder 
  },
  secondThumbBg: { 
    flex: 1, 
    backgroundColor: colors.black, 
    justifyContent: "center", 
    alignItems: "center" 
  },
  secondThumbText: { 
    color: colors.text, 
    fontFamily: typography.family.semibold, 
    fontSize: typography.size.xs, 
    textAlign: "center", 
    lineHeight: 13 
  },
  secondThumbImage: { 
    width: "100%", 
    height: "100%" 
  },
  secondThumbOverlay: { 
    position: "absolute", 
    bottom: spacing.xs, 
    right: spacing.xs, 
    width: 26, 
    height: 26, 
    borderRadius: radii.sm, 
    backgroundColor: colors.overlay, 
    justifyContent: "center", 
    alignItems: "center" 
  },
  secondThumbPlayBadge: { 
    width: 22, 
    height: 22, 
    borderRadius: 11, 
    backgroundColor: colors.glass, 
    justifyContent: "center", 
    alignItems: "center", 
    paddingLeft: 1 
  },
  secondThumbPlayCircle: { 
    width: 28, 
    height: 28, 
    borderRadius: 14, 
    backgroundColor: colors.overlay, 
    justifyContent: "center", 
    alignItems: "center", 
    paddingLeft: 2 
  },
});

