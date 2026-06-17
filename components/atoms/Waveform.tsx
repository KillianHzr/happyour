import React, { useState } from "react";
import { View, StyleSheet, PixelRatio, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { radii } from "../../lib/theme";

const DEFAULT_BAR_WIDTH = 3.5;
const DEFAULT_GAP = 1; // px between every point — constant regardless of clip length
const DEFAULT_MIN_HEIGHT = 3.5;

/**
 * Resamples `data` to exactly `count` bar heights so the waveform always fills the width:
 *  - more samples than bars  → down-sample (max per chunk) so peaks are preserved
 *  - fewer samples than bars → up-sample by linearly interpolating between the two nearest
 *    recorded values, so a short clip stretches smoothly across the whole container.
 */
function buildBars(data: number[], count: number): number[] {
  if (count <= 0) return [];
  const len = data?.length ?? 0;
  if (len === 0) return new Array(count).fill(0);
  if (len === 1) return new Array(count).fill(data[0]);
  if (len >= count) {
    const bars: number[] = [];
    const chunk = len / count;
    for (let i = 0; i < count; i++) {
      const start = Math.floor(i * chunk);
      const end = Math.floor((i + 1) * chunk);
      let max = 0;
      for (let j = start; j < end; j++) max = Math.max(max, data[j]);
      bars.push(max);
    }
    return bars;
  }
  // Up-sample: spread the recorded values across `count` slots, interpolating neighbors.
  const bars: number[] = [];
  const denom = count > 1 ? count - 1 : 1;
  for (let i = 0; i < count; i++) {
    const pos = (i * (len - 1)) / denom; // fractional index into data, 0..len-1
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    bars.push(data[lo] + (data[hi] - data[lo]) * (pos - lo));
  }
  return bars;
}

/**
 * Amplitude waveform that always keeps a constant `gap` between fixed-width points and
 * fills its container: long clips are down-sampled, short clips are stretched across the
 * full width by interpolating between samples. Measures its own width to decide how many
 * points fit, so it adapts to any container. `data` are raw amplitudes (0..1);
 * `heightScale` maps them to pixels.
 */
export function Waveform({
  data,
  progress = 0,
  color,
  heightScale = 80,
  maxHeight,
  barWidth = DEFAULT_BAR_WIDTH,
  gap = DEFAULT_GAP,
  minHeight = DEFAULT_MIN_HEIGHT,
  activeOpacity = 1,
  inactiveOpacity = 0.25,
  style,
}: {
  data: number[];
  progress?: number;
  color: string;
  heightScale?: number;
  maxHeight?: number;
  barWidth?: number;
  gap?: number;
  minHeight?: number;
  activeOpacity?: number;
  inactiveOpacity?: number;
  style?: ViewStyle;
}) {
  const [width, setWidth] = useState(0);
  // Snap the bar width and gap to whole device pixels so every bar+gap spans an integer
  // number of physical pixels. Otherwise Android's pixel-grid rounding lands each bar's
  // edge inconsistently and the 1px gaps render unevenly (some 0px, some 2px).
  const barW = PixelRatio.roundToNearestPixel(barWidth);
  const barGap = PixelRatio.roundToNearestPixel(gap);
  const count = width > 0 ? Math.max(0, Math.floor((width + barGap) / (barW + barGap))) : 0;
  const bars = buildBars(data ?? [], count);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== width) setWidth(w);
  };

  return (
    <View
      style={[styles.row, { gap: barGap }, style]}
      onLayout={onLayout}
      pointerEvents="none"
    >
      {bars.map((v, i) => {
        let h = PixelRatio.roundToNearestPixel(Math.max(minHeight, v * heightScale));
        if (maxHeight !== undefined) h = Math.min(h, maxHeight);
        const played = bars.length > 0 && i < bars.length * progress;
        return (
          <View
            key={i}
            style={{
              width: barW,
              height: h,
              borderRadius: radii.xs,
              backgroundColor: color,
              opacity: played ? activeOpacity : inactiveOpacity,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
});
