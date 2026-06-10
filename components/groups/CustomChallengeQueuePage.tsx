import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ScrollView, TextInput, ActivityIndicator, Alert,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { radii, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import {
  fetchMyCustomChallengeQueue, fetchGroupQueuePending,
  updateCustomChallenge, deleteCustomChallenge,
  type CustomChallengeQueueItem, type ChallengeCapture,
} from "../../lib/challenges";

type MemberInfo = { user_id: string; username: string; avatar_url?: string | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  currentUserId: string;
  members: MemberInfo[];
};

const CAPTURE_OPTIONS: { type: ChallengeCapture; label: string; icon: string }[] = [
  { type: "PHOTO", label: "Photo", icon: "📷" },
  { type: "VIDEO", label: "Vidéo", icon: "🎥" },
  { type: "AUDIO", label: "Audio", icon: "🎙" },
  { type: "DESSIN", label: "Dessin", icon: "✏️" },
  { type: "TEXTE", label: "Texte", icon: "📝" },
];

export default function CustomChallengeQueuePage({
  visible, onClose, groupId, currentUserId, members,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [items, setItems] = useState<CustomChallengeQueueItem[]>([]);
  const [groupQueue, setGroupQueue] = useState<{ id: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTargetUserId, setEditTargetUserId] = useState<string | null>(null);
  const [editTheme, setEditTheme] = useState("");
  const [editCaptureType, setEditCaptureType] = useState<ChallengeCapture | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!groupId || !currentUserId) return;
    setLoading(true);
    try {
      const [mine, groupPending] = await Promise.all([
        fetchMyCustomChallengeQueue(groupId, currentUserId),
        fetchGroupQueuePending(groupId),
      ]);
      setItems(mine);
      setGroupQueue(groupPending);
    } catch (e) {
      console.error("[QueuePage] load error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) load();
    else {
      setItems([]);
      setGroupQueue([]);
      setEditingId(null);
    }
  }, [visible, groupId, currentUserId]);

  const getPosition = (item: CustomChallengeQueueItem): number => {
    const idx = groupQueue.findIndex((q) => q.id === item.id);
    return idx >= 0 ? idx + 1 : 0;
  };

  const startEdit = (item: CustomChallengeQueueItem) => {
    setEditingId(item.id);
    setEditTargetUserId(item.target_user_id);
    setEditTheme(item.custom_theme ?? "");
    setEditCaptureType(item.capture_type ?? null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTargetUserId(null);
    setEditTheme("");
    setEditCaptureType(null);
  };

  const saveEdit = async (item: CustomChallengeQueueItem) => {
    setSaving(true);
    try {
      await updateCustomChallenge(item.id, {
        targetUserId: editTargetUserId,
        customTheme: editTheme.trim() || null,
        captureType: editCaptureType,
      });
      cancelEdit();
      await load();
    } catch (e) {
      console.error("[QueuePage] saveEdit error:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: CustomChallengeQueueItem) => {
    Alert.alert(
      "Supprimer le défi custom ?",
      "Cette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCustomChallenge(item.id);
              await load();
            } catch (e) {
              console.error("[QueuePage] delete error:", e);
            }
          },
        },
      ]
    );
  };

  const activeItems = items.filter((i) => i.status === "active");
  const pendingItems = items.filter((i) => i.status === "pending");

  const otherMembers = members.filter((m) => m.user_id !== currentUserId);

  const labelForItem = (item: CustomChallengeQueueItem): string => {
    const parts: string[] = [];
    if (item.target_user_id) {
      const m = members.find((x) => x.user_id === item.target_user_id);
      parts.push(`Cible: ${m?.username ?? "?"}`);
    }
    if (item.custom_theme) parts.push(`Thème: ${item.custom_theme}`);
    if (item.capture_type) parts.push(item.capture_type);
    return parts.join(" · ") || "Défi custom";
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={s.backBtn} onPress={onClose}>
            <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <Path d="M18 6L6 18M6 6l12 12" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
          <Text style={s.title}>Ma file de défis</Text>
        </View>

        {loading ? (
          <View style={s.loaderWrap}>
            <ActivityIndicator color={colors.textSecondary} size="large" />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {activeItems.length === 0 && pendingItems.length === 0 && (
              <View style={s.emptyWrap}>
                <Text style={s.emptyEmoji}>🎯</Text>
                <Text style={s.emptyTitle}>Aucun défi en attente</Text>
                <Text style={s.emptyHint}>Utilise le bouton "Créer défi custom" pour en ajouter un.</Text>
              </View>
            )}

            {/* Active items */}
            {activeItems.length > 0 && (
              <>
                <Text style={s.sectionLabel}>EN COURS</Text>
                {activeItems.map((item) => (
                  <View key={item.id} style={s.activeCard}>
                    <View style={s.activeBadge}>
                      <Text style={s.activeBadgeText}>⚡ En cours</Text>
                    </View>
                    <Text style={s.itemLabel}>{labelForItem(item)}</Text>
                    <Text style={s.itemHint}>Ce défi est en cours de traitement — il ne peut pas être modifié.</Text>
                  </View>
                ))}
              </>
            )}

            {/* Pending items */}
            {pendingItems.length > 0 && (
              <>
                <Text style={[s.sectionLabel, activeItems.length > 0 && { marginTop: 20 }]}>EN ATTENTE</Text>
                {pendingItems.map((item, idx) => {
                  const position = getPosition(item);
                  const isEditing = editingId === item.id;

                  return (
                    <View key={item.id} style={s.pendingCard}>
                      <View style={s.pendingTop}>
                        <View style={s.positionPill}>
                          <Text style={s.positionPillText}>
                            {position === 1 ? "Prochain défi" : `Dans ${position} défis`}
                          </Text>
                        </View>
                        {!isEditing && (
                          <View style={s.pendingActions}>
                            <TouchableOpacity style={s.editBtn} onPress={() => startEdit(item)}>
                              <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.secondary} strokeWidth="2" strokeLinecap="round">
                                <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z" />
                              </Svg>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(item)}>
                              <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" strokeWidth="2" strokeLinecap="round">
                                <Path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                              </Svg>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>

                      {isEditing ? (
                        <View style={s.editForm}>
                          {/* Target edit */}
                          {item.target_user_id !== null && (
                            <>
                              <Text style={s.editLabel}>Cible</Text>
                              <View style={s.editMemberList}>
                                {otherMembers.map((m) => (
                                  <TouchableOpacity
                                    key={m.user_id}
                                    style={[s.editMemberRow, editTargetUserId === m.user_id && s.editMemberRowActive]}
                                    onPress={() => setEditTargetUserId(m.user_id)}
                                  >
                                    {m.avatar_url ? (
                                      <Image source={{ uri: m.avatar_url }} style={s.editAvatar} contentFit="cover" />
                                    ) : (
                                      <View style={[s.editAvatar, s.avatarFallback]}>
                                        <Text style={s.avatarLetter}>{m.username[0]?.toUpperCase()}</Text>
                                      </View>
                                    )}
                                    <Text style={[s.editMemberName, editTargetUserId === m.user_id && { color: colors.text }]}>
                                      {m.username}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </>
                          )}
                          {/* Theme edit */}
                          {item.custom_theme !== null && (
                            <>
                              <Text style={s.editLabel}>Thème</Text>
                              <TextInput
                                style={s.editInput}
                                value={editTheme}
                                onChangeText={setEditTheme}
                                placeholder="Thème..."
                                placeholderTextColor={colors.textTertiary}
                                maxLength={60}
                                returnKeyType="done"
                              />
                            </>
                          )}
                          {/* Capture type edit */}
                          {item.capture_type !== null && (
                            <>
                              <Text style={s.editLabel}>Type de capture</Text>
                              <View style={s.editCaptureRow}>
                                {CAPTURE_OPTIONS.map(({ type, label, icon }) => (
                                  <TouchableOpacity
                                    key={type}
                                    style={[s.editCapturePill, editCaptureType === type && s.editCapturePillActive]}
                                    onPress={() => setEditCaptureType(type)}
                                  >
                                    <Text style={s.editCaptureIcon}>{icon}</Text>
                                    <Text style={[s.editCaptureLabel, editCaptureType === type && { color: colors.text }]}>{label}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </>
                          )}
                          <View style={s.editBtns}>
                            <TouchableOpacity style={s.cancelEditBtn} onPress={cancelEdit}>
                              <Text style={s.cancelEditText}>Annuler</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.saveEditBtn, saving && { opacity: 0.5 }]}
                              onPress={() => saveEdit(item)}
                              disabled={saving}
                            >
                              {saving ? (
                                <ActivityIndicator color={colors.bg} size="small" />
                              ) : (
                                <Text style={s.saveEditText}>Enregistrer</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <Text style={s.itemLabel}>{labelForItem(item)}</Text>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: colors.text,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xl,
  },
  loaderWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 10,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 10,
  },
  emptyEmoji: { fontSize: typography.size.subtitle },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.family.bold,
    fontSize: typography.size.lg,
  },
  emptyHint: {
    color: colors.textTertiary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  sectionLabel: {
    color: colors.textTertiary,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xs,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  activeCard: {
    backgroundColor: "rgba(255,200,0,0.07)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255,200,0,0.25)",
    padding: 16,
    gap: 8,
  },
  activeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,200,0,0.18)",
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeBadgeText: {
    color: "#FFD700",
    fontFamily: typography.family.bold,
    fontSize: typography.size.xs,
  },
  itemLabel: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    lineHeight: 20,
  },
  itemHint: {
    color: colors.textTertiary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
  },
  pendingCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    gap: 8,
  },
  pendingTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  positionPill: {
    backgroundColor: colors.accentMuted,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  positionPillText: {
    color: colors.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  pendingActions: {
    flexDirection: "row",
    gap: 8,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.lg,
    backgroundColor: "rgba(255,59,48,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  editForm: {
    gap: 10,
    marginTop: 4,
  },
  editLabel: {
    color: colors.textTertiary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  editMemberList: {
    gap: 6,
  },
  editMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  editMemberRowActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.borderSecondary,
  },
  editAvatar: {
    width: 28,
    height: 28,
    borderRadius: radii.md,
  },
  avatarFallback: {
    backgroundColor: colors.accentMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    color: colors.text,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xs,
  },
  editMemberName: {
    flex: 1,
    color: colors.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  editInput: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  editCaptureRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  editCapturePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  editCapturePillActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.borderSecondary,
  },
  editCaptureIcon: { fontSize: typography.size.sm },
  editCaptureLabel: {
    color: colors.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  editBtns: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  cancelEditBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    alignItems: "center",
  },
  cancelEditText: {
    color: colors.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  saveEditBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  saveEditText: {
    color: colors.bg,
    fontFamily: typography.family.bold,
    fontSize: typography.size.sm,
  },
});
