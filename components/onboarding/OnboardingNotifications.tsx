import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { scheduleMotivationalNotifications } from "../../lib/notifications";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { radii, spacing, textStyles, type ThemeColors } from "../../lib/theme";

type Period = "morning" | "afternoon" | "evening";

// ── Checkbox (repris de NotificationsSettingsPage) ──
const CheckMarkIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      d="M19.1508 5.15225C19.6194 4.68362 20.3799 4.68362 20.8485 5.15225C21.3168 5.62082 21.3168 6.37997 20.8485 6.84854L9.84903 17.8495C9.62399 18.0746 9.31768 18.2011 8.99942 18.2011C8.68145 18.201 8.37618 18.0743 8.15128 17.8495L3.15176 12.8485C2.68314 12.3799 2.68314 11.6209 3.15176 11.1523C3.62039 10.6836 4.37942 10.6836 4.84805 11.1523L8.99942 15.3022L19.1508 5.15225Z"
      fill={color}
    />
  </Svg>
);

function CheckboxControl({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: false, damping: 20, stiffness: 250 }).start();
  }, [value]);
  const bgColor = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.brandTertiary, colors.brand] });
  return (
    <TouchableOpacity onPress={() => onChange(!value)} activeOpacity={0.85} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
      <Animated.View style={[checkSt.box, { backgroundColor: bgColor, borderColor: colors.borderBrandTertiary, borderWidth: 1 }]}>
        <Animated.View style={{ opacity: anim }}>
          <CheckMarkIcon color={colors.iconBrandOnBrand} />
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const checkSt = StyleSheet.create({
  box: { width: 24, height: 24, borderRadius: 4, justifyContent: "center", alignItems: "center", flexShrink: 0 },
});

function CheckboxRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity style={styles.row} onPress={() => onChange(!value)} activeOpacity={0.7}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <CheckboxControl value={value} onChange={onChange} />
    </TouchableOpacity>
  );
}

// ── Frequency slider (repris de NotificationsSettingsPage) ──
function FrequencySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const trackWidthRef = useRef(0);
  const handleAnim = useRef(new Animated.Value(0)).current;
  const startXRef = useRef(0);
  const currentCountRef = useRef(value);

  const maxPos = useCallback(() => Math.max(0, trackWidthRef.current - 24), []);
  const posFromCount = (count: number) => { const max = maxPos(); return max <= 0 ? 0 : (count / 10) * max; };
  const countFromPos = (pos: number) => { const max = maxPos(); return max <= 0 ? 0 : Math.round((pos / max) * 10); };

  const onTrackLayout = (e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
    handleAnim.setValue(posFromCount(currentCountRef.current));
  };

  useEffect(() => {
    currentCountRef.current = value;
    if (trackWidthRef.current > 0) {
      Animated.spring(handleAnim, { toValue: posFromCount(value), useNativeDriver: false, damping: 20, stiffness: 200 }).start();
    }
  }, [value]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { handleAnim.stopAnimation(v => { startXRef.current = v; }); },
      onPanResponderMove: (_, gs) => {
        const max = maxPos();
        const rawPos = Math.max(0, Math.min(max, startXRef.current + gs.dx));
        const newCount = countFromPos(rawPos);
        const step = max / 10;
        handleAnim.setValue(step > 0 ? newCount * step : 0);
        if (newCount !== currentCountRef.current) { currentCountRef.current = newCount; onChange(newCount); }
      },
      onPanResponderRelease: (_, gs) => {
        const newPos = Math.max(0, Math.min(maxPos(), startXRef.current + gs.dx));
        const step = maxPos() / 10;
        const snapped = step > 0 ? Math.round(newPos / step) * step : 0;
        Animated.spring(handleAnim, { toValue: snapped, useNativeDriver: false, damping: 20, stiffness: 200 }).start();
        const newCount = countFromPos(snapped);
        currentCountRef.current = newCount;
        onChange(newCount);
      },
    })
  ).current;

  const progressWidth = Animated.add(handleAnim, 12);
  return (
    <View style={styles.sliderItem}>
      <View style={styles.sliderHeader}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>Fréquence</Text>
        <Text style={[styles.sliderRange, { color: colors.text }]}>0–10</Text>
      </View>
      <View style={styles.sliderTrackWrap} onLayout={onTrackLayout}>
        <View style={[styles.sliderTrack, { backgroundColor: colors.brandSecondary }]}>
          <Animated.View style={[styles.sliderProgress, { width: progressWidth, backgroundColor: colors.brand }]} />
        </View>
        <Animated.View style={[styles.sliderHandle, { left: handleAnim, backgroundColor: colors.brand }]} {...panResponder.panHandlers}>
          <Text style={[styles.sliderHandleText, { color: colors.textBrandOnBrand }]}>{value}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

export type OnboardingNotificationsHandle = { save: () => Promise<void> };

// ── Section motivation autonome (matinée / après-midi / soirée + fréquence) ──
// Le parent appelle `ref.save()` au moment de valider pour persister en BDD.
export const OnboardingNotifications = forwardRef<OnboardingNotificationsHandle>((_props, ref) => {
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const [periods, setPeriods] = useState<Period[]>(["morning", "afternoon", "evening"]);
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("daily_notifications_count, notification_periods")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        if (typeof data.daily_notifications_count === "number") setCount(data.daily_notifications_count);
        if (Array.isArray(data.notification_periods)) setPeriods(data.notification_periods as Period[]);
      });
  }, [user]);

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!user) return;
      await supabase
        .from("profiles")
        .upsert({ id: user.id, daily_notifications_count: count, notification_periods: periods }, { onConflict: "id" });
      await scheduleMotivationalNotifications(count, periods);
    },
  }), [user, count, periods]);

  const togglePeriod = (period: Period) => {
    setPeriods(prev => (prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period]));
  };

  const changeCount = (c: number) => setCount(c);

  return (
    <View style={styles.wrap}>
      <View style={styles.periodsList}>
        <CheckboxRow label="Matinée"    value={periods.includes("morning")}   onChange={() => togglePeriod("morning")} />
        <CheckboxRow label="Après-midi" value={periods.includes("afternoon")} onChange={() => togglePeriod("afternoon")} />
        <CheckboxRow label="Soirée"     value={periods.includes("evening")}   onChange={() => togglePeriod("evening")} />
      </View>
      <View style={styles.freqWrap}>
        <FrequencySlider value={count} onChange={changeCount} />
      </View>
    </View>
  );
});

const makeStyles = (_colors: ThemeColors) => StyleSheet.create({
  wrap: {
    alignSelf: "stretch",
  },
  periodsList: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,            // 12px entre chaque ligne
    alignSelf: "stretch",
  },
  freqWrap: {
    alignSelf: "stretch",
    marginTop: spacing.xxl,     // space/800 (32) entre la liste et la fréquence
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    paddingVertical: spacing.sm, // space/200 (8)
  },
  rowLabel: { ...textStyles.subheading, flex: 1 },
  sliderItem: {
    minWidth: 120,
    paddingVertical: spacing.xs,
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,
    alignSelf: "stretch",
  },
  sliderHeader: { flexDirection: "row", justifyContent: "space-between", alignSelf: "stretch" },
  sliderRange: { ...textStyles.bodyBase },
  sliderTrackWrap: { alignSelf: "stretch", height: 24, justifyContent: "center", position: "relative" },
  sliderTrack: { position: "absolute", left: 0, right: 0, top: 8, height: 8, borderRadius: radii.xs, overflow: "hidden" },
  sliderProgress: { height: "100%", borderRadius: radii.xs },
  sliderHandle: { position: "absolute", top: 0, width: 24, height: 24, borderRadius: radii.xs, justifyContent: "center", alignItems: "center" },
  sliderHandleText: { ...textStyles.bodySmall },
});
