import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Animated, Dimensions, Easing, Modal, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { spacing, radii, textStyles } from "../lib/theme";
import { useTheme } from "../lib/theme-context";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import Icon from "./Icon";
import Shape from "./Shape";
import EdgeSwipeBack from "./EdgeSwipeBack";

export type SettingsData = {
  recovery_email: string | null;
  notifications_paused: boolean;
  notif_reveal_comment: boolean;
  notif_reveal_sticker: boolean;
  notif_reveal_mention: boolean;
  daily_notifications_count: number;
  notification_periods: string[];
  display_language: string;
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── Types ───────────────────────────────────────────────────────────────────

export type SettingsPageConfig = {
  title: string;
  content: React.ReactNode;
  trailingButton?: {
    label: string;
    disabled?: boolean;
    onPress: () => void;
  };
};

type StackEntry = {
  id: number;
  config: SettingsPageConfig;
  translateX: Animated.Value;
};

// ─── Navigation Context ───────────────────────────────────────────────────────

type SettingsNavContextType = {
  push: (config: SettingsPageConfig) => void;
  pop: () => void;
  updateTopConfig: (partial: Partial<Pick<SettingsPageConfig, "trailingButton">>) => void;
  showToast: (message: string, type?: "success" | "error") => void;
  settingsData: SettingsData | null;
  refetchSettingsData: () => Promise<void>;
};

const SettingsNavContext = createContext<SettingsNavContextType>({
  push: () => {},
  pop: () => {},
  updateTopConfig: () => {},
  showToast: () => {},
  settingsData: null,
  refetchSettingsData: async () => {},
});

export const useSettingsNav = () => useContext(SettingsNavContext);

// ─── Header ──────────────────────────────────────────────────────────────────

type HeaderProps = {
  title: string;
  onBack: () => void;
  trailingButton?: SettingsPageConfig["trailingButton"];
};

function SettingsPageHeader({ title, onBack, trailingButton }: HeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[headerSt.header, { paddingTop: insets.top, marginTop: spacing.lg }]}>
      {/* leading-item */}
      <View style={headerSt.leading}>
        {/* icon-button */}
        <TouchableOpacity
          style={headerSt.iconBtn}
          onPress={onBack}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="chevron-left" size={20} color={colors.icon} />
        </TouchableOpacity>
        {/* text */}
        <View style={headerSt.titleWrap}>
          <Text style={[headerSt.titleText, { color: colors.text }]}>{title}</Text>
        </View>
      </View>
      {/* optional trailing button */}
      {trailingButton && (
        <TouchableOpacity
          style={[
            headerSt.trailingBtn,
            {
              backgroundColor: trailingButton.disabled
                ? colors.bgDisabled
                : colors.brand,
            },
          ]}
          onPress={trailingButton.disabled ? undefined : trailingButton.onPress}
          activeOpacity={trailingButton.disabled ? 1 : 0.8}
          disabled={trailingButton.disabled}
        >
          <Text
            style={[
              headerSt.trailingBtnText,
              {
                color: trailingButton.disabled
                  ? colors.textOnDisabled
                  : colors.textBrandOnBrand,
              },
            ]}
          >
            {trailingButton.label}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const headerSt = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: spacing.lg,   // space/400
    gap: spacing.xl,            // space/600
  },
  leading: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,            // space/200
  },
  iconBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  titleWrap: {
    flex: 1,
    flexDirection: "column",
    alignItems: "flex-start",
  },
  titleText: {
    ...textStyles.subtitleStrong,
  },
  trailingBtn: {
    padding: spacing.sm,        // space/200
    borderRadius: radii.sm,     // radius/200
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
  },
  trailingBtnText: {
    ...textStyles.singleLineBodyBaseStrong,
  },
});

// ─── SettingsSheet ────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onClose: () => void;
  initialPage: SettingsPageConfig;
};

type SettingsToast = { message: string; type: "success" | "error" };

let _nextId = 0;

export default function SettingsSheet({ visible, onClose, initialPage }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const [settingsData, setSettingsData] = useState<SettingsData | null>(null);
  const sheetAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const [stack, setStack] = useState<StackEntry[]>([]);
  const stackRef = useRef<StackEntry[]>([]);
  const isAnimating = useRef(false);
  const prevVisibleRef = useRef(false);
  const componentMountedRef = useRef(true);
  const initialPageRef = useRef(initialPage);

  // ── Toast ──
  const [toast, setToast] = useState<SettingsToast | null>(null);
  const toastAnim = useRef({
    opacity: new Animated.Value(0),
    translateY: new Animated.Value(-8),
  }).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    initialPageRef.current = initialPage;
    // Sync root stack entry so SettingsMainContent reflects updated props
    setStack(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[0] = { ...updated[0], config: { ...updated[0].config, content: initialPage.content, title: initialPage.title } };
      stackRef.current = updated;
      return updated;
    });
  }, [initialPage]);

  useEffect(() => {
    return () => { componentMountedRef.current = false; };
  }, []);

  const fetchSettingsData = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("recovery_email, notifications_paused, notif_reveal_comment, notif_reveal_sticker, notif_reveal_mention, daily_notifications_count, notification_periods, display_language")
      .eq("id", user.id)
      .single();
    if (data) {
      setSettingsData({
        recovery_email: data.recovery_email ?? null,
        notifications_paused: data.notifications_paused ?? false,
        notif_reveal_comment: data.notif_reveal_comment ?? true,
        notif_reveal_sticker: data.notif_reveal_sticker ?? true,
        notif_reveal_mention: data.notif_reveal_mention ?? true,
        daily_notifications_count: data.daily_notifications_count ?? 3,
        notification_periods: data.notification_periods ?? ["morning", "afternoon", "evening"],
        display_language: data.display_language ?? "fr-FR",
      });
    }
  }, [user]);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    Animated.parallel([
      Animated.timing(toastAnim.opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(toastAnim.translateY, { toValue: -8, duration: 200, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [toastAnim]);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastAnim.opacity.setValue(0);
    toastAnim.translateY.setValue(-8);
    setToast({ message, type });
    Animated.parallel([
      Animated.spring(toastAnim.opacity, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.spring(toastAnim.translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }),
    ]).start();
    toastTimerRef.current = setTimeout(dismissToast, 3000);
  }, [toastAnim, dismissToast]);

  // Animate the full sheet out, then notify parent
  const triggerClose = useCallback(() => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    Animated.timing(sheetAnim, {
      toValue: SCREEN_WIDTH,
      duration: 250,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      if (!componentMountedRef.current) return;
      isAnimating.current = false;
      setMounted(false);
      stackRef.current = [];
      setStack([]);
      onClose();
    });
  }, [onClose, sheetAnim]);

  // Handle visible prop changes
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      // Opening — reset stack to root page
      const initial: StackEntry = {
        id: ++_nextId,
        config: initialPageRef.current,
        translateX: new Animated.Value(0),
      };
      stackRef.current = [initial];
      sheetAnim.setValue(SCREEN_WIDTH);
      setStack([initial]);
      setMounted(true);
      fetchSettingsData();
      requestAnimationFrame(() => {
        Animated.timing(sheetAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    } else if (!visible && prevVisibleRef.current) {
      // Closed externally (e.g. system back)
      if (!isAnimating.current) {
        isAnimating.current = true;
        Animated.timing(sheetAnim, {
          toValue: SCREEN_WIDTH,
          duration: 250,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          if (!componentMountedRef.current) return;
          isAnimating.current = false;
          setMounted(false);
          stackRef.current = [];
          setStack([]);
        });
      }
    }
    prevVisibleRef.current = visible;
  }, [visible]);

  // Push a new sub-page onto the stack
  const push = useCallback((config: SettingsPageConfig) => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    const newEntry: StackEntry = {
      id: ++_nextId,
      config,
      translateX: new Animated.Value(SCREEN_WIDTH),
    };
    stackRef.current = [...stackRef.current, newEntry];
    setStack(s => [...s, newEntry]);
    requestAnimationFrame(() => {
      Animated.timing(newEntry.translateX, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        isAnimating.current = false;
      });
    });
  }, []);

  // Update the config of the top page (e.g. enable/disable trailing button)
  const updateTopConfig = useCallback((partial: Partial<Pick<SettingsPageConfig, "trailingButton">>) => {
    setStack(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const top = updated[updated.length - 1];
      updated[updated.length - 1] = { ...top, config: { ...top.config, ...partial } };
      stackRef.current = updated;
      return updated;
    });
  }, []);

  // Pop the top sub-page, or close the sheet if at root
  const pop = useCallback(() => {
    if (isAnimating.current) return;
    const s = stackRef.current;
    if (s.length <= 1) {
      triggerClose();
      return;
    }
    isAnimating.current = true;
    const topEntry = s[s.length - 1];
    Animated.timing(topEntry.translateX, {
      toValue: SCREEN_WIDTH,
      duration: 250,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      if (!componentMountedRef.current) return;
      isAnimating.current = false;
      stackRef.current = stackRef.current.filter(e => e.id !== topEntry.id);
      setStack(prev => prev.filter(e => e.id !== topEntry.id));
    });
  }, [triggerClose]);

  // Versions "immédiates" pour le retour par glissement (le geste a déjà animé la sortie)
  const popImmediate = useCallback(() => {
    const s = stackRef.current;
    if (s.length <= 1) return;
    const top = s[s.length - 1];
    stackRef.current = s.filter(e => e.id !== top.id);
    setStack(prev => prev.filter(e => e.id !== top.id));
  }, []);

  const closeImmediate = useCallback(() => {
    if (!componentMountedRef.current) return;
    isAnimating.current = false;
    setMounted(false);
    stackRef.current = [];
    setStack([]);
    onClose();
  }, [onClose]);

  if (!mounted) return null;

  // Header height: paddingTop (safe area) + marginTop (spacing.lg=16) + iconBtn (40) + marginTop below header
  const toastTop = insets.top + 16 + 40 + 16;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={pop}
      statusBarTranslucent
    >
      {/* Requis pour que les gestes (swipe-back) fonctionnent à l'intérieur d'un Modal RN */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Fond transparent : chaque page porte son propre fond, donc le swipe-back révèle
          directement le contenu derrière (profil) pendant le glissement, pas à la fin. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { transform: [{ translateX: sheetAnim }] },
        ]}
      >
        <SettingsNavContext.Provider value={{ push, pop, updateTopConfig, showToast, settingsData, refetchSettingsData: fetchSettingsData }}>
          {stack.map((entry, index) => (
            <Animated.View
              key={entry.id}
              style={[
                StyleSheet.absoluteFillObject,
                { transform: [{ translateX: entry.translateX }] },
              ]}
            >
              <EdgeSwipeBack
                style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg }]}
                enabled={index === stack.length - 1}
                onBack={index === 0 ? closeImmediate : popImmediate}
              >
                <SettingsPageHeader
                  title={entry.config.title}
                  onBack={index === 0 ? triggerClose : pop}
                  trailingButton={entry.config.trailingButton}
                />
                {entry.config.content}
              </EdgeSwipeBack>
            </Animated.View>
          ))}

          {/* ── In-modal toast ── */}
          {toast && (
            <Animated.View
              style={[
                toastSt.toast,
                {
                  top: toastTop,
                  backgroundColor: colors.card,
                  opacity: toastAnim.opacity,
                  transform: [{ translateY: toastAnim.translateY }],
                },
              ]}
              pointerEvents="box-none"
            >
              <Shape name="photo" size={20} color={colors.iconBrandTertiary} />
              <Text style={[toastSt.text, { color: colors.text }]} numberOfLines={2}>
                {toast.message}
              </Text>
              <TouchableOpacity onPress={dismissToast} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="x" size={20} color={colors.icon} />
              </TouchableOpacity>
            </Animated.View>
          )}
        </SettingsNavContext.Provider>
      </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const toastSt = StyleSheet.create({
  toast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: radii.sm,
  },
  text: {
    flex: 1,
    ...textStyles.bodyStrong,
  },
});
