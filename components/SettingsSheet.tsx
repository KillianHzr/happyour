import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Animated, Dimensions, Easing, Modal, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, radii, textStyles } from "../lib/theme";
import { useTheme } from "../lib/theme-context";
import Icon from "./Icon";

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
};

const SettingsNavContext = createContext<SettingsNavContextType>({
  push: () => {},
  pop: () => {},
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

let _nextId = 0;

export default function SettingsSheet({ visible, onClose, initialPage }: Props) {
  const { colors } = useTheme();
  const [mounted, setMounted] = useState(false);
  const sheetAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const [stack, setStack] = useState<StackEntry[]>([]);
  const stackRef = useRef<StackEntry[]>([]);
  const isAnimating = useRef(false);
  const prevVisibleRef = useRef(false);
  const componentMountedRef = useRef(true);
  const initialPageRef = useRef(initialPage);

  useEffect(() => {
    initialPageRef.current = initialPage;
  }, [initialPage]);

  useEffect(() => {
    return () => { componentMountedRef.current = false; };
  }, []);

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

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={pop}
      statusBarTranslucent
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: colors.bg,
            transform: [{ translateX: sheetAnim }],
          },
        ]}
      >
        <SettingsNavContext.Provider value={{ push, pop }}>
          {stack.map((entry, index) => (
            <Animated.View
              key={entry.id}
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: colors.bg,
                  transform: [{ translateX: entry.translateX }],
                },
              ]}
            >
              <SettingsPageHeader
                title={entry.config.title}
                onBack={index === 0 ? triggerClose : pop}
                trailingButton={entry.config.trailingButton}
              />
              {entry.config.content}
            </Animated.View>
          ))}
        </SettingsNavContext.Provider>
      </Animated.View>
    </Modal>
  );
}
