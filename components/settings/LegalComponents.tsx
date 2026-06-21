import {
  createContext, useCallback, useContext, useId, useMemo, useState,
  type ReactNode,
} from "react";
import { type LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { radii, spacing, textStyles, type ThemeColors } from "../../lib/theme";

// ─── Shared constants ─────────────────────────────────────────────────────────

export const APP_NAME        = "Disclose";
export const COMPANY_NAME    = "Source Studio";
export const COMPANY_EMAIL   = "source.studio@etik.com";
export const COMPANY_ADDRESS = "Annecy, France";
export const MIN_AGE         = 16;

// ─── Section ──────────────────────────────────────────────────────────────────
// Conteneur : column, align-items flex-start, gap space/300.
// Titre : body-strong, text/default/secondary.

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}

// ─── Text atoms ───────────────────────────────────────────────────────────────
// Texte : body-base, text/default/default.

export function P({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return <Text style={[styles.body, { color: colors.text }]}>{children}</Text>;
}

export function BulletItem({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.dot, { backgroundColor: colors.textTertiary }]} />
      <Text style={[styles.bulletText, { color: colors.text }]}>{children}</Text>
    </View>
  );
}

// Texte avec liste à puces : un intro optionnel (texte normal) suivi des puces.
export function BulletList({ intro, items }: { intro?: string; items: string[] }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.bulletList}>
      {intro != null && <Text style={[styles.body, { color: colors.text }]}>{intro}</Text>}
      {items.map((item, i) => <BulletItem key={i}>{item}</BulletItem>)}
    </View>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────
// Carte : padding space/400, column, justify/align center, gap space/200.
// Surface standard de l'app (card + cardBorder + radius/300).

// Contexte partagé par les lignes d'une card : chaque ligne reporte la largeur
// naturelle de son titre, la card calcule la plus grande et la renvoie pour que
// tous les titres l'adoptent (les textes commencent ainsi au même endroit).
type CardRowCtx = {
  reportLabelWidth: (id: string, width: number) => void;
  maxLabelWidth?: number;
};
const CardRowContext = createContext<CardRowCtx | null>(null);

export function Card({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});

  const reportLabelWidth = useCallback((id: string, width: number) => {
    setLabelWidths((prev) => (prev[id] === width ? prev : { ...prev, [id]: width }));
  }, []);

  const maxLabelWidth = useMemo(() => {
    const widths = Object.values(labelWidths);
    return widths.length ? Math.max(...widths) : undefined;
  }, [labelWidths]);

  return (
    <CardRowContext.Provider value={{ reportLabelWidth, maxLabelWidth }}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {children}
      </View>
    </CardRowContext.Provider>
  );
}

// Titre dans une card : body-strong, text/default/secondary.
export function CardTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>{children}</Text>;
}

// Texte dans une card : body-base, text/default/default.
export function CardText({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return <Text style={[styles.cardText, { color: colors.text }]}>{children}</Text>;
}

// Ligne dans une card : row, align-items flex-end, gap 8, align-self stretch.
// Titre (body-strong, secondary) puis texte (body-base, default).
export function CardRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const ctx = useContext(CardRowContext);
  const id = useId();

  const onLabelLayout = useCallback(
    (e: LayoutChangeEvent) => ctx?.reportLabelWidth(id, Math.ceil(e.nativeEvent.layout.width)),
    [ctx, id],
  );

  return (
    <View style={styles.cardRow}>
      <Text
        style={[
          styles.cardRowLabel,
          { color: colors.textSecondary },
          ctx?.maxLabelWidth != null && { width: ctx.maxLabelWidth },
        ]}
        onLayout={onLabelLayout}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text style={[styles.cardRowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

// Carte de contact réutilisable (Société / Adresse / E-mail).
export function ContactCard() {
  return (
    <Card>
      <CardRow label="Société" value={COMPANY_NAME} />
      <CardRow label="Adresse" value={COMPANY_ADDRESS} />
      <CardRow label="E-mail" value={COMPANY_EMAIL} />
    </Card>
  );
}

// Encadré brand (conservé pour les pages légales pas encore migrées).
export function Highlight({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.highlight, { backgroundColor: colors.brand }]}>
      <Text style={[styles.highlightText, { color: colors.textBrandOnBrand }]}>{children}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (_colors: ThemeColors) => StyleSheet.create({
  section: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,            // space/300
    alignSelf: "stretch",
  },
  sectionTitle: {
    ...textStyles.bodyStrong,
  },
  body: {
    ...textStyles.bodyBase,
    lineHeight: 22,
    alignSelf: "stretch",
  },
  bulletList: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs2,
    alignSelf: "stretch",
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    alignSelf: "stretch",
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
  // ── Card
  card: {
    padding: spacing.lg,         // space/400
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: spacing.sm,             // space/200
    alignSelf: "stretch",
    borderRadius: radii.md,      // radius/300
  },
  cardTitle: {
    ...textStyles.bodyStrong,
    textAlign: "left",
    alignSelf: "stretch",
  },
  cardText: {
    ...textStyles.bodyBase,
    lineHeight: 22,
    textAlign: "left",
    alignSelf: "stretch",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,             // 8px
    alignSelf: "stretch",
  },
  cardRowLabel: {
    ...textStyles.bodyStrong,
    flexShrink: 0,
  },
  cardRowValue: {
    ...textStyles.bodyBase,
    flex: 1,
  },
  // ── Highlight (legacy)
  highlight: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  highlightText: {
    ...textStyles.bodyBase,
    lineHeight: 22,
  },
});
