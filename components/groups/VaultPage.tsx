import { useRef, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import Svg, { Path } from "react-native-svg";
import { scheduleImmediateLocalNotification } from "../../lib/notifications";
import { type PhotoEntry } from "../PhotoFeed";
import BottomSheet from "../BottomSheet";

type GroupInfo = { id: string; name: string; invite_code: string };
type MemberInfo = { user_id: string; username: string; avatar_url?: string | null; role?: string };

type Props = {
  allGroups: GroupInfo[];
  activeGroupId: string;
  onSwitchGroup: (id: string) => void;
  onAddGroup: () => void;
  groupName: string;
  inviteCode: string;
  isAdmin: boolean;
  currentUserId?: string;
  members: MemberInfo[];
  photoCount: number;
  photos: PhotoEntry[];
  revealDate: Date;
  unlocked: boolean;
  onOpenReveal: () => void;
  onOpenSettings: () => void;
  onLeaveGroup: () => void;
  onRemoveMember?: (userId: string) => Promise<void>;
  groupId: string;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  onSimulateReveal?: () => void;
  onDebugNotifReveal?: () => void;
  onDebugNotifPhoto?: () => void;
  onDebugNotifInvite?: () => void;
};

function getStrokeWidth(count: number): number {
  if (count === 0) return 0;
  if (count < 5) return 1;
  if (count < 10) return 2;
  if (count < 15) return 3;
  if (count < 20) return 5;
  if (count < 30) return 7;
  if (count < 40) return 9;
  if (count < 50) return 11;
  const steps = Math.floor((Math.min(count, 100) - 50) / 20);
  return 13 + steps * 2;
}

function useCountdown(targetDate: Date) {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    const tick = () => {
      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("00:00:00"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const dStr = d > 0 ? `${d}j ` : "";
      setTimeLeft(`${dStr}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);
  return timeLeft;
}

const APP_LINK = "app-gobelins-m2.expo.dev";

const GearIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const CrownIcon = () => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M2 19l2-9 4.5 4L12 5l3.5 9L20 10l2 9H2z" stroke="#FFD700" fill="#FFD700" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
  </Svg>
);

export default function VaultPage({
  allGroups, activeGroupId, onSwitchGroup, onAddGroup,
  groupName, inviteCode, isAdmin, currentUserId, members, photoCount, photos, revealDate,
  unlocked, onOpenReveal, onOpenSettings, onLeaveGroup, onRemoveMember,
  groupId, onRefresh, refreshing, onSimulateReveal, onDebugNotifReveal, onDebugNotifPhoto, onDebugNotifInvite,
}: Props) {
  const insets = useSafeAreaInsets();
  const timeLeft = useCountdown(revealDate);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<MemberInfo | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const prevActiveId = useRef(activeGroupId);

  useEffect(() => {
    if (prevActiveId.current !== activeGroupId) {
      prevActiveId.current = activeGroupId;
      fadeAnim.setValue(0);
      slideAnim.setValue(14);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1, duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 160,
          friction: 22,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [activeGroupId]);

  const sortedMembers = useMemo(() => {
    const lastPostTime: Record<string, number> = {};
    for (const p of photos) {
      const t = new Date(p.created_at).getTime();
      if (!lastPostTime[p.user_id] || t > lastPostTime[p.user_id]) {
        lastPostTime[p.user_id] = t;
      }
    }
    return [...members].sort((a, b) => (lastPostTime[b.user_id] ?? 0) - (lastPostTime[a.user_id] ?? 0));
  }, [members, photos]);

  const crownUserId =
    sortedMembers.length > 0 && photos.some((p) => p.user_id === sortedMembers[0].user_id)
      ? sortedMembers[0].user_id
      : null;

  const displayedMembers = sortedMembers.length > 5 ? sortedMembers.slice(0, 4) : sortedMembers.slice(0, 5);
  const hasMoreMembers = sortedMembers.length > 5;

  const strokeWidth = getStrokeWidth(photoCount);
  const remaining = 3 - allGroups.length;

  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(inviteCode || "");
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(APP_LINK);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleAvatarPress = (m: MemberInfo) => {
    if (!isAdmin || m.user_id === currentUserId || !onRemoveMember) return;
    setMemberToRemove(m);
  };

  const handleConfirmRemove = async () => {
    if (!memberToRemove || !onRemoveMember) return;
    setRemoving(true);
    try {
      await onRemoveMember(memberToRemove.user_id);
      setShowRemoveConfirm(false);
      setMemberToRemove(null);
    } finally {
      setRemoving(false);
    }
  };

  const handleCancelRemove = () => {
    setShowRemoveConfirm(false);
    setMemberToRemove(null);
  };

  const renderAvatar = (m: MemberInfo, hasCrown: boolean, size = 48) => {
    const tappable = isAdmin && m.user_id !== currentUserId && !!onRemoveMember;
    return (
    <TouchableOpacity
      activeOpacity={tappable ? 0.7 : 1}
      onPress={() => handleAvatarPress(m)}
      style={{ alignItems: "center", gap: 4, maxWidth: size + 12 }}
    >
      <View style={{ position: "relative" }}>
        <View style={[styles.avatarWrap, { width: size, height: size, borderRadius: size / 2 }, m.role === "admin" && styles.avatarAdmin]}>
          {m.avatar_url
            ? <Image source={{ uri: m.avatar_url }} style={{ width: "100%", height: "100%", borderRadius: size / 2 }} />
            : <Text style={{ color: "#FFF", fontFamily: "Inter_700Bold", fontSize: size * 0.38 }}>{m.username[0]?.toUpperCase()}</Text>}
        </View>
        {hasCrown && (
          <View style={styles.crownWrap}>
            <CrownIcon />
          </View>
        )}
      </View>
      <Text style={styles.memberLabel} numberOfLines={1}>{m.username}</Text>
    </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* ── Group Switcher ── */}
      <View style={[styles.switcherContainer, { paddingTop: insets.top + 24 }]}>
        <View style={styles.switcherSegment}>
          {allGroups.map((g, i) => (
            <TouchableOpacity
              key={g.id}
              style={[
                styles.switcherSlot,
                i > 0 && styles.slotBorderLeft,
                activeGroupId === g.id && styles.slotActive,
              ]}
              onPress={() => onSwitchGroup(g.id)}
              activeOpacity={0.75}
            >
              <Text
                style={[styles.slotText, activeGroupId === g.id && styles.slotTextActive]}
                numberOfLines={1}
              >
                {g.name}
              </Text>
            </TouchableOpacity>
          ))}
          {remaining > 0 && (
            <TouchableOpacity
              style={[styles.switcherSlot, allGroups.length > 0 && styles.slotBorderLeft]}
              onPress={onAddGroup}
              activeOpacity={0.75}
            >
              <Text style={styles.slotAddText}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Vault Content ── */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="rgba(255,255,255,0.4)"
          />
        }
      >
        {/* Group header */}
        <View style={styles.groupHeader}>
          <Text style={styles.groupTitle} numberOfLines={1}>{groupName || "Groupe"}</Text>
          {isAdmin ? (
            <TouchableOpacity style={styles.iconBtn} onPress={onOpenSettings}>
              <GearIcon />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.leaveBtn} onPress={onLeaveGroup}>
              <Text style={styles.leaveBtnText}>Quitter</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stats / Reveal card */}
        {unlocked ? (
          <TouchableOpacity style={styles.revealCard} onPress={onOpenReveal} activeOpacity={0.82}>
            <Text style={styles.revealEmoji}>🎉</Text>
            <Text style={styles.revealTitle}>Voir le reveal !</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.statsCard, strokeWidth > 0 && { borderWidth: strokeWidth }]}>
            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statNumber}>{photoCount}</Text>
                <Text style={styles.statLabelText}>TOTAL</Text>
              </View>
              <View style={styles.statSeparator} />
              <View style={[styles.statBlock, { flex: 2, alignItems: "flex-start", paddingLeft: 16 }]}>
                <Text style={styles.statHint}>Déverrouillage dans</Text>
                <Text style={styles.statCountdown}>{timeLeft}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Participants */}
        <Text style={styles.sectionTitle}>Participants</Text>
        <View style={styles.participantsRow}>
          {displayedMembers.map((m) => (
            <View key={m.user_id}>{renderAvatar(m, crownUserId === m.user_id)}</View>
          ))}
          {hasMoreMembers && (
            <TouchableOpacity onPress={() => setShowAllMembers(true)} style={{ alignItems: "center", gap: 4 }}>
              <View style={styles.seeMoreCircle}>
                <Text style={styles.seeMoreCount}>+{sortedMembers.length - 4}</Text>
              </View>
              <Text style={styles.memberLabel}>voir +</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Access */}
        <Text style={styles.sectionTitle}>Accès</Text>
        <View style={styles.accessCard}>
          <View style={styles.accessRow}>
            <Text style={styles.accessLabel}>code</Text>
            <Text style={styles.accessValue} numberOfLines={1}>{inviteCode}</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={handleCopyCode}>
              <Text style={styles.copyBtnText}>{copiedCode ? "✓" : "Copier"}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.accessDivider} />
          <View style={styles.accessRow}>
            <Text style={styles.accessLabel}>lien</Text>
            <Text style={styles.accessValue} numberOfLines={1}>{APP_LINK}</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={handleCopyLink}>
              <Text style={styles.copyBtnText}>{copiedLink ? "✓" : "Copier"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* DEV tools */}
        {__DEV__ && (
          <View style={{ gap: 8, marginTop: 8 }}>
            {onSimulateReveal && (
              <TouchableOpacity style={styles.debugBtn} onPress={onSimulateReveal}>
                <Text style={styles.debugBtnText}>🔓 Simuler reveal (DEV)</Text>
              </TouchableOpacity>
            )}
            {onDebugNotifReveal && (
              <TouchableOpacity style={styles.debugBtn} onPress={onDebugNotifReveal}>
                <Text style={styles.debugBtnText}>🔔 Debug Reveal (DEV)</Text>
              </TouchableOpacity>
            )}
            {onDebugNotifPhoto && (
              <TouchableOpacity style={styles.debugBtn} onPress={onDebugNotifPhoto}>
                <Text style={styles.debugBtnText}>🔔 Debug Photo (DEV)</Text>
              </TouchableOpacity>
            )}
            {onDebugNotifInvite && (
              <TouchableOpacity style={styles.debugBtn} onPress={onDebugNotifInvite}>
                <Text style={styles.debugBtnText}>🔔 Debug Invite (DEV)</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
      </Animated.View>

      {/* ── Remove member (two-step) ── */}
      <BottomSheet visible={!!memberToRemove} onClose={handleCancelRemove}>
        {!showRemoveConfirm ? (
          <>
            <Text style={styles.membersTitle}>Retirer du groupe</Text>
            <Text style={styles.removeBody}>
              Retirer <Text style={styles.removeUsername}>{memberToRemove?.username}</Text> du groupe ?{"\n"}
              Il ne pourra plus accéder aux moments.
            </Text>
            <TouchableOpacity style={styles.removeBtn} onPress={() => setShowRemoveConfirm(true)}>
              <Text style={styles.removeBtnText}>Retirer</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCancelRemove} style={styles.removeCancelWrap}>
              <Text style={styles.removeCancelText}>Annuler</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.membersTitle}>Confirmer le retrait</Text>
            <Text style={styles.removeBody}>
              Es-tu sûr de vouloir retirer{" "}
              <Text style={styles.removeUsername}>{memberToRemove?.username}</Text>
              {" "}définitivement du groupe ?
            </Text>
            <TouchableOpacity style={styles.removeBtn} onPress={handleConfirmRemove} disabled={removing}>
              <Text style={styles.removeBtnText}>{removing ? "..." : "Confirmer"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCancelRemove} style={styles.removeCancelWrap}>
              <Text style={styles.removeCancelText}>Annuler</Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheet>

      {/* ── All Members ── */}
      <BottomSheet visible={showAllMembers} onClose={() => setShowAllMembers(false)}>
        <Text style={styles.membersTitle}>Participants ({sortedMembers.length})</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.membersGrid}>
            {sortedMembers.map((m) => (
              <View key={m.user_id} style={styles.membersGridItem}>
                {renderAvatar(m, crownUserId === m.user_id, 52)}
              </View>
            ))}
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  // Switcher
  switcherContainer: { backgroundColor: "#000", paddingHorizontal: 24, paddingBottom: 16 },
  switcherSegment: {
    flexDirection: "row", height: 40,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 10, overflow: "hidden",
  },
  switcherSlot: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 6 },
  slotBorderLeft: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: "rgba(255,255,255,0.2)" },
  slotActive: { backgroundColor: "#FFF" },
  slotText: { color: "rgba(255,255,255,0.55)", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  slotTextActive: { color: "#000" },
  slotAddText: { color: "rgba(255,255,255,0.85)", fontFamily: "Inter_600SemiBold", fontSize: 20, lineHeight: 22 },

  // Content
  scrollContent: { paddingHorizontal: 24, paddingTop: 14 },

  // Group header
  groupHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  groupTitle: { fontFamily: "Inter_700Bold", fontSize: 28, color: "#FFF", letterSpacing: -1, flex: 1, marginRight: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  leaveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: "rgba(255,59,48,0.12)", borderWidth: 1, borderColor: "rgba(255,59,48,0.3)" },
  leaveBtnText: { color: "#FF3B30", fontFamily: "Inter_600SemiBold", fontSize: 13 },

  // Stats card
  statsCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 20, marginBottom: 28, borderColor: "rgba(255,255,255,0.9)" },
  statsRow: { flexDirection: "row", alignItems: "center" },
  statBlock: { flex: 1, alignItems: "center" },
  statNumber: { fontFamily: "Inter_700Bold", fontSize: 42, color: "#000", letterSpacing: -2 },
  statLabelText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "rgba(0,0,0,0.45)", textTransform: "uppercase", letterSpacing: 1, marginTop: -2 },
  statSeparator: { width: 1, height: 44, backgroundColor: "rgba(0,0,0,0.1)" },
  statHint: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(0,0,0,0.5)", marginBottom: 3 },
  statCountdown: { fontFamily: "Inter_700Bold", fontSize: 19, color: "#000", letterSpacing: 0.5 },

  // Reveal card
  revealCard: { backgroundColor: "#FFF", borderRadius: 16, paddingVertical: 32, alignItems: "center", marginBottom: 28, gap: 8 },
  revealEmoji: { fontSize: 42 },
  revealTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: "#000" },

  // Participants
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFF", marginBottom: 14, marginTop: 4 },
  participantsRow: { flexDirection: "row", gap: 14, marginBottom: 28, alignItems: "flex-start" },
  avatarWrap: { backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center", overflow: "hidden" },
  avatarAdmin: { borderWidth: 2, borderColor: "#FF3B30" },
  crownWrap: { position: "absolute", top: -8, left: 0, right: 0, alignItems: "center", zIndex: 1 },
  memberLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.55)", textAlign: "center" },
  seeMoreCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.12)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  seeMoreCount: { color: "#FFF", fontFamily: "Inter_600SemiBold", fontSize: 13 },

  // Access
  accessCard: { backgroundColor: "#111", borderRadius: 16, overflow: "hidden", marginBottom: 28, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)" },
  accessRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  accessLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "rgba(255,255,255,0.35)", width: 34 },
  accessValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#FFF", flex: 1 },
  accessDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.08)", marginHorizontal: 16 },
  copyBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)" },
  copyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FFF" },

  // Members / remove sheets
  membersTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#FFF", marginBottom: 20 },
  membersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  membersGridItem: {},
  removeBody: { color: "rgba(255,255,255,0.55)", fontFamily: "Inter_400Regular", fontSize: 14, marginBottom: 24, lineHeight: 20 },
  removeUsername: { color: "#FFF", fontFamily: "Inter_600SemiBold" },
  removeBtn: { backgroundColor: "#FF3B30", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  removeBtnText: { color: "#FFF", fontSize: 15, fontFamily: "Inter_700Bold" },
  removeCancelWrap: { alignItems: "center", paddingVertical: 8 },
  removeCancelText: { color: "rgba(255,255,255,0.4)", fontFamily: "Inter_600SemiBold", fontSize: 15 },

  // Debug
  debugBtn: { paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(255,200,0,0.15)", borderWidth: 1, borderColor: "rgba(255,200,0,0.4)", alignItems: "center" },
  debugBtnText: { color: "#FFD700", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
