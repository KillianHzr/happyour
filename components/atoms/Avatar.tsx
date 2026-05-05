import React from "react";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { Svg, Path } from "react-native-svg";

interface UserAvatarProps {
  avatar_url?: string | null;
  username: string;
  size?: number;
}

export const UserAvatar = ({ avatar_url, username, size = 28 }: UserAvatarProps) => {
  const borderRadius = size / 2;
  if (avatar_url) {
    return <Image source={{ uri: avatar_url }} style={{ width: size, height: size, borderRadius }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center" }}>
      <Text style={{ color: "#000", fontFamily: "Inter_700Bold", fontSize: Math.round(size * 0.42) }}>
        {username[0]?.toUpperCase() ?? "?"}
      </Text>
    </View>
  );
};

interface CrownedAvatarProps extends UserAvatarProps {
  isCrown: boolean;
}

export const CrownedAvatar = ({ avatar_url, username, size = 36, isCrown }: CrownedAvatarProps) => {
  const crownSize = Math.round(size * 0.6);
  return (
    <View style={{ width: size, height: size + (isCrown ? crownSize * 0.6 : 0), alignItems: "center", justifyContent: "flex-end" }}>
      {isCrown && (
        <View style={{ position: "absolute", top: 0, zIndex: 10 }}>
          <Svg width={crownSize} height={crownSize} viewBox="0 0 24 24">
            <Path d="M2 19l2-9 4.5 4L12 5l3.5 9L20 10l2 9H2z" fill="#FFD700" stroke="#B8860B" strokeWidth="1" strokeLinejoin="round" />
          </Svg>
        </View>
      )}
      <View style={isCrown ? { borderWidth: 2, borderColor: "#FFD700", borderRadius: size / 2 } : undefined}>
        <UserAvatar avatar_url={avatar_url} username={username} size={size} />
      </View>
    </View>
  );
};
