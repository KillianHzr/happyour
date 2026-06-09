import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import BottomSheet from "./BottomSheet";
import { useTheme, useThemedStyles } from "../lib/theme-context";
import { spacing, radii, textStyles, type ThemeColors } from "../lib/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  element?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "brand";
  onConfirm: () => void;
  loading?: boolean;
};

export default function ConfirmModal({
  visible, onClose, title, subtitle, element,
  confirmLabel, cancelLabel = "Annuler", confirmVariant = "danger",
  onConfirm, loading,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <BottomSheet visible={visible} onClose={() => !loading && onClose()}>
      <View style={styles.content}>
        {/* textBlock + optional element — gap space/300 between them */}
        <View style={styles.bodyBlock}>
          <View style={styles.textBlock}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {subtitle && (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
            )}
          </View>
          {element != null && (
            <View style={styles.elementWrap}>{element}</View>
          )}
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity
            style={[
              styles.confirmBtn,
              confirmVariant === "brand"
                ? { backgroundColor: colors.brand }
                : { backgroundColor: colors.bgDanger },
              loading && { opacity: 0.7 },
            ]}
            onPress={onConfirm}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={confirmVariant === "brand" ? colors.textInverse : colors.textDangerOnDanger} />
              : <Text style={[
                  styles.confirmText,
                  { color: confirmVariant === "brand" ? colors.textInverse : colors.textDangerOnDanger },
                ]}>{confirmLabel}</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={[styles.cancelText, { color: colors.textNeutral }]}>{cancelLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    flexDirection: "column",
    gap: spacing.xl3,             // space/1200 = 48px entre bodyBlock et buttons
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  bodyBlock: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: spacing.md,              // space/300 = 12px entre textBlock et element
  },
  textBlock: {
    flexDirection: "column",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    ...textStyles.subtitleStrong,
    textAlign: "center",
    alignSelf: "stretch",
  },
  subtitle: {
    ...textStyles.bodyBase,
    textAlign: "center",
    alignSelf: "stretch",
  },
  elementWrap: {
    alignItems: "center",
    alignSelf: "stretch",
  },
  buttons: {
    flexDirection: "column",
    gap: spacing.md,
    alignSelf: "stretch",
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
  },
  cancelBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.bgNeutralTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelText: {
    ...textStyles.singleLineSubheadingStrong,
  },
});
