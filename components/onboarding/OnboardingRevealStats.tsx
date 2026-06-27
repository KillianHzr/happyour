import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { radii, spacing, stroke, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import Icon from "../Icon";

/** Formate un délai en ms → "Xj HH:MM:SS" (identique aux cards de groupe). */
function formatCountdown(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}j ${time}` : time;
}

/** Prochaine occurrence du reveal (jour + heure configurés) à partir de maintenant. */
function nextRevealDate(day: number, hour: number): Date {
  const now = new Date();
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  let add = (day - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() <= now.getTime()) add = 7; // déjà passé aujourd'hui → semaine prochaine
  d.setDate(d.getDate() + add);
  return d;
}

/**
 * Reproduit, pour le slider d'onboarding, les deux éléments d'une card de groupe :
 * le bloc « nombre de moments » et le countdown jusqu'au prochain reveal.
 * Pas de mode forcé : suit le thème courant (useTheme).
 */
export function OnboardingRevealStats() {
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);

  const [cfg, setCfg] = useState({ day: 0, hour: 20 });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    supabase
      .from("app_config")
      .select("key, value")
      .in("key", ["reveal_day", "reveal_hour"])
      .then(({ data }) => {
        const map: Record<string, number> = {};
        for (const r of data ?? []) map[r.key] = Number(r.value);
        setCfg({ day: map.reveal_day ?? 0, hour: map.reveal_hour ?? 20 });
      });
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const revealDate = useMemo(() => nextRevealDate(cfg.day, cfg.hour), [cfg.day, cfg.hour]);
  const str = formatCountdown(revealDate.getTime() - now);
  const digitWidth = (StyleSheet.flatten(s.countdownText)?.fontSize ?? 24) * 0.6;

  return (
    <View style={s.wrap}>
      {/* Bloc nombre de moments (fake : 6) */}
      <View style={s.dataTextRow}>
        <Text style={s.momentCount}>6</Text>
        <Text style={s.momentLabel}>Moments</Text>
      </View>

      {/* Countdown jusqu'au prochain reveal */}
      <View style={s.countdown}>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          {str.split("").map((ch, i) =>
            ch >= "0" && ch <= "9"
              ? <Text key={i} style={[s.countdownText, { width: digitWidth, textAlign: "center" }]}>{ch}</Text>
              : <Text key={i} style={s.countdownText}>{ch}</Text>
          )}
        </View>
        <Icon name="lock-border" size={24} color={colors.icon} />
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      alignSelf: "stretch",
      alignItems: "center",
      gap: spacing.lg, // space/400 entre le bloc moments et le countdown
    },
    dataTextRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    momentCount: {
      ...textStyles.titlePage,
      color: colors.text,
    },
    momentLabel: {
      ...textStyles.subheading,
      color: colors.text,
    },
    countdown: {
      width: 274,
      height: 72,
      padding: spacing.xs, // space/100
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.xl,     // space/600
      flexShrink: 0,
      borderRadius: radii.xl,
      borderWidth: stroke.sm,
      borderColor: colors.cardBorder,
      backgroundColor: colors.bg,
    },
    countdownText: {
      ...textStyles.heading,
      color: colors.text,
      lineHeight: undefined,
      fontVariant: ["tabular-nums"],
    },
  });
