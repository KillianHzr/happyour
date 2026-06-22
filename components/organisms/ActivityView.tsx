import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { StatusBar } from "expo-status-bar";

import { SvgCutout } from "../atoms/SvgCutout";
import { radii, spacing, typography, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

// Forme d'une entrée du feed d'activité (réaction / commentaire / mention).
export interface ActivityItem {
  id: string;
  username: string;
  avatarUrl: string | null;
  photoUrl: string;
  photoId: string;
  created_at: string;
  context: string;
}

// Temps relatif compact ("3min", "2h", "4j") affiché à côté du nom.
export function formatRelativeTime(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60000) return "1m";
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}j`;
}

// Découpage du feed d'activité en sections temporelles. Les labels signifient « il y a
// PLUS de X » : chaque activité va dans la dernière tranche dont elle dépasse la borne
// min. Tout ce qui est plus récent que la 1re borne (< 6h) reste en haut sans label.
// La liste est déjà triée desc (plus récent en premier), donc les sections sortent du
// plus récent au plus ancien. Seules les sections non vides sont renvoyées.
const ACTIVITY_TIME_SECTIONS: Array<{ label: string | null; minHours: number }> = [
  { label: null, minHours: 0 },          // récent (< 6h) — aucun label
  { label: "Il y a 6h", minHours: 6 },
  { label: "Il y a 12h", minHours: 12 },
];

function groupActivitiesByAge<T extends { created_at: string }>(list: T[]) {
  const now = Date.now();
  const sections = ACTIVITY_TIME_SECTIONS.map((s) => ({ label: s.label, items: [] as T[] }));
  for (const item of list) {
    const ageHours = (now - new Date(item.created_at).getTime()) / 3600000;
    let idx = 0;
    for (let i = 0; i < ACTIVITY_TIME_SECTIONS.length; i++) {
      if (ageHours >= ACTIVITY_TIME_SECTIONS[i].minHours) idx = i;
    }
    sections[idx].items.push(item);
  }
  return sections.filter((s) => s.items.length > 0);
}

interface ActivityViewProps {
  onClose: () => void;
  activitiesList: ActivityItem[];
  handleActivityClick: (item: ActivityItem) => void;
}

export function ActivityView({
  onClose,
  activitiesList,
  handleActivityClick,
}: ActivityViewProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.notifContainer}>
      <StatusBar style="light" />
      {/* Header */}
      <View style={[styles.notifHeader, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.notifBackButton} onPress={onClose} activeOpacity={0.7}>
          <Svg width="7" height="12" viewBox="0 0 7 12" fill="none">
            <Path
              d="M5.29289 0.292893C5.68342 -0.0976311 6.31643 -0.0976311 6.70696 0.292893C7.09748 0.683417 7.09748 1.31643 6.70696 1.70696L2.41399 5.99992L6.70696 10.2929C7.09748 10.6834 7.09748 11.3164 6.70696 11.707C6.31643 12.0975 5.68342 12.0975 5.29289 11.707L0.292893 6.70696C-0.0976311 6.31643 -0.0976311 5.68342 0.292893 5.29289L5.29289 0.292893Z"
              fill={colors.textNeutral}
            />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.notifTitle}>Activités</Text>
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={activitiesList.length > 0 ? styles.notifListContent : styles.notifContent} showsVerticalScrollIndicator={false}>
        {activitiesList.length > 0 ? (
          <View style={styles.activitySections}>
            {groupActivitiesByAge(activitiesList).map((section) => (
              <View key={section.label ?? "recent"} style={styles.activitySection}>
                {section.label ? <Text style={styles.activitySectionTitle}>{section.label}</Text> : null}
                <View style={styles.activitiesList}>
                  {section.items.map((item) => (
                    <TouchableOpacity key={item.id} style={styles.activityItem} onPress={() => handleActivityClick(item)} activeOpacity={0.7}>
                      {/* Profile pic (rounded square of 48px and radius/300) */}
                      <View style={styles.activityAvatarWrap}>
                        {item.avatarUrl ? (
                          <Image source={{ uri: item.avatarUrl }} style={styles.activityAvatar} />
                        ) : (
                          <Text style={styles.activityAvatarFallbackText}>
                            {item.username[0]?.toUpperCase() ?? "?"}
                          </Text>
                        )}
                      </View>

                      {/* Details */}
                      <View style={styles.activityDetails}>
                        <View style={styles.activityMetaRow}>
                          <Text style={styles.activityUsername} numberOfLines={1}>{item.username}</Text>
                          <Text style={styles.activityTimeDot}>•</Text>
                          <Text style={styles.activityTime}>{formatRelativeTime(item.created_at)}</Text>
                        </View>
                        <Text style={styles.activityContext}>{item.context}</Text>
                      </View>

                      {/* Photo Cutout on the right */}
                      {item.photoUrl ? (
                        <View style={styles.activityCutoutWrap}>
                          <SvgCutout uri={item.photoUrl} size={56} />
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.notifEmptyState}>
            <Text style={styles.notifEmptyTitle}>Aucune activité</Text>
            <Text style={styles.notifEmptySub}>Tu seras notifié dès qu’un de tes proches réagit à tes moments.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export default ActivityView;

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // Notifications View
  notifContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  notifHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: spacing.sm, // gap-200 (8px)
  },
  notifBackButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md, // radius/300 (12px)
    justifyContent: "center",
    alignItems: "center",
  },
  notifTitle: {
    ...textStyles.subtitleStrong,
    color: colors.textNeutral,
  },
  notifContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  notifListContent: {
    flexGrow: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  activitySections: {
    flexDirection: "column",
    gap: 40, // gap entre les grandes sections temporelles
    width: "100%",
  },
  activitySection: {
    flexDirection: "column",
    gap: spacing.lg, // space/400 (16px) — même gap que les commentaires (titre ↔ liste)
    width: "100%",
  },
  activitySectionTitle: {
    ...textStyles.bodyStrong,
    color: colors.textNeutral,
    textAlign: "left",
  },
  activitiesList: {
    flexDirection: "column",
    gap: spacing.lg, // space/400 (16px)
    width: "100%",
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  activityAvatarWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.md, // radius/300 (12px)
    backgroundColor: colors.accentMuted,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  activityAvatar: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
  },
  activityAvatarFallbackText: {
    color: colors.textNeutral,
    fontFamily: typography.family.bold,
    fontSize: 18,
  },
  activityDetails: {
    flex: 1,
    flexDirection: "column",
    marginLeft: spacing.md, // size-space-300 (12px)
  },
  activityMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  activityUsername: {
    ...textStyles.bodySmallStrong,
    color: colors.textNeutral,
    maxWidth: "70%",
  },
  activityTimeDot: {
    marginHorizontal: 6,
    color: colors.textNeutralTertiary,
    fontSize: 10,
  },
  activityTime: {
    ...textStyles.bodySmall,
    color: colors.textNeutralTertiary,
  },
  activityContext: {
    ...textStyles.bodyBase,
    color: colors.textNeutral,
  },
  activityCutoutWrap: {
    marginLeft: spacing.xl, // space-600 (24px)
  },
  notifEmptyState: {
    width: "100%",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 31,
  },
  notifEmptyTitle: {
    ...textStyles.subheading,
    color: colors.textNeutralTertiary,
    textAlign: "center",
  },
  notifEmptySub: {
    ...textStyles.bodyBase,
    color: colors.textNeutralTertiary,
    textAlign: "center",
  },
});
