import { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Keyboard, Platform, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, radii, textStyles, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import BottomSheet from "../BottomSheet";
import Icon from "../Icon";

type GroupInfo = { id: string; name: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  groups: GroupInfo[];
  onSelectGroup: (id: string) => void;
};

// Hauteur de la zone "handle" du BottomSheet (paddingTop 14 + handle 4 + paddingBottom 10).
const HANDLE_H = 28;

export default function GroupSearchSheet({ visible, onClose, groups, onSelectGroup }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const [searchBarH, setSearchBarH] = useState(52);
  const [kbHeight, setKbHeight] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    setSearch("");
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const s = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const h = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { s.remove(); h.remove(); };
  }, []);

  const query = search.trim().toLowerCase();
  const filtered = query ? groups.filter((g) => g.name.toLowerCase().includes(query)) : [];

  const handleSelect = (id: string) => {
    Keyboard.dismiss();
    onSelectGroup(id);
  };

  // La modal ne doit jamais dépasser le haut de l'écran : on plafonne la liste à l'espace
  // disponible au-dessus de la barre de recherche (en tenant compte du clavier). Au-delà,
  // la ScrollView devient scrollable ; en dessous elle se dimensionne au contenu.
  const scrollMaxHeight = Math.max(
    100,
    windowHeight - insets.top - HANDLE_H - spacing.lg - spacing.xl2 - searchBarH - (insets.bottom + 16) - kbHeight - 8
  );

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.content}>
        {filtered.length > 0 && (
          <ScrollView
            style={{ maxHeight: scrollMaxHeight }}
            contentContainerStyle={styles.groupsContainer}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            {filtered.map((g) => (
              <TouchableOpacity key={g.id} style={styles.groupBtn} activeOpacity={0.85} onPress={() => handleSelect(g.id)}>
                <Text style={styles.groupBtnText}>{g.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View
          onLayout={(e) => setSearchBarH(e.nativeEvent.layout.height)}
          style={[styles.input, { borderColor: focused ? colors.borderBrandSecondary : colors.cardBorder, backgroundColor: colors.bg }]}
        >
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
      </View>
    </BottomSheet>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    flexDirection: "column",
    gap: spacing.xl2,          // space/1000 — sépare la liste de la barre de recherche
    paddingTop: spacing.lg,
  },
  // Élément contenant les groupes.
  groupsContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.sm,           // space/200
    alignSelf: "stretch",
  },
  // Bouton groupe.
  groupBtn: {
    backgroundColor: colors.bgNeutralTertiary, // background/neutral/tertiary
    borderRadius: radii.lg,                     // radius/400
    paddingVertical: spacing.lg,                // space/400
    paddingHorizontal: spacing.xl,              // space/600
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,                            // space/200
    alignSelf: "stretch",
  },
  groupBtnText: {
    ...textStyles.singleLineSubheadingStrong,
    color: colors.textNeutral,                  // text/neutral/default
    lineHeight: undefined,
    textAlign: "center",
  },
  // Barre de recherche — identique à celle du GroupPickerSheet (modal d'envoi).
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
});
