import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Path, ClipPath, Defs, Image as SvgImage } from "react-native-svg";
import { useTheme } from "../../lib/theme-context";
import { useVideoPlayer, VideoView } from "expo-video";

interface SvgCutoutProps {
  uri: string;
  size?: number;
}

const pathD = "M29.1982 8.96875C31.3951 3.38371 37.1613 -0.422013 43.6738 0.349609C49.8443 1.08188 54.8665 6.05326 55.6377 12.2109C56.4358 18.5599 52.8897 24.2206 47.5791 26.5898L47.0596 26.8086C45.9972 27.2248 45.9974 28.7739 47.0596 29.1904V29.1914C52.4944 31.3585 56.2224 36.8758 55.7012 43.1768L55.6377 43.7891C54.8533 49.9475 49.8439 54.9182 43.6738 55.6504C37.1613 56.422 31.3951 52.6163 29.1982 47.0312L29.1973 47.0303L29.1543 46.9326C28.6731 45.956 27.2193 45.9886 26.8027 47.0303L26.8018 47.0312C24.6049 52.6163 18.8387 56.422 12.3262 55.6504C6.15568 54.9181 1.13347 49.9467 0.362305 43.7891C-0.461523 37.2353 3.3437 31.415 8.94043 29.1914L8.93945 29.1904C10.0028 28.7743 10.003 27.2245 8.93945 26.8086H8.94043C3.50558 24.6415 -0.222366 19.1241 0.298828 12.8232L0.362305 12.2109C1.14671 6.05251 6.15614 1.08182 12.3262 0.349609C18.8387 -0.422016 24.6049 3.38371 26.8018 8.96875L26.8027 8.96973C27.2327 10.0449 28.7673 10.0449 29.1973 8.96973L29.1982 8.96875Z";

const VideoPreview = ({ uri, size }: { uri: string; size: number }) => {
  const player = useVideoPlayer(uri, p => {
    p.pause();
  });
  return (
    <VideoView
      player={player}
      style={{ width: size, height: size }}
      contentFit="cover"
      nativeControls={false}
    />
  );
};

export const SvgCutout = ({ uri, size = 56 }: SvgCutoutProps) => {
  const { colors } = useTheme();
  const isVideo = uri.toLowerCase().includes(".mp4");

  if (isVideo) {
    return (
      <View style={{ width: size, height: size, position: "relative", overflow: "hidden" }}>
        <VideoPreview uri={uri} size={size} />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={size} height={size} viewBox="0 0 56 56" fill="none">
            <Path
              d={`M0 0 h56 v56 h-56 z ${pathD}`}
              fill={colors.bg}
              fillRule="evenodd"
            />
            <Path
              d={pathD}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          </Svg>
        </View>
      </View>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <Defs>
        <ClipPath id="cutoutClip">
          <Path d={pathD} />
        </ClipPath>
      </Defs>
      <SvgImage
        href={{ uri }}
        width="56"
        height="56"
        clipPath="url(#cutoutClip)"
        preserveAspectRatio="xMidYMid slice"
      />
      <Path
        d={pathD}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={1.5}
      />
    </Svg>
  );
};
