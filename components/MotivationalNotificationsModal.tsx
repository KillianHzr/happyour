import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../lib/toast-context";
import { colors, theme } from "../lib/theme";
import { CloseIcon } from "./groups/GroupIcons";
import { scheduleMotivationalNotifications } from "../lib/notifications";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SLIDER_WIDTH = SCREEN_WIDTH - 40 - 48;
const MAX_NOTIFS = 10;

type Period = "morning" | "afternoon" | "evening";

type Props = {
  visible: boolean;
  onClose: () => void;
  initialValue?: number;
  initialPeriods?: Period[];
};

const BellIcon = ({ color = "#FFF" }) => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <Path
      d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const SelectionCircle = ({ active }: { active: boolean }) => (
  <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
    {active && <View style={styles.radioInner} />}
  </View>
);

export default function MotivationalNotificationsModal({ 
  visible, 
  onClose, 
  initialValue = 3,
  initialPeriods = ["morning", "afternoon", "evening"]
}: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [count, setCount] = useState(initialValue);
  const [periods, setPeriods] = useState<Period[]>(initialPeriods);
  const [saving, setSaving] = useState(false);

  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setCount(initialValue);
      setPeriods(initialPeriods.length > 0 ? initialPeriods : ["morning", "afternoon", "evening"]);
      const initialPos = (initialValue / MAX_NOTIFS) * SLIDER_WIDTH;
      translateX.value = initialPos;
    }
  }, [visible, initialValue, initialPeriods]);

  const updateCount = (x: number) => {
    const newCount = Math.round((x / SLIDER_WIDTH) * MAX_NOTIFS);
    const clamped = Math.max(0, Math.min(MAX_NOTIFS, newCount));
    if (clamped !== count) {
      setCount(clamped);
    }
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      const nextX = startX.value + event.translationX;
      const clampedX = Math.max(0, Math.min(SLIDER_WIDTH, nextX));
      translateX.value = clampedX;
      runOnJS(updateCount)(clampedX);
    })
    .onEnd(() => {
      const step = SLIDER_WIDTH / MAX_NOTIFS;
      const nearestStep = Math.round(translateX.value / step) * step;
      translateX.value = withSpring(nearestStep, { damping: 20, stiffness: 200 });
    });

  const animatedHandleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: translateX.value,
  }));

  const togglePeriod = (period: Period) => {
    setPeriods(prev => 
      prev.includes(period) 
        ? prev.filter(p => p !== period) 
        : [...prev, period]
    );
  };

  const isValid = count === 0 || periods.length > 0;

  const handleSave = async () => {
    if (!user || !isValid) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          daily_notifications_count: count,
          notification_periods: periods
        })
        .eq("id", user.id);

      if (error) throw error;

      await scheduleMotivationalNotifications(count, periods);
      showToast("Paramètres enregistrés", undefined, "success");
      onClose();
    } catch (e: any) {
      showToast("Erreur", "Vérifie ta connexion ou réessaie.", "error");
    } finally {
      setSaving(false);
    }
  };

  const renderTicks = () => {
    const ticks = [];
    for (let i = 0; i <= MAX_NOTIFS; i++) {
      const left = (i / MAX_NOTIFS) * SLIDER_WIDTH;
      ticks.push(
        <View key={i} style={[styles.tick, { left: left - 1 }, i <= count && { backgroundColor: "rgba(255,255,255,0.5)" }]} />
      );
    }
    return ticks;
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
          <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 20 }]} onPress={onClose}>
            <CloseIcon />
          </TouchableOpacity>

          <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <BellIcon />
              </View>
              <Text style={styles.title}>Notifications de motivation</Text>
              <Text style={styles.description}>
                Reste inspiré tout au long de la journée avec des rappels positifs.
              </Text>
            </View>

            <View style={styles.box}>
              <Text style={styles.boxText}>
                Tu recevras <Text style={styles.countText}>{count}</Text> notification{count > 1 ? "s" : ""} par jour.
              </Text>

              <View style={styles.sliderContainer}>
                <View style={styles.sliderTrack}>
                  {renderTicks()}
                  <Animated.View style={[styles.sliderProgress, animatedProgressStyle]} />
                </View>
                <GestureDetector gesture={panGesture}>
                  <Animated.View style={[styles.sliderHandle, animatedHandleStyle]}>
                    <View style={styles.handleInner} />
                  </Animated.View>
                </GestureDetector>
              </View>

              <View style={styles.sliderLabels}>
                <Text style={styles.label}>0</Text>
                <Text style={styles.label}>10</Text>
              </View>

              {count > 0 && (
                <View style={styles.periodsSection}>
                  <Text style={styles.periodsTitle}>À quels moments ?</Text>
                  <View style={styles.periodsList}>
                    {(["morning", "afternoon", "evening"] as Period[]).map((p, idx) => {
                      const active = periods.includes(p);
                      const labels = { morning: "Matin", afternoon: "Après-midi", evening: "Soir" };
                      return (
                        <View key={p} style={{ width: "100%" }}>
                          <TouchableOpacity
                            style={[styles.periodItem, active && styles.periodItemActive]}
                            onPress={() => togglePeriod(p)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.periodLabel, active && styles.periodLabelActive]}>
                              {labels[p]}
                            </Text>
                            <SelectionCircle active={active} />
                          </TouchableOpacity>
                          {idx < 2 && <View style={styles.itemDivider} />}
                        </View>
                      );
                    })}
                  </View>
                  {!isValid && (
                    <Text style={styles.errorText}>Choisis au moins un moment.</Text>
                  )}
                </View>
              )}
            </View>

            <View style={{ flex: 1 }} />

            <TouchableOpacity
              style={[theme.accentButton, styles.confirmBtn, (!isValid || saving) && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={!isValid || saving}
              activeOpacity={0.8}
            >
              {saving ? <ActivityIndicator color="#000" /> : <Text style={theme.accentButtonText}>Confirmer</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  closeBtn: { position: "absolute", right: 20, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  content: { flex: 1, paddingHorizontal: 20, alignItems: "center" },
  header: { alignItems: "center", marginBottom: 30 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", marginBottom: 24 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: colors.text, textAlign: "center", marginBottom: 12, letterSpacing: -0.5 },
  description: { fontSize: 16, fontFamily: "Inter_400Regular", color: colors.secondary, textAlign: "center", lineHeight: 24, paddingHorizontal: 10 },
  box: { width: "100%", backgroundColor: "#2C2C2E", borderRadius: 20, padding: 20, alignItems: "center" },
  boxText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.text, textAlign: "center", marginBottom: 16, lineHeight: 22 },
  countText: { color: "#FFF", fontSize: 20, fontFamily: "Inter_800ExtraBold" },
  sliderContainer: { width: SLIDER_WIDTH, height: 50, justifyContent: "center" },
  sliderTrack: { width: "100%", height: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 3, position: "relative" },
  tick: { position: "absolute", width: 2, height: 6, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.15)", top: 0, zIndex: 1 },
  sliderProgress: { height: "100%", backgroundColor: "#FFF", borderRadius: 3 },
  sliderHandle: { position: "absolute", width: 28, height: 28, borderRadius: 14, backgroundColor: "#FFF", left: -14, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5, zIndex: 10 },
  handleInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#000" },
  sliderLabels: { width: SLIDER_WIDTH, flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  label: { fontSize: 13, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.9)" },
  
  periodsSection: { width: "100%", marginTop: 20, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)", paddingTop: 20 },
  periodsTitle: { fontSize: 12, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 12, textAlign: "center", letterSpacing: 1 },
  periodsList: { width: "100%", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 14, overflow: "hidden" },
  periodItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  periodItemActive: { backgroundColor: "rgba(255,255,255,0.04)" },
  periodLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.7)" },
  periodLabelActive: { color: "#FFF" },
  itemDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginHorizontal: 16 },
  
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },
  radioOuterActive: { borderColor: "#FFF" },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FFF" },
  
  errorText: { color: "#FF453A", fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 12, textAlign: "center" },
  confirmBtn: { width: "100%", height: 60, justifyContent: "center" },
});
