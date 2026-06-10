import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { radii, spacing, textStyles, type ThemeColors } from "../../lib/theme";

// ─── Shared constants ─────────────────────────────────────────────────────────

export const APP_NAME        = "Disclose";
export const COMPANY_NAME    = "Source Studio";
export const COMPANY_EMAIL   = "[contact@disclose.app]";
export const COMPANY_ADDRESS = "[Adresse de la société, Ville, Pays]";
export const MIN_AGE         = 16;

// ─── Section ──────────────────────────────────────────────────────────────────

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

// ─── Text atoms ───────────────────────────────────────────────────────────────

export function P({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return <Text style={[styles.body, { color: colors.textSecondary }]}>{children}</Text>;
}

export function BulletItem({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.dot, { backgroundColor: colors.textTertiary }]} />
      <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{children}</Text>
    </View>
  );
}

export function BulletList({ items }: { items: string[] }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.bulletList}>
      {items.map((item, i) => <BulletItem key={i}>{item}</BulletItem>)}
    </View>
  );
}

export function Highlight({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.highlight, { backgroundColor: colors.brand }]}>
      <Text style={[styles.highlightText, { color: colors.textBrandOnBrand }]}>{children}</Text>
    </View>
  );
}

export function ContactCard() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.contactCard, { backgroundColor: colors.brand }]}>
      <View style={styles.contactRow}>
        <Text style={[styles.contactLabel, { color: colors.textBrandOnBrand, opacity: 0.7 }]}>Société</Text>
        <Text style={[styles.contactValue, { color: colors.textBrandOnBrand }]}>{COMPANY_NAME}</Text>
      </View>
      <View style={[styles.contactDivider, { backgroundColor: "rgba(255,255,255,0.15)" }]} />
      <View style={styles.contactRow}>
        <Text style={[styles.contactLabel, { color: colors.textBrandOnBrand, opacity: 0.7 }]}>Adresse</Text>
        <Text style={[styles.contactValue, { color: colors.textBrandOnBrand, opacity: 0.85 }]}>{COMPANY_ADDRESS}</Text>
      </View>
      <View style={[styles.contactDivider, { backgroundColor: "rgba(255,255,255,0.15)" }]} />
      <View style={styles.contactRow}>
        <Text style={[styles.contactLabel, { color: colors.textBrandOnBrand, opacity: 0.7 }]}>E-mail</Text>
        <Text style={[styles.contactValue, { color: colors.textBrandOnBrand }]}>{COMPANY_EMAIL}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (_colors: ThemeColors) => StyleSheet.create({
  section: {
    flexDirection: "column",
    gap: spacing.md,
    alignSelf: "stretch",
  },
  sectionTitle: {
    ...textStyles.bodyStrong,
  },
  sectionBody: {
    flexDirection: "column",
    gap: spacing.md,
  },
  body: {
    ...textStyles.bodyBase,
    lineHeight: 22,
  },
  bulletList: {
    flexDirection: "column",
    gap: spacing.xs2,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 999,
    marginTop: 10,
    flexShrink: 0,
  },
  bulletText: {
    ...textStyles.bodyBase,
    lineHeight: 22,
    flex: 1,
  },
  highlight: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  highlightText: {
    ...textStyles.bodyBase,
    lineHeight: 22,
  },
  contactCard: {
    borderRadius: radii.md,
    overflow: "hidden",
  },
  contactRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: "flex-start",
  },
  contactDivider: {
    height: 1,
    marginHorizontal: spacing.lg,
  },
  contactLabel: {
    ...textStyles.bodyExtraSmall,
    width: 52,
    flexShrink: 0,
    paddingTop: 3,
  },
  contactValue: {
    ...textStyles.bodyBase,
    flex: 1,
    lineHeight: 20,
  },
});
