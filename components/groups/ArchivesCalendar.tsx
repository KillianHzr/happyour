import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { spacing, radii, stroke, textStyles, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import Icon from "../Icon";

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const WEEKDAYS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

const atMidnight = (y: number, m: number, d: number) => new Date(y, m, d, 0, 0, 0, 0);
const cmp = (a: Date, b: Date) => a.getTime() - b.getTime();

type Props = {
  /** Borne minimale : premier reveal du groupe (rien de plus ancien). */
  minDate: Date;
  /** Borne maximale (aujourd'hui). */
  maxDate: Date;
  selStart: Date | null;
  selEnd: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
};

export default function ArchivesCalendar({ minDate, maxDate, selStart, selEnd, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // Jour actuel de l'utilisateur (minuit local).
  const today = useMemo(() => {
    const n = new Date();
    return atMidnight(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  const init = selStart ?? maxDate;
  const [viewYear, setViewYear] = useState(init.getFullYear());
  const [viewMonth, setViewMonth] = useState(init.getMonth());
  const [openSelect, setOpenSelect] = useState<null | "month" | "year">(null);

  const minY = minDate.getFullYear();
  const maxY = maxDate.getFullYear();
  const years = useMemo(() => {
    const a: number[] = [];
    for (let y = maxY; y >= minY; y--) a.push(y);
    return a;
  }, [minY, maxY]);

  // Bornes de mois pour l'année affichée
  const monthMin = viewYear === minY ? minDate.getMonth() : 0;
  const monthMax = viewYear === maxY ? maxDate.getMonth() : 11;

  const canPrev = viewYear > minY || (viewYear === minY && viewMonth > minDate.getMonth());
  const canNext = viewYear < maxY || (viewYear === maxY && viewMonth < maxDate.getMonth());

  const goPrev = () => {
    if (!canPrev) return;
    let m = viewMonth - 1, y = viewYear;
    if (m < 0) { m = 11; y--; }
    setViewMonth(m); setViewYear(y); setOpenSelect(null);
  };
  const goNext = () => {
    if (!canNext) return;
    let m = viewMonth + 1, y = viewYear;
    if (m > 11) { m = 0; y++; }
    setViewMonth(m); setViewYear(y); setOpenSelect(null);
  };

  const selectMonth = (m: number) => { setViewMonth(m); setOpenSelect(null); };
  const selectYear = (y: number) => {
    const mn = y === minY ? minDate.getMonth() : 0;
    const mx = y === maxY ? maxDate.getMonth() : 11;
    let m = viewMonth;
    if (m < mn) m = mn;
    if (m > mx) m = mx;
    setViewYear(y); setViewMonth(m); setOpenSelect(null);
  };

  // ── Grille du mois (lundi → dimanche) ──
  const weeks = useMemo(() => {
    const firstOffset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewYear, viewMonth]);

  const handleDay = (d: number) => {
    const date = atMidnight(viewYear, viewMonth, d);
    if (cmp(date, minDate) < 0 || cmp(date, maxDate) > 0) return;
    if (!selStart || selEnd) {
      onChange(date, null);
    } else if (cmp(date, selStart) >= 0) {
      onChange(selStart, date);
    } else {
      onChange(date, null);
    }
  };

  const dayState = (d: number): "start" | "end" | "between" | "single" | "none" => {
    const t = atMidnight(viewYear, viewMonth, d).getTime();
    const s = selStart?.getTime();
    const e = selEnd?.getTime();
    if (s != null && e != null) {
      if (t === s) return "start";
      if (t === e) return "end";
      if (t > s && t < e) return "between";
    } else if (s != null && t === s) {
      return "single";
    }
    return "none";
  };

  return (
    <View style={styles.popover}>
      {/* ── cal-head ── */}
      <View style={styles.calHead}>
        <TouchableOpacity style={styles.navBtn} onPress={goPrev} disabled={!canPrev} activeOpacity={0.7}>
          <Icon name="chevron-left" size={20} color={canPrev ? colors.icon : colors.iconDisabled} />
        </TouchableOpacity>

        <View style={styles.calSelect}>
          <TouchableOpacity style={styles.selectBox} onPress={() => setOpenSelect((s) => (s === "month" ? null : "month"))} activeOpacity={0.7}>
            <Text style={styles.selectText} numberOfLines={1}>{MONTHS[viewMonth]}</Text>
            <View style={{ transform: [{ rotate: "90deg" }] }}>
              <Icon name="chevron-right" size={16} color={colors.icon} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectBox} onPress={() => setOpenSelect((s) => (s === "year" ? null : "year"))} activeOpacity={0.7}>
            <Text style={styles.selectText} numberOfLines={1}>{viewYear}</Text>
            <View style={{ transform: [{ rotate: "90deg" }] }}>
              <Icon name="chevron-right" size={16} color={colors.icon} />
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.navBtn} onPress={goNext} disabled={!canNext} activeOpacity={0.7}>
          <Icon name="chevron-right" size={20} color={canNext ? colors.icon : colors.iconDisabled} />
        </TouchableOpacity>
      </View>

      {/* ── Dropdown mois/année OU cal-table ── */}
      {openSelect ? (
        <ScrollView style={styles.dropdown} contentContainerStyle={styles.dropdownContent} showsVerticalScrollIndicator={false}>
          {openSelect === "month"
            ? MONTHS.map((name, idx) => {
                const disabled = idx < monthMin || idx > monthMax;
                const selected = idx === viewMonth;
                return (
                  <TouchableOpacity key={name} style={[styles.option, selected && styles.optionSelected]} disabled={disabled} onPress={() => selectMonth(idx)} activeOpacity={0.7}>
                    <Text style={[styles.optionText, selected && { color: colors.brandText }, disabled && { color: colors.textTertiary }]}>{name}</Text>
                  </TouchableOpacity>
                );
              })
            : years.map((y) => {
                const selected = y === viewYear;
                return (
                  <TouchableOpacity key={y} style={[styles.option, selected && styles.optionSelected]} onPress={() => selectYear(y)} activeOpacity={0.7}>
                    <Text style={[styles.optionText, selected && { color: colors.brandText }]}>{y}</Text>
                  </TouchableOpacity>
                );
              })}
        </ScrollView>
      ) : (
        <View style={styles.calTable}>
          {/* En-tête des jours */}
          <View style={[styles.weekRow, styles.headerRow]}>
            {WEEKDAYS.map((w) => (
              <View key={w} style={styles.headerCell}>
                <Text style={styles.headerText}>{w}</Text>
              </View>
            ))}
          </View>
          {/* Jours */}
          {weeks.map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((d, di) => {
                if (d === null) return <View key={di} style={styles.cell} />;
                const date = atMidnight(viewYear, viewMonth, d);
                const disabled = cmp(date, minDate) < 0 || cmp(date, maxDate) > 0;
                const st = dayState(d);
                // Jour actuel : style spécial, sauf s'il fait partie de la sélection.
                const showToday = st === "none" && date.getTime() === today.getTime();
                const bg =
                  st === "between" ? { backgroundColor: colors.card } :
                  (st === "start" || st === "end" || st === "single") ? { backgroundColor: colors.brand } :
                  null;
                const radius =
                  st === "start" ? { borderTopLeftRadius: radii.sm, borderBottomLeftRadius: radii.sm } :
                  st === "end" ? { borderTopRightRadius: radii.sm, borderBottomRightRadius: radii.sm } :
                  st === "single" ? { borderRadius: radii.sm } :
                  showToday ? { borderRadius: radii.sm, borderWidth: stroke.sm, borderColor: colors.borderBrandTertiary } :
                  null;
                const textColor =
                  st === "between" ? colors.brandText :
                  (st === "start" || st === "end" || st === "single") ? colors.textBrandOnBrand :
                  showToday ? colors.brand :
                  disabled ? colors.textTertiary : colors.text;
                return (
                  <TouchableOpacity
                    key={di}
                    style={[styles.cell, bg, radius]}
                    disabled={disabled}
                    activeOpacity={0.7}
                    onPress={() => handleDay(d)}
                  >
                    <Text style={[styles.cellText, { color: textColor }]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      )}

      {/* ── Bouton annuler (si sélection) ── */}
      {!openSelect && selStart && (
        <TouchableOpacity style={styles.cancelBtn} onPress={() => onChange(null, null)} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Annuler</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  popover: {
    padding: spacing.lg,                 // space/400
    flexDirection: "column",
    alignItems: "center",
    gap: spacing.lg,
    borderRadius: radii.lg,              // radius/400
    borderWidth: stroke.sm,              // stroke/025
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg,
  },

  // ── cal-head ──
  calHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,                     // space/400
    alignSelf: "stretch",
  },
  navBtn: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.sm,              // radius/200
  },
  calSelect: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,                     // space/200
  },
  selectBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xs2,                // space/150
    borderRadius: radii.sm,
    borderWidth: stroke.sm,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bg,
  },
  selectText: {
    flex: 1,
    ...textStyles.singleLineBodyBase,
    color: colors.text,
  },

  // ── dropdown mois/année ──
  dropdown: {
    alignSelf: "stretch",
    maxHeight: 232,
  },
  dropdownContent: {
    flexDirection: "column",
    gap: spacing.xxs,
  },
  option: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
  },
  optionSelected: {
    backgroundColor: colors.card,
  },
  optionText: {
    ...textStyles.singleLineBodyBase,
    color: colors.text,
  },

  // ── cal-table ──
  calTable: {
    flexDirection: "column",
    alignSelf: "stretch",
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
  },
  headerRow: {
    marginBottom: spacing.sm,            // séparation en-tête / grille
  },
  headerCell: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerText: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
  },
  cell: {
    flex: 1,
    height: 40,
    justifyContent: "center",           // chiffre centré verticalement dans la cellule
    alignItems: "center",
  },
  cellText: {
    ...textStyles.bodyBase,
    color: colors.text,
  },

  // ── annuler (comme la modal de renommage) ──
  cancelBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
    color: colors.textNeutral,
  },
});
