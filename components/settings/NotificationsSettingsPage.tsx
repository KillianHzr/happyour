import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated, PanResponder, ScrollView, StyleSheet,
  Text, TouchableOpacity, View, type LayoutChangeEvent,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { scheduleMotivationalNotifications } from "../../lib/notifications";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { radii, spacing, textStyles, type ThemeColors } from "../../lib/theme";
import { useSettingsNav } from "../SettingsSheet";

type Period = "morning" | "afternoon" | "evening";

// ─── SVG atoms ───────────────────────────────────────────────────────────────

const KnobIcon = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
    <Path
      d="M18 9C18 13.9706 13.9706 18 9 18C4.02944 18 0 13.9706 0 9C0 4.02944 4.02944 0 9 0C13.9706 0 18 4.02944 18 9Z"
      fill={color}
    />
  </Svg>
);

const CheckMarkIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Path
      d="M19.1508 5.15225C19.6194 4.68362 20.3799 4.68362 20.8485 5.15225C21.3168 5.62082 21.3168 6.37997 20.8485 6.84854L9.84903 17.8495C9.62399 18.0746 9.31768 18.2011 8.99942 18.2011C8.68145 18.201 8.37618 18.0743 8.15128 17.8495L3.15176 12.8485C2.68314 12.3799 2.68314 11.6209 3.15176 11.1523C3.62039 10.6836 4.37942 10.6836 4.84805 11.1523L8.99942 15.3022L19.1508 5.15225Z"
      fill={color}
    />
  </Svg>
);

// ─── Switch ───────────────────────────────────────────────────────────────────

function SwitchControl({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      useNativeDriver: false,
      damping: 20,
      stiffness: 250,
    }).start();
  }, [value]);

  const knobMargin = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 14] });
  const bgColor = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.bg, colors.brand] });

  const trackBg = disabled ? colors.bgDisabled : bgColor;
  const trackBorder = disabled ? colors.borderDisabled : colors.borderBrandTertiary;
  const knobColor = disabled ? colors.iconDisabled : (value ? colors.iconBrandOnBrand : colors.iconBrandTertiary);

  return (
    <TouchableOpacity
      onPress={() => !disabled && onChange(!value)}
      activeOpacity={disabled ? 1 : 0.85}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      <Animated.View style={[switchSt.track, { backgroundColor: trackBg, borderColor: trackBorder }]}>
        <Animated.View style={[switchSt.knob, { marginLeft: knobMargin }]}>
          <KnobIcon color={knobColor} />
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const switchSt = StyleSheet.create({
  track: {
    width: 40,
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
    flexDirection: "row",
  },
  knob: {
    width: 18,
    height: 18,
  },
});

// ─── Checkbox ─────────────────────────────────────────────────────────────────

function CheckboxControl({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      useNativeDriver: false,
      damping: 20,
      stiffness: 250,
    }).start();
  }, [value]);

  const bgColor = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.brandTertiary, colors.brand] });
  const iconOpacity = anim;

  const boxBg = disabled ? colors.bgDisabled : bgColor;
  const boxBorder = disabled ? colors.borderDisabled : colors.borderBrandTertiary;
  const checkColor = disabled ? colors.iconSecondary : colors.iconBrandOnBrand;

  return (
    <TouchableOpacity
      onPress={() => !disabled && onChange(!value)}
      activeOpacity={disabled ? 1 : 0.85}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      <Animated.View style={[checkSt.box, { backgroundColor: boxBg, borderColor: boxBorder, borderWidth: 1 }]}>
        <Animated.View style={{ opacity: iconOpacity }}>
          <CheckMarkIcon color={checkColor} />
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const checkSt = StyleSheet.create({
  box: {
    width: 24,
    height: 24,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
});

// ─── Switch row ───────────────────────────────────────────────────────────────

function SwitchRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity style={styles.row} onPress={() => !disabled && onChange(!value)} activeOpacity={disabled ? 1 : 0.7}>
      <Text style={[styles.rowLabel, { color: disabled ? colors.textDisabled : colors.text }]}>{label}</Text>
      <SwitchControl value={value} onChange={onChange} disabled={disabled} />
    </TouchableOpacity>
  );
}

// ─── Checkbox row ─────────────────────────────────────────────────────────────

function CheckboxRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity style={styles.row} onPress={() => !disabled && onChange(!value)} activeOpacity={disabled ? 1 : 0.7}>
      <Text style={[styles.rowLabel, { color: disabled ? colors.textDisabled : colors.text }]}>{label}</Text>
      <CheckboxControl value={value} onChange={onChange} disabled={disabled} />
    </TouchableOpacity>
  );
}

// ─── Frequency slider ─────────────────────────────────────────────────────────

function FrequencySlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const trackWidthRef = useRef(0);
  const handleAnim = useRef(new Animated.Value(0)).current;
  const startXRef = useRef(0);
  const currentCountRef = useRef(value);

  const maxPos = useCallback(() => Math.max(0, trackWidthRef.current - 24), []);

  const posFromCount = (count: number) => {
    const max = maxPos();
    return max <= 0 ? 0 : (count / 10) * max;
  };

  const countFromPos = (pos: number) => {
    const max = maxPos();
    return max <= 0 ? 0 : Math.round((pos / max) * 10);
  };

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    trackWidthRef.current = w;
    handleAnim.setValue(posFromCount(currentCountRef.current));
  };

  useEffect(() => {
    currentCountRef.current = value;
    if (trackWidthRef.current > 0) {
      Animated.spring(handleAnim, {
        toValue: posFromCount(value),
        useNativeDriver: false,
        damping: 20,
        stiffness: 200,
      }).start();
    }
  }, [value]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        handleAnim.stopAnimation(v => { startXRef.current = v; });
      },
      onPanResponderMove: (_, gs) => {
        const newPos = Math.max(0, Math.min(maxPos(), startXRef.current + gs.dx));
        handleAnim.setValue(newPos);
        const newCount = countFromPos(newPos);
        if (newCount !== currentCountRef.current) {
          currentCountRef.current = newCount;
          onChange(newCount);
        }
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

  const trackBg     = disabled ? colors.bgDisabled  : colors.brandSecondary;
  const progressBg  = disabled ? colors.bgDisabled  : colors.brand;
  const handleBg    = disabled ? colors.bgDisabled  : colors.brand;
  const labelColor  = disabled ? colors.textDisabled : colors.text;
  const handleText  = disabled ? colors.textDisabled : colors.textBrandOnBrand;

  return (
    <View style={styles.sliderItem}>
      <View style={styles.sliderHeader}>
        <Text style={[styles.rowLabel, { color: labelColor }]}>Fréquence</Text>
        <Text style={[styles.sliderRange, { color: labelColor }]}>0–10</Text>
      </View>
      <View style={styles.sliderTrackWrap} onLayout={onTrackLayout}>
        <View style={[styles.sliderTrack, { backgroundColor: trackBg }]}>
          <Animated.View style={[styles.sliderProgress, { width: progressWidth, backgroundColor: progressBg }]} />
        </View>
        <Animated.View
          style={[styles.sliderHandle, { left: handleAnim, backgroundColor: handleBg }]}
          {...(disabled ? {} : panResponder.panHandlers)}
        >
          <Text style={[styles.sliderHandleText, { color: handleText }]}>{value}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title?: string; description?: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!title && !description) return null;
  return (
    <View style={styles.sectionHeader}>
      {title && <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>}
      {description && <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>{description}</Text>}
    </View>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NotificationsSettingsPage() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const { settingsData } = useSettingsNav();
  const insets = useSafeAreaInsets();

  // Initialize directly from pre-fetched context data — no loading flash
  const [paused, setPaused]               = useState(settingsData?.notifications_paused ?? false);
  const [revealComment, setRevealComment] = useState(settingsData?.notif_reveal_comment ?? true);
  const [revealSticker, setRevealSticker] = useState(settingsData?.notif_reveal_sticker ?? true);
  const [revealMention, setRevealMention] = useState(settingsData?.notif_reveal_mention ?? true);
  const [motivPeriods, setMotivPeriods]   = useState<Period[]>((settingsData?.notification_periods as Period[] | undefined) ?? ["morning", "afternoon", "evening"]);
  const [motivCount, setMotivCount]       = useState(settingsData?.daily_notifications_count ?? 3);

  const motivSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Capture snapshot at mount time for comparison
  const snapshot = useRef(settingsData);

  // Background verification — only update state for values that differ from snapshot
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("notifications_paused, notif_reveal_comment, notif_reveal_sticker, notif_reveal_mention, daily_notifications_count, notification_periods")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const snap = snapshot.current;
        const fresh = {
          notifications_paused:     data.notifications_paused ?? false,
          notif_reveal_comment:     data.notif_reveal_comment ?? true,
          notif_reveal_sticker:     data.notif_reveal_sticker ?? true,
          notif_reveal_mention:     data.notif_reveal_mention ?? true,
          daily_notifications_count: data.daily_notifications_count ?? 3,
          notification_periods:     (data.notification_periods ?? ["morning", "afternoon", "evening"]) as Period[],
        };
        if (fresh.notifications_paused !== (snap?.notifications_paused ?? false))         setPaused(fresh.notifications_paused);
        if (fresh.notif_reveal_comment !== (snap?.notif_reveal_comment ?? true))          setRevealComment(fresh.notif_reveal_comment);
        if (fresh.notif_reveal_sticker !== (snap?.notif_reveal_sticker ?? true))          setRevealSticker(fresh.notif_reveal_sticker);
        if (fresh.notif_reveal_mention !== (snap?.notif_reveal_mention ?? true))          setRevealMention(fresh.notif_reveal_mention);
        if (fresh.daily_notifications_count !== (snap?.daily_notifications_count ?? 3))   setMotivCount(fresh.daily_notifications_count);
        if (JSON.stringify(fresh.notification_periods) !== JSON.stringify(snap?.notification_periods ?? ["morning", "afternoon", "evening"])) {
          setMotivPeriods(fresh.notification_periods);
        }
      });
  }, [user]);

  // ── Save helpers ──
  const saveField = useCallback(async (field: string, val: any) => {
    if (!user) return;
    await supabase.from("profiles").update({ [field]: val }).eq("id", user.id);
  }, [user]);

  const saveMotivation = useCallback(async (count: number, periods: Period[]) => {
    if (!user) return;
    await supabase.from("profiles").update({
      daily_notifications_count: count,
      notification_periods: periods,
    }).eq("id", user.id);
    await scheduleMotivationalNotifications(count, periods);
  }, [user]);

  // ── Toggle handlers ──
  const handlePaused = (v: boolean) => {
    setPaused(v);
    saveField("notifications_paused", v);
  };

  const handleRevealComment = (v: boolean) => { setRevealComment(v); saveField("notif_reveal_comment", v); };
  const handleRevealSticker = (v: boolean) => { setRevealSticker(v); saveField("notif_reveal_sticker", v); };
  const handleRevealMention = (v: boolean) => { setRevealMention(v); saveField("notif_reveal_mention", v); };

  const handleMotivPeriod = (period: Period) => {
    const next = motivPeriods.includes(period)
      ? motivPeriods.filter(p => p !== period)
      : [...motivPeriods, period];
    setMotivPeriods(next);
    if (motivSaveTimer.current) clearTimeout(motivSaveTimer.current);
    motivSaveTimer.current = setTimeout(() => saveMotivation(motivCount, next), 600);
  };

  const handleMotivCount = (count: number) => {
    setMotivCount(count);
    if (motivSaveTimer.current) clearTimeout(motivSaveTimer.current);
    motivSaveTimer.current = setTimeout(() => saveMotivation(count, motivPeriods), 800);
  };

  useEffect(() => () => { if (motivSaveTimer.current) clearTimeout(motivSaveTimer.current); }, []);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── I. Pause globale ── */}
      <View style={styles.section}>
        <View style={styles.itemsList}>
          <SwitchRow label="Tout mettre en pause" value={paused} onChange={handlePaused} />
        </View>
      </View>

      {/* ── II. Reveal ── */}
      <View style={styles.section}>
        <SectionHeader
          title="Notification Reveal"
          description="Ensemble des activités liées au Reveal"
        />
        <View style={styles.itemsList}>
          <SwitchRow label="Réaction par commentaire"       value={revealComment} onChange={handleRevealComment} disabled={paused} />
          <SwitchRow label="Réaction par sticker"           value={revealSticker} onChange={handleRevealSticker} disabled={paused} />
          <SwitchRow label="Identification en commentaire"  value={revealMention} onChange={handleRevealMention} disabled={paused} />
        </View>
      </View>

      {/* ── III. Motivation ── */}
      <View style={styles.section}>
        <SectionHeader
          title="Notification motivation"
          description="Rappels quotidiens d'ajouter des moments au jardin"
        />
        <View style={styles.itemsList}>
          <CheckboxRow label="Matinée"     value={motivPeriods.includes("morning")}   onChange={() => handleMotivPeriod("morning")}   disabled={paused} />
          <CheckboxRow label="Après-midi"  value={motivPeriods.includes("afternoon")} onChange={() => handleMotivPeriod("afternoon")} disabled={paused} />
          <CheckboxRow label="Soirée"      value={motivPeriods.includes("evening")}   onChange={() => handleMotivPeriod("evening")}   disabled={paused} />
          <FrequencySlider value={motivCount} onChange={handleMotivCount} disabled={paused} />
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xxl,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
  },

  section: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,
    alignSelf: "stretch",
  },

  // ── Section header
  sectionHeader: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs,
    alignSelf: "stretch",
  },
  sectionTitle: {
    ...textStyles.bodyStrong,
  },
  sectionDesc: {
    ...textStyles.bodyExtraSmall,
  },

  // ── Items list
  itemsList: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs2,
    alignSelf: "stretch",
  },

  // ── Generic row
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    paddingVertical: spacing.xs2,
  },
  rowLabel: {
    ...textStyles.bodyBase,
    flex: 1,
  },

  // ── Slider item
  sliderItem: {
    minWidth: 120,
    paddingVertical: spacing.xs,
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,
    alignSelf: "stretch",
  },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignSelf: "stretch",
  },
  sliderRange: {
    ...textStyles.bodyBase,
  },
  sliderTrackWrap: {
    alignSelf: "stretch",
    height: 24,
    justifyContent: "center",
    position: "relative",
  },
  sliderTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 8,
    height: 8,
    borderRadius: radii.xs,
    overflow: "hidden",
  },
  sliderProgress: {
    height: "100%",
    borderRadius: radii.xs,
  },
  sliderHandle: {
    position: "absolute",
    top: 0,
    width: 24,
    height: 24,
    borderRadius: radii.xs,
    justifyContent: "center",
    alignItems: "center",
  },
  sliderHandleText: {
    ...textStyles.bodySmall,
  },
});
