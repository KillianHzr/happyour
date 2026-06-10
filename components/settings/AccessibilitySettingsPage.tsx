import { useState } from "react";
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import Svg, { Circle, Mask, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { radii, spacing, textStyles, typography, type ThemeColors } from "../../lib/theme";
import Icon from "../Icon";
import BottomSheet from "../BottomSheet";
import { useSettingsNav } from "../SettingsSheet";

// Locale code ↔ display name mapping
const LANGUAGES: { locale: string; label: string }[] = [
  { locale: "fr-FR", label: "Français" },
];

function localeToLabel(locale: string): string {
  return LANGUAGES.find(l => l.locale === locale)?.label ?? locale;
}

// ─── Radio SVG ────────────────────────────────────────────────────────────────

const RADIO_BORDER = "M12 24V22.5C6.20101 22.5 1.5 17.799 1.5 12H0H-1.5C-1.5 19.4558 4.54416 25.5 12 25.5V24ZM24 12H22.5C22.5 17.799 17.799 22.5 12 22.5V24V25.5C19.4558 25.5 25.5 19.4558 25.5 12H24ZM12 0V1.5C17.799 1.5 22.5 6.20101 22.5 12H24H25.5C25.5 4.54416 19.4558 -1.5 12 -1.5V0ZM12 0V-1.5C4.54416 -1.5 -1.5 4.54416 -1.5 12H0H1.5C1.5 6.20101 6.20101 1.5 12 1.5V0Z";
const RADIO_FILL  = "M0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12Z";

function RadioIcon({ checked, color }: { checked: boolean; color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Mask id="radio-mask" fill="white">
        <Path d={RADIO_FILL} />
      </Mask>
      <Path d={RADIO_FILL} fill="white" fillOpacity={0} />
      <Path d={RADIO_BORDER} fill={color} mask="url(#radio-mask)" />
      {checked && <Circle cx={12} cy={12} r={7.5} fill={color} />}
    </Svg>
  );
}

// ─── Knob SVG (for switch) ────────────────────────────────────────────────────

function KnobIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path
        d="M18 9C18 13.9706 13.9706 18 9 18C4.02944 18 0 13.9706 0 9C0 4.02944 4.02944 0 9 0C13.9706 0 18 4.02944 18 9Z"
        fill={color}
      />
    </Svg>
  );
}

// ─── Disabled switch (static, non-interactive) ────────────────────────────────

function DisabledSwitch({ value }: { value: boolean }) {
  const { colors } = useTheme();
  const knobOffset = value ? 14 : 0;
  return (
    <View style={[switchSt.track, { backgroundColor: colors.bgDisabled, borderColor: colors.borderDisabled }]}>
      <View style={[switchSt.knob, { marginLeft: knobOffset }]}>
        <KnobIcon color={colors.iconDisabled} />
      </View>
    </View>
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
  knob: { width: 18, height: 18 },
});

// ─── Switch row (disabled-only variant) ───────────────────────────────────────

function SwitchRow({ label, value }: { label: string; value: boolean }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textDisabled }]}>{label}</Text>
      <DisabledSwitch value={value} />
    </View>
  );
}

// ─── Link row (chevron + trailing text) ───────────────────────────────────────

function LinkRow({ label, trailingText, onPress }: { label: string; trailingText?: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.rowTrailing}>
        {trailingText && (
          <Text style={[styles.trailingText, { color: colors.textSecondary }]}>{trailingText}</Text>
        )}
        <Icon name="chevron-right" size={20} color={colors.icon} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
    </View>
  );
}

// ─── Language modal ───────────────────────────────────────────────────────────

function LanguageModal({
  visible,
  current,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  current: string;
  onClose: () => void;
  onConfirm: (locale: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(current);

  const handleConfirm = () => onConfirm(selected);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={[styles.modalContent, { paddingBottom: insets.bottom + spacing.lg }]}>
        {/* Language list */}
        <View style={styles.langList}>
          {LANGUAGES.map(({ locale, label }) => {
            const checked = selected === locale;
            return (
              <TouchableOpacity
                key={locale}
                style={styles.langRow}
                onPress={() => setSelected(locale)}
                activeOpacity={0.7}
              >
                <Text style={[styles.langLabel, { color: colors.text }]}>{label}</Text>
                <RadioIcon checked={checked} color={colors.iconBrandTertiary} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Confirm */}
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: colors.brand }]}
          onPress={handleConfirm}
          activeOpacity={0.8}
        >
          <Text style={[styles.confirmText, { color: colors.textBrandOnBrand }]}>Valider</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AccessibilitySettingsPage() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { settingsData } = useSettingsNav();

  const [subtitlesEnabled] = useState(false);
  const [language, setLanguage] = useState(settingsData?.display_language ?? "fr-FR");
  const [showLangModal, setShowLangModal] = useState(false);

  const handleConfirmLanguage = async (locale: string) => {
    setLanguage(locale);
    setShowLangModal(false);
    if (user) {
      await supabase.from("profiles").update({ display_language: locale }).eq("id", user.id);
    }
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <SectionHeader title="Sous-titre" />
          <View style={styles.itemsList}>
            <SwitchRow label="Activer les sous-titres" value={subtitlesEnabled} />
            <LinkRow
              label="Langue d'affichage"
              trailingText={localeToLabel(language)}
              onPress={() => setShowLangModal(true)}
            />
          </View>
        </View>
      </ScrollView>

      <LanguageModal
        visible={showLangModal}
        current={language}
        onClose={() => setShowLangModal(false)}
        onConfirm={handleConfirmLanguage}
      />
    </>
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
  sectionHeader: {
    flexDirection: "column",
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  sectionTitle: {
    ...textStyles.bodyStrong,
  },
  itemsList: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs2,
    alignSelf: "stretch",
  },
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
  rowTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  trailingText: {
    ...textStyles.bodyBase,
  },

  // ── Language modal
  modalContent: {
    flexDirection: "column",
    gap: spacing.xl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  modalTitle: {
    ...textStyles.subtitleStrong,
    textAlign: "center",
  },
  langList: {
    flexDirection: "column",
    gap: spacing.xs2,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs2,
  },
  langLabel: {
    ...textStyles.bodyBase,
    flex: 1,
  },
  modalButtons: {
    flexDirection: "column",
    gap: spacing.md,
  },
  confirmBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
  },
  cancelBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
  },
});
