import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./auth-context";
import { supabase } from "./supabase";
import {
  buildColors,
  buildShadows,
  buildTheme,
  type ThemeColors,
  type ThemeShadows,
  type ThemeStyles,
  type ThemeMode,
} from "./theme";

/** Préférence choisie par l'utilisateur (stockée en BDD + cache local). */
export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "theme_preference";

type ThemeContextValue = {
  /** Préférence brute choisie par l'utilisateur. */
  preference: ThemePreference;
  /** Met à jour la préférence (cache local + Supabase). */
  setPreference: (p: ThemePreference) => void;
  /** Mode effectif réellement appliqué ("Light" | "Dark"). */
  mode: ThemeMode;
  colors: ThemeColors;
  shadows: ThemeShadows;
  theme: ThemeStyles;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const isValidPreference = (v: unknown): v is ThemePreference =>
  v === "system" || v === "light" || v === "dark";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const systemScheme = useColorScheme(); // "light" | "dark" | null

  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  // Évite d'écraser une préférence déjà chargée par une valeur DB obsolète.
  const hydratedFromStorage = useRef(false);

  // 1. Hydratation immédiate depuis le cache local (boot sans flash).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && isValidPreference(cached)) {
          setPreferenceState(cached);
        }
      } catch {
        // ignore — on garde "system"
      } finally {
        hydratedFromStorage.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Source de vérité : profil Supabase, dès qu'un utilisateur est connecté.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("theme_preference")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      const dbPref = data?.theme_preference;
      if (isValidPreference(dbPref)) {
        setPreferenceState(dbPref);
        AsyncStorage.setItem(STORAGE_KEY, dbPref).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
    if (user?.id) {
      // .select() pour détecter un échec silencieux (RLS → 0 ligne mise à jour sans erreur)
      supabase
        .from("profiles")
        .update({ theme_preference: p })
        .eq("id", user.id)
        .select("id")
        .then(({ data, error }) => {
          if (error) {
            console.warn("[theme] échec sauvegarde theme_preference:", error.message);
          } else if (!data || data.length === 0) {
            console.warn("[theme] update sans effet (0 ligne) — vérifie la policy RLS UPDATE sur public.profiles");
          }
        });
    }
  };

  // Mode effectif : "system" suit le téléphone, sinon la préférence prime.
  const mode: ThemeMode =
    preference === "system"
      ? systemScheme === "light"
        ? "Light"
        : "Dark"
      : preference === "light"
      ? "Light"
      : "Dark";

  const colors = useMemo(() => buildColors(mode), [mode]);
  const shadows = useMemo(() => buildShadows(mode), [mode]);
  const theme = useMemo(() => buildTheme(colors, shadows), [colors, shadows]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, setPreference, mode, colors, shadows, theme }),
    [preference, mode, colors, shadows, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Force un mode de thème ("Dark" | "Light") pour tout un sous-arbre, quelle que
 * soit la préférence globale de l'utilisateur. Utilisé pour les écrans qui doivent
 * toujours s'afficher en sombre (capture, défis, sélection de groupe…).
 */
export function ForceThemeMode({ mode, children }: { mode: ThemeMode; children: React.ReactNode }) {
  const parent = useContext(ThemeContext);
  const colors = useMemo(() => buildColors(mode), [mode]);
  const shadows = useMemo(() => buildShadows(mode), [mode]);
  const theme = useMemo(() => buildTheme(colors, shadows), [colors, shadows]);
  const value = useMemo<ThemeContextValue>(
    () => ({
      preference: parent?.preference ?? (mode === "Dark" ? "dark" : "light"),
      setPreference: parent?.setPreference ?? (() => {}),
      mode,
      colors,
      shadows,
      theme,
    }),
    [parent, mode, colors, shadows, theme]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Hook principal : couleurs/ombres/styles réactifs au mode + préférence. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * Helper de migration : transforme une fabrique de styles en styles mémoïsés
 * recalculés uniquement quand le thème change.
 *
 * Exemple :
 *   const makeStyles = (colors: ThemeColors, shadows: ThemeShadows) =>
 *     StyleSheet.create({ card: { backgroundColor: colors.card } });
 *   const styles = useThemedStyles(makeStyles);
 */
export function useThemedStyles<T>(
  factory: (colors: ThemeColors, shadows: ThemeShadows) => T
): T {
  const { colors, shadows } = useTheme();
  return useMemo(() => factory(colors, shadows), [colors, shadows]);
}
