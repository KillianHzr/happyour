import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, useColorScheme } from "react-native";
import { spacing, radii, stroke, textStyles, typography, type ThemeColors, type ThemeMode } from "../../lib/theme";
import { ForceThemeMode, useTheme, useThemedStyles } from "../../lib/theme-context";
import BottomSheet from "../BottomSheet";
import Icon from "../Icon";

const LIST_MAX_HEIGHT = 270;

type GroupInfo = { id: string; name: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  groups: GroupInfo[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onConfirm: () => void;
};

export default function GroupPickerSheet(props: Props) {
  // La capture force le mode dark, mais cette modal doit suivre la préférence
  // réelle de l'utilisateur. ForceThemeMode conserve `preference` du parent.
  const { preference } = useTheme();
  const systemScheme = useColorScheme();
  const userMode: ThemeMode =
    preference === "system"
      ? systemScheme === "light"
        ? "Light"
        : "Dark"
      : preference === "light"
      ? "Light"
      : "Dark";

  return (
    <ForceThemeMode mode={userMode}>
      <GroupPickerSheetInner {...props} />
    </ForceThemeMode>
  );
}

function GroupPickerSheetInner({ visible, onClose, groups, selectedIds, onToggle, onConfirm }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Scroll custom : géométrie pour la barre de droite
  const scrollY = useRef(new Animated.Value(0)).current;
  const [containerH, setContainerH] = useState(0);
  const [contentH, setContentH] = useState(0);

  useEffect(() => {
    if (visible) setSearch("");
  }, [visible]);

  // Barre de recherche affichée seulement au-delà de 5 groupes.
  const showSearch = groups.length > 5;

  const filtered = search.trim()
    ? groups.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()))
    : groups;

  const canScroll = contentH > containerH + 1 && containerH > 0;
  const thumbH = canScroll ? Math.max(24, (containerH * containerH) / contentH) : 0;
  const thumbTranslate = scrollY.interpolate({
    inputRange: [0, Math.max(1, contentH - containerH)],
    outputRange: [0, Math.max(0, containerH - thumbH)],
    extrapolate: "clamp",
  });

  const disabled = selectedIds.length === 0;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.content}>
        {/* Barre de recherche (style des inputs des paramètres) — seulement >5 groupes */}
        {showSearch && (
          <View style={[styles.input, { borderColor: focused ? colors.borderBrandSecondary : colors.cardBorder, backgroundColor: colors.bg }]}>
            <TextInput
              ref={inputRef}
              style={styles.inputText}
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="search"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
            <TouchableOpacity
              onPress={() => search.length > 0 && setSearch("")}
              disabled={search.length === 0}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name={search.length > 0 ? "x" : "search"} size={20} color={colors.iconNeutral} />
            </TouchableOpacity>
          </View>
        )}

        {/* Liste de groupes scrollable + scrollbar custom */}
        <View style={styles.listWrap} onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}>
          <Animated.ScrollView
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
            onContentSizeChange={(_w, h) => setContentH(h)}
            keyboardShouldPersistTaps="always"
          >
            <View style={styles.listGroupe}>
              {filtered.map((g) => {
                const checked = selectedIds.includes(g.id);
                return (
                  <TouchableOpacity key={g.id} style={styles.checkboxField} activeOpacity={0.8} onPress={() => onToggle(g.id)}>
                    <View style={styles.checkboxRow}>
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked && <Icon name="check" size={16} color={colors.icon} />}
                      </View>
                      <Text style={styles.groupName}>{g.name}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.ScrollView>

          {canScroll && (
            <Animated.View
              style={[styles.scrollbar, { height: thumbH, transform: [{ translateY: thumbTranslate }] }]}
              pointerEvents="none"
            />
          )}
        </View>

        {/* Bouton Partager (style du confirm "Se déconnecter") */}
        <TouchableOpacity
          style={[styles.shareBtn, disabled && styles.shareBtnDisabled]}
          onPress={onConfirm}
          disabled={disabled}
          activeOpacity={0.8}
        >
          <Text style={[styles.shareBtnText, disabled && styles.shareBtnTextDisabled]}>Partager</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    flexDirection: "column",
    gap: spacing.xxl,        // space/800 = 32
    paddingTop: spacing.xl3, // space/1200 = 48 (x = space/400 fourni par le BottomSheet)
    paddingBottom: spacing.lg, // 16
  },
  // ── Recherche (input paramètres) ──
  input: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignSelf: "stretch",
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  inputText: {
    flex: 1,
    fontFamily: textStyles.bodyBase.fontFamily,
    fontSize: typography.size.md,
    includeFontPadding: false,
    padding: 0,
    color: colors.text,
  },
  // ── Liste ──
  listWrap: {
    maxHeight: LIST_MAX_HEIGHT,
    alignSelf: "stretch",
  },
  listGroupe: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.lg, // space/400
    alignSelf: "stretch",
  },
  checkboxField: {
    flexDirection: "column",
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md, // space/300
    minWidth: 120,
  },
  checkbox: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.xs, // radius/100
    borderWidth: stroke.sm, // stroke/025
    borderColor: colors.borderBrandTertiary,
    backgroundColor: colors.brandTertiary,
  },
  checkboxChecked: {
    backgroundColor: colors.brand,        // background/brand/default
    borderColor: colors.iconBrandTertiary, // icon/brand/tertiary
  },
  groupName: {
    ...textStyles.heading,
    color: colors.text,
  },
  scrollbar: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 4,
    borderRadius: radii.full,
    backgroundColor: colors.accentMuted, // background/default/tertiary
  },
  // ── Bouton Partager ──
  shareBtn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.brand,
    justifyContent: "center",
    alignItems: "center",
  },
  shareBtnDisabled: {
    backgroundColor: colors.bgDisabled,
  },
  shareBtnText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
    color: colors.textBrandOnBrand,
  },
  shareBtnTextDisabled: {
    color: colors.textOnDisabled,
  },
});
