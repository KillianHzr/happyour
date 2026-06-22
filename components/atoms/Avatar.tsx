import React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Svg, Path } from "react-native-svg";
import { typography } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

interface UserAvatarProps {
  avatar_url?: string | null;
  username: string;
  size?: number;
  borderRadius?: number;
  /** Extra styling (borders, margins, shadows…) applied to the clipping box. */
  style?: StyleProp<ViewStyle>;
}

export const UserAvatar = ({ avatar_url, username, size = 28, borderRadius, style }: UserAvatarProps) => {
  const { colors } = useTheme();
  const r = borderRadius ?? (size / 2);
  return (
    <View style={[{ width: size, height: size, borderRadius: r, backgroundColor: colors.card, justifyContent: "center", alignItems: "center", overflow: "hidden" }, style]}>
      <Text style={{ color: colors.text, fontFamily: typography.family.bold, fontSize: Math.round(size * 0.42) }}>
        {username[0]?.toUpperCase() ?? "?"}
      </Text>
      {avatar_url ? (
        <Image
          source={{ uri: avatar_url }}
          style={{ position: "absolute", width: size, height: size }}
          cachePolicy="memory-disk"
          transition={150}
        />
      ) : null}
    </View>
  );
};

interface CrownedAvatarProps extends UserAvatarProps {
  isCrown: boolean;
}

export const CrownedAvatar = ({ avatar_url, username, size = 36, isCrown, borderRadius }: CrownedAvatarProps) => {
  const { colors } = useTheme();
  const crownSize = Math.round(size * 0.6);
  const r = borderRadius ?? (size / 2);
  return (
    <View style={{ width: size, height: size + (isCrown ? crownSize * 0.6 : 0), alignItems: "center", justifyContent: "flex-end" }}>
      {isCrown && (
        <View style={{ position: "absolute", top: 0, zIndex: 10 }}>
          <Svg width={crownSize} height={crownSize} viewBox="0 0 24 24">
            <Path d="M2 19l2-9 4.5 4L12 5l3.5 9L20 10l2 9H2z" fill={colors.gold} stroke={colors.goldDark} strokeWidth="1" strokeLinejoin="round" />
          </Svg>
        </View>
      )}
      <View style={isCrown ? { borderWidth: 2, borderColor: colors.gold, borderRadius: r } : undefined}>
        <UserAvatar avatar_url={avatar_url} username={username} size={size} borderRadius={r} />
      </View>
    </View>
  );
};
