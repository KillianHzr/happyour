import React, { useState, useRef } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { radii } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";


interface PhotoImageProps {
  url: string;
  fallback_url?: string;
  isDrawing?: boolean;
}

export const PhotoImage = ({ url, fallback_url, isDrawing }: PhotoImageProps) => {
  const { colors } = useTheme();
  const [useFallback, setUseFallback] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const prevUrlRef = useRef(url);

  if (prevUrlRef.current !== url) {
    prevUrlRef.current = url;
    if (useFallback) setUseFallback(false);
    setLoaded(false);
  }

  const src = useFallback && fallback_url ? fallback_url : url;

  if (isDrawing) {
    return (
      <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center" }]}>
        {!loaded && (
          <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center" }]} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.textSecondary} />
          </View>
        )}
        <Image
          source={{ uri: src }}
          style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: radii.xl }}
          contentFit="fill"
          onLoad={() => setLoaded(true)}
          onError={() => { if (fallback_url) setUseFallback(true); }}
        />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {!loaded && (
        <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center" }]} pointerEvents="none">
          <ActivityIndicator size="large" color="rgba(255,255,255,0.5)" />
        </View>
      )}
      <Image
        source={{ uri: src }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition={{ top: 0, left: "50%" }}
        onLoad={() => setLoaded(true)}
        onError={() => { if (fallback_url && !useFallback) setUseFallback(true); }}
      />
    </View>
  );
};
