import { useEffect, useRef, useState } from "react";
import {
  Animated, Dimensions, Easing, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { spacing, radii, textStyles, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import Icon from "../Icon";
import EdgeSwipeBack from "../EdgeSwipeBack";
import BottomSheet from "../BottomSheet";

const bgGradientOrange = require("../../assets/images/background-gradient-orange.png");
const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Réservé pour la suite (chargement des reveals archivés du groupe). */
  groupId?: string;
};

export default function ArchivesSheet({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const [mounted, setMounted] = useState(visible);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const sheetAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      sheetAnim.setValue(SCREEN_WIDTH);
      requestAnimationFrame(() => {
        Animated.timing(sheetAnim, {
          toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
      });
    } else if (mounted) {
      Animated.timing(sheetAnim, {
        toValue: SCREEN_WIDTH, duration: 250, easing: Easing.in(Easing.quad), useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retour par glissement depuis le bord : le geste a déjà animé la sortie → on démonte direct.
  const closeImmediate = () => { setMounted(false); onClose(); };

  if (!mounted) return null;

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: sheetAnim }] }]}
      >
        <EdgeSwipeBack
          style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg, paddingTop: insets.top }]}
          onBack={closeImmediate}
        >
        {/* ── Header (même que la single / les paramètres) ── */}
        <View style={styles.header}>
          <View style={styles.headerLeading}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="chevron-left" size={20} color={colors.icon} />
            </TouchableOpacity>
            <Text style={styles.title}>Archives</Text>
          </View>
          <TouchableOpacity style={styles.calendarBtn} onPress={() => {}} activeOpacity={0.8}>
            <Icon name="calendar" size={20} color={colors.iconNeutral} />
          </TouchableOpacity>
        </View>

        {/* ── Contenu ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Section 1 (sans titre) : bandeau premium */}
          <View style={styles.section}>
            <TouchableOpacity style={styles.archiveReveal} activeOpacity={0.85} onPress={() => setShowComingSoon(true)}>
              <Image source={bgGradientOrange} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory" />
              <View style={styles.buttonContent}>
                <View style={styles.titleRow}>
                  <Text style={styles.premiumText}>Premium</Text>
                  <View style={styles.keyBtn}>
                    <Icon name="key" size={16} color={colors.iconFix} />
                  </View>
                </View>
                <Text style={styles.unlockText}>Déverrouille toutes les archives du Reveal</Text>
              </View>
              <View style={styles.chevronBtn}>
                <Icon name="chevron-right" size={20} color={colors.iconFix} />
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* ── Modal : abonnement premium (bientôt disponible) ── */}
        <BottomSheet visible={showComingSoon} onClose={() => setShowComingSoon(false)}>
          <View style={styles.comingContent}>
            <View style={styles.comingTextBlock}>
              <View style={[styles.comingIconWrap, { backgroundColor: colors.brandTertiary }]}>
                <Icon name="key" size={28} color={colors.brand} />
              </View>
              <Text style={styles.comingTitle}>Bientôt disponible</Text>
              <Text style={styles.comingSubtitle}>
                L'accès Premium aux archives du Reveal arrivera avec l'abonnement. Tu seras notifié dès son lancement.
              </Text>
            </View>
            <TouchableOpacity style={styles.comingBtn} onPress={() => setShowComingSoon(false)} activeOpacity={0.8}>
              <Text style={styles.comingBtnText}>OK, j'attends !</Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>
        </EdgeSwipeBack>
      </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingRight: spacing.lg,
    marginTop: spacing.lg,
    minHeight: 40,
  },
  headerLeading: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...textStyles.subtitleStrong,
    color: colors.text,
  },
  calendarBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.card,
  },

  // ── Contenu ──
  content: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.lg,                // space/400
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
  },
  section: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,
    alignSelf: "stretch",
  },

  // ── Bandeau premium (archive-reveal) ──
  archiveReveal: {
    flexDirection: "row",
    padding: spacing.lg,            // space/400
    justifyContent: "center",
    alignItems: "center",
    gap: 0,                         // space/empty
    alignSelf: "stretch",
    borderRadius: radii.md,         // radius/300
    borderWidth: 1,
    borderColor: colors.borderBrandSecondary,
    overflow: "hidden",
  },
  buttonContent: {
    flex: 1,
    flexDirection: "column",
    alignItems: "flex-start",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "stretch",
  },
  premiumText: {
    ...textStyles.heading,
    color: colors.textFix,
  },
  keyBtn: {
    width: 24,
    height: 24,
    padding: 0,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 6,
    backgroundColor: colors.opacityLight,
  },
  unlockText: {
    ...textStyles.bodySmall,
    color: colors.textFix,
  },
  chevronBtn: {
    width: 40,
    height: 40,
    padding: 0,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 0,
  },

  // ── Modal "bientôt disponible" ──
  comingContent: {
    flexDirection: "column",
    gap: spacing.xl3,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  comingTextBlock: {
    flexDirection: "column",
    alignItems: "center",
    gap: spacing.sm,
  },
  comingIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
  },
  comingTitle: {
    ...textStyles.subtitleStrong,
    color: colors.text,
    textAlign: "center",
  },
  comingSubtitle: {
    ...textStyles.bodyBase,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  comingBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.brand,
    justifyContent: "center",
    alignItems: "center",
  },
  comingBtnText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
    color: colors.textBrandOnBrand,
  },
});
