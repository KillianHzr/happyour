import React from "react";
import { Platform, StyleSheet, ViewProps, View } from "react-native";
import { BlurView as ExpoBlurView } from "expo-blur";
import { BlurView as NativeBlurView } from "@sbaiahmed1/react-native-blur";

export interface BlurViewProps extends ViewProps {
  intensity?: number;
  tint?: "light" | "dark" | "default" | "xlight" | "extraDark" | "regular" | "prominent" | "systemUltraThinMaterial" | "systemThinMaterial" | "systemMaterial" | "systemThickMaterial" | "systemChromeMaterial";
  children?: React.ReactNode;
  pointerEvents?: "none" | "box-none" | "box-only" | "auto";
  blurMethod?: "none" | "dimezisBlurView";
}

/**
 * Composant BlurView unifié.
 * Utilise @sbaiahmed1/react-native-blur sur Android UNIQUEMENT quand c'est explicitement demandé
 * ou géré au cas par cas pour éviter les lags globaux.
 */
const BlurView: React.FC<BlurViewProps> = ({
  intensity = 50,
  tint = "dark",
  style,
  children,
  pointerEvents,
  blurMethod,
  ...props
}) => {
  if (Platform.OS === "android") {
    // Par défaut sur Android, si on a trop de lags, on désactive le flou dynamique 
    // sauf là où c'est critique et géré spécifiquement.
    // Pour l'instant, on revient à un fallback simple pour éviter de casser l'app ailleurs.
    
    // Si l'intensité est 0, on ne met rien
    if (intensity === 0) return <View style={[StyleSheet.absoluteFill, style]} pointerEvents={pointerEvents}>{children}</View>;

    // Note: On garde le NativeBlurView activable si besoin, 
    // mais on va privilégier un overlay sombre simple par défaut pour la perf globale
    // SAUF dans le sélecteur de groupe où on va forcer l'usage optimal.
    
    return (
      <View style={[StyleSheet.absoluteFill, style, { backgroundColor: tint === "dark" ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)" }]} pointerEvents={pointerEvents}>
        {children}
      </View>
    );
  }

  return (
    <ExpoBlurView
      intensity={intensity}
      tint={tint as any}
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents={pointerEvents}
      blurMethod={blurMethod}
      {...props}
    >
      {children}
    </ExpoBlurView>
  );
};

export default BlurView;
