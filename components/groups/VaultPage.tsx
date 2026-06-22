import { useRef, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing, RefreshControl, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import Svg, { Path } from "react-native-svg";
import { scheduleImmediateLocalNotification } from "../../lib/notifications";
import { type PhotoEntry } from "../PhotoFeed";
import BottomSheet from "../BottomSheet";
import { getChallengePrompt, getWinnerResponseIds, type ChallengeWithData, type ChallengeResponse } from "../../lib/challenges";
import { r2Storage } from "../../lib/r2";
import ChallengeAudioPlayer from "./ChallengeAudioPlayer";
import { radii, typography, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";

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
  revealEndDate?: Date;
  unlocked: boolean;
  currentUserPostedThisWeek: boolean;
  onOpenReveal: () => void;
  onOpenSettings: () => void;
  onLeaveGroup: () => void;
  onRemoveMember?: (userId: string) => Promise<void>;
  groupId: string;
  vaultChallenges?: { period1: ChallengeWithData | null; period2: ChallengeWithData | null } | null;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  onSimulateReveal?: () => void;
  onDebugNotifReveal?: () => void;
  onDebugNotifPhoto?: () => void;
  onDebugNotifInvite?: () => void;
  onDebugResetChallenges?: () => void;
  onDebugResetMyResponse?: () => void;
  onDebugShowCurrentChallenges?: () => void;
  onDebugOpenCreateCustom?: () => void;
  onDebugOpenQueueCustom?: () => void;
  onDebugGroupNamePress?: () => void;
  onGoToCamera?: () => void;
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

function useCountdown(targetDate: Date): { text: string; msLeft: number } {
  const [text, setText] = useState("");
  const [msLeft, setMsLeft] = useState(0);
  const targetTime = targetDate.getTime();

  useEffect(() => {
    const tick = () => {
      const diff = targetTime - Date.now();
      if (diff <= 0) { setText("00:00:00"); setMsLeft(0); return; }
      setMsLeft(diff);
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const dStr = d > 0 ? `${d}j ` : "";
      setText(`${dStr}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [targetTime]);
  return { text, msLeft };
}

const APP_LINK = "app-gobelins-m2.expo.dev";

const DAY_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
function formatRevealDeadline(date: Date): string {
  return DAY_FR[date.getDay()];
}

const LockIcon = () => {
  const { colors } = useTheme();
  return (
    <Svg width="32" height="32" viewBox="0 0 24 24" fill="none">
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" stroke={colors.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

const GearIcon = () => {
  const { colors } = useTheme();
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke={colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke={colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

const CrownIcon = () => (
  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <Path d="M2 19l2-9 4.5 4L12 5l3.5 9L20 10l2 9H2z" stroke="#FFD700" fill="#FFD700" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
  </Svg>
);

export default function VaultPage({
  allGroups, activeGroupId, onSwitchGroup, onAddGroup,
  groupName, inviteCode, isAdmin, currentUserId, members, photoCount, photos, revealDate, revealEndDate,
  unlocked, currentUserPostedThisWeek, onOpenReveal, onOpenSettings, onLeaveGroup, onRemoveMember,
  groupId, vaultChallenges, onRefresh, refreshing, onSimulateReveal, onDebugNotifReveal, onDebugNotifPhoto, onDebugNotifInvite,
  onDebugResetChallenges, onDebugResetMyResponse, onDebugShowCurrentChallenges,
  onDebugOpenCreateCustom, onDebugOpenQueueCustom, onDebugGroupNamePress, onGoToCamera,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { text: timeLeft } = useCountdown(revealDate);
  const { text: revealEndLeft, msLeft: revealEndMsLeft } = useCountdown(revealEndDate ?? new Date(0));
  const revealExpiringSoon = !!revealEndDate && revealEndMsLeft > 0 && revealEndMsLeft < 4 * 3600000;
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<MemberInfo | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
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
            : <Text style={{ color: colors.text, fontFamily: typography.family.bold, fontSize: size * 0.38 }}>{m.username[0]?.toUpperCase()}</Text>}
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
            tintColor={colors.textTertiary}
          />
        }
      >
        {/* Group header */}
        <View style={styles.groupHeader}>
          {onDebugGroupNamePress ? (
            <TouchableOpacity onPress={onDebugGroupNamePress} activeOpacity={0.6} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.groupTitle} numberOfLines={1}>{groupName || "Groupe"}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.groupTitle} numberOfLines={1}>{groupName || "Groupe"}</Text>
          )}
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
          photoCount > 0 ? (
            currentUserPostedThisWeek ? (
              <TouchableOpacity style={styles.revealCard} onPress={onOpenReveal} activeOpacity={0.82}>
                <Text style={styles.revealEmoji}>🎉</Text>
                <Text style={styles.revealTitle}>Voir le reveal !</Text>
                {revealEndDate && revealEndMsLeft > 0 && (
                  <View style={[styles.revealExpiry, revealExpiringSoon && styles.revealExpiryRed]}>
                    <Text style={[styles.revealExpiryText, revealExpiringSoon && styles.revealExpiryTextRed]}>
                      Expire dans {revealEndLeft}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.revealLockedCard}>
                <LockIcon />
                <Text style={styles.revealLockedTitle}>Reveal verrouillé</Text>
                <Text style={styles.revealLockedHint}>Tu n'as pas partagé de moment cette semaine</Text>
                {onGoToCamera && (
                  <TouchableOpacity 
                    style={styles.postFirstBtn} 
                    onPress={onGoToCamera}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.postFirstBtnText}>Poster mon moment !</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          ) : (
            <View style={styles.revealCard}>
              <View style={{ opacity: 0.6, alignItems: 'center' }}>
                <Text style={styles.revealEmoji}>😔</Text>
                <Text style={styles.revealTitle}>Personne n'a partagé de moment</Text>
                <Text style={styles.revealEmptyHint}>Poste le premier moment pour le prochain reveal</Text>
              </View>
              {onGoToCamera && (
                <TouchableOpacity 
                  style={styles.postFirstBtn} 
                  onPress={onGoToCamera}
                  activeOpacity={0.8}
                >
                  <Text style={styles.postFirstBtnText}>Poste pour le prochain reveal !</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        ) : (
          currentUserPostedThisWeek ? (
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
          ) : (
            <View style={styles.revealLockedCard}>
              <LockIcon />
              <Text style={styles.revealLockedTitle}>Reveal verrouillé</Text>
              <Text style={styles.revealLockedHint}>
                {"Poste au moins un moment pour accéder\nau reveal du "}<Text style={{ fontFamily: typography.family.bold, color: colors.text }}>{formatRevealDeadline(revealDate)}</Text>
              </Text>
              {onGoToCamera && (
                <TouchableOpacity 
                  style={styles.postFirstBtn} 
                  onPress={onGoToCamera}
                  activeOpacity={0.8}
                >
                  <Text style={styles.postFirstBtnText}>Poster mon moment !</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        )}

        {/* Challenge results (visible after reveal ends) */}
        {!unlocked && vaultChallenges && (vaultChallenges.period1 || vaultChallenges.period2) && (
          <VaultChallengeCard challenges={vaultChallenges} currentUserId={currentUserId} members={members} />
        )}

        {/* Participants */}
        <TouchableOpacity 
          onPress={onSimulateReveal} 
          activeOpacity={1}
          style={{ paddingVertical: 10, marginTop: -10 }} // Larger hit area
        >
          <Text style={styles.sectionTitle}>Participants</Text>
        </TouchableOpacity>
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
        <TouchableOpacity onPress={() => setShowDebugModal(true)} activeOpacity={1}>
          <Text style={styles.sectionTitle}>Accès</Text>
        </TouchableOpacity>
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

      {/* ── Debug Modal ── */}
      <BottomSheet visible={showDebugModal} onClose={() => setShowDebugModal(false)}>
        <Text style={styles.membersTitle}>Debug Tools (DEV)</Text>
        <View style={{ gap: 10, paddingBottom: 20 }}>
          {onSimulateReveal && (
            <TouchableOpacity style={styles.debugBtn} onPress={onSimulateReveal}>
              <Text style={styles.debugBtnText}>🔓 Simuler reveal</Text>
            </TouchableOpacity>
          )}
          {onDebugNotifReveal && (
            <TouchableOpacity style={styles.debugBtn} onPress={onDebugNotifReveal}>
              <Text style={styles.debugBtnText}>🔔 Debug Reveal Notif</Text>
            </TouchableOpacity>
          )}
          {onDebugNotifPhoto && (
            <TouchableOpacity style={styles.debugBtn} onPress={onDebugNotifPhoto}>
              <Text style={styles.debugBtnText}>🔔 Debug Photo Notif</Text>
            </TouchableOpacity>
          )}
          {onDebugNotifInvite && (
            <TouchableOpacity style={styles.debugBtn} onPress={onDebugNotifInvite}>
              <Text style={styles.debugBtnText}>🔔 Debug Invite Notif</Text>
            </TouchableOpacity>
          )}
          {onDebugResetChallenges && (
            <TouchableOpacity style={styles.debugBtn} onPress={onDebugResetChallenges}>
              <Text style={styles.debugBtnText}>🗑️ Reset défis semaine</Text>
            </TouchableOpacity>
          )}
          {onDebugResetMyResponse && (
            <TouchableOpacity style={styles.debugBtn} onPress={onDebugResetMyResponse}>
              <Text style={styles.debugBtnText}>↩️ Reset ma réponse défi</Text>
            </TouchableOpacity>
          )}
          {onDebugShowCurrentChallenges && (
            <TouchableOpacity style={styles.debugBtn} onPress={onDebugShowCurrentChallenges}>
              <Text style={styles.debugBtnText}>📅 Défis semaine actuelle</Text>
            </TouchableOpacity>
          )}
          {onDebugOpenCreateCustom && (
            <TouchableOpacity style={styles.debugBtn} onPress={onDebugOpenCreateCustom}>
              <Text style={styles.debugBtnText}>🎯 Créer défi custom</Text>
            </TouchableOpacity>
          )}
          {onDebugOpenQueueCustom && (
            <TouchableOpacity style={styles.debugBtn} onPress={onDebugOpenQueueCustom}>
              <Text style={styles.debugBtnText}>📋 Ma file custom</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => setShowDebugModal(false)} style={styles.removeCancelWrap}>
          <Text style={styles.removeCancelText}>Fermer</Text>
        </TouchableOpacity>
      </BottomSheet>
    </View>
  );
}

// Shared media type detection (same logic as ChallengeVotePage)
function vcMediaType(path: string | null): "text" | "audio" | "drawing" | "photo" {
  if (!path || path === "text_mode") return "text";
  if (path.endsWith(".m4a")) return "audio";
  if (path.includes("_draw")) return "drawing";
  return "photo";
}

const VC_MINI_WAVE = [5, 9, 7, 13, 9, 11, 6];

function VcThumbContent({ r }: { r: ChallengeResponse }) {
  const { colors } = useTheme();
  const vcStyles = useThemedStyles(makeVcStyles);
  const type = vcMediaType(r.image_path);
  if (type === "text") {
    return (
      <View style={[vcStyles.thumb, { backgroundColor: colors.card, justifyContent: "center", alignItems: "center", padding: 6 }]}>
        <Text style={{ color: colors.text, fontSize: typography.size.xs, textAlign: "center", fontFamily: typography.family.semibold }} numberOfLines={4}>
          {r.note}
        </Text>
      </View>
    );
  }
  if (type === "audio") {
    return (
      <View style={[vcStyles.thumb, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", gap: 4 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          {VC_MINI_WAVE.map((h, i) => (
            <View key={i} style={{ width: 2.5, height: h, borderRadius: radii.xs, backgroundColor: colors.textSecondary }} />
          ))}
        </View>
        <View style={{ width: 20, height: 20, borderRadius: radii.sm, backgroundColor: colors.accentMuted, justifyContent: "center", alignItems: "center" }}>
          <Svg width="8" height="8" viewBox="0 0 24 24" fill={colors.text}>
            <Path d="M8 5v14l11-7z" />
          </Svg>
        </View>
      </View>
    );
  }
  // drawing or photo — cover for thumbnail
  return <Image source={{ uri: r.url }} style={vcStyles.thumb} contentFit="cover" />;
}

function VcModalMedia({ imagePath, url, note }: { imagePath: string | null; url: string | null; note: string | null }) {
  const { colors } = useTheme();
  const type = vcMediaType(imagePath);
  if (type === "text") {
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", padding: 28 }]}>
        <Text style={{ color: colors.text, fontFamily: typography.family.semibold, fontSize: typography.size.xl, textAlign: "center", lineHeight: 28 }}>
          {note ?? ""}
        </Text>
      </View>
    );
  }
  if (type === "audio") {
    if (!url) return null;
    return <ChallengeAudioPlayer key={url} url={url} waveform={undefined} />;
  }
  if (type === "drawing") {
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }]}>
        <Image source={{ uri: url ?? "" }} style={{ width: "100%", aspectRatio: 3 / 4 }} contentFit="fill" />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url ?? "" }}
      style={StyleSheet.absoluteFillObject}
      contentFit="cover"
      contentPosition={{ top: 0, left: "50%" }}
    />
  );
}

function VaultChallengeCard({
  challenges,
  currentUserId,
  members,
}: {
  challenges: { period1: ChallengeWithData | null; period2: ChallengeWithData | null };
  currentUserId?: string;
  members: MemberInfo[];
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const vcStyles = useThemedStyles(makeVcStyles);
  const [selected, setSelected] = useState<{ response: ChallengeResponse; challenge: ChallengeWithData } | null>(null);
  const [swapped, setSwapped] = useState(false);

  const periods: Array<{ label: string; data: ChallengeWithData | null }> = [
    { label: "Défi 1 · Lundi → Mercredi", data: challenges.period1 },
    { label: "Défi 2 · Jeudi → Dimanche", data: challenges.period2 },
  ];
  const hasAny = periods.some((p) => p.data !== null);
  if (!hasAny) return null;

  const openResponse = (response: ChallengeResponse, challenge: ChallengeWithData) => {
    setSelected({ response, challenge });
    setSwapped(false);
  };

  const sel = selected?.response ?? null;
  const selChallenge = selected?.challenge ?? null;
  const hasSecond = sel ? !!(sel.second_image_path) : false;
  const modalImagePath = sel ? (swapped ? (sel.second_image_path ?? sel.image_path) : sel.image_path) : null;
  const modalUrl = sel
    ? swapped
      ? sel.second_image_path ? r2Storage.getPublicUrl(sel.second_image_path) : sel.url
      : sel.url
    : null;
  const modalNote = sel ? (swapped ? (sel.second_note ?? null) : sel.note) : null;
  const modalType = vcMediaType(modalImagePath);
  const voters = sel && selChallenge
    ? selChallenge.votes.filter((v) => v.response_id === sel.id).map((v) => {
        const m = members.find((m) => m.user_id === v.voter_id);
        return m ?? { user_id: v.voter_id, username: "?", avatar_url: null };
      })
    : [];

  return (
    <View style={vcStyles.card}>
      <View style={vcStyles.header}>
        <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.secondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <Path d="M4 22h16" />
          <Path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <Path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <Path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
        </Svg>
        <Text style={vcStyles.headerText}>Défis de la semaine</Text>
      </View>

      {periods.map(({ label, data }) => {
        if (!data) return null;
        const winnerIds = getWinnerResponseIds(data.responses, data.votes);
        const winnerResponses = data.responses.filter((r) => winnerIds.includes(r.id));
        const targetResponse = data.responses.find((r) => r.is_target_response);
        const prompt = data.target_user_id === currentUserId
          ? "Tu étais la cible !"
          : getChallengePrompt(data.target_username, data.theme.label);

        return (
          <View key={data.id} style={vcStyles.period}>
            <Text style={vcStyles.periodLabel}>{label}</Text>
            <Text style={vcStyles.prompt} numberOfLines={2}>{prompt}</Text>
            {data.proposed_by_username && (
              <View style={vcStyles.proposerChip}>
                <Text style={vcStyles.proposerChipText}>✦ {data.proposed_by_username}</Text>
              </View>
            )}
            <View style={vcStyles.row}>
              {/* Target response */}
              {targetResponse ? (
                vcMediaType(targetResponse.image_path) !== "text" ? (
                  <TouchableOpacity style={vcStyles.thumbWrap} onPress={() => openResponse(targetResponse, data)} activeOpacity={0.8}>
                    <VcThumbContent r={targetResponse} />
                    <View style={vcStyles.avatarOverlay}>
                      {data.target_avatar_url ? (
                        <Image source={{ uri: data.target_avatar_url }} style={vcStyles.avatarSmall} contentFit="cover" />
                      ) : (
                        <View style={[vcStyles.avatarSmall, vcStyles.avatarFallback]}>
                          <Text style={vcStyles.avatarLetter}>{data.target_username[0]?.toUpperCase()}</Text>
                        </View>
                      )}
                    </View>
                    <View style={vcStyles.targetLabel}>
                      <Text style={vcStyles.targetLabelText}>Cible</Text>
                    </View>
                    {targetResponse.second_image_path && <View style={vcStyles.dualDot} />}
                  </TouchableOpacity>
                ) : (
                  // Text response for target — show as tappable text tile
                  <TouchableOpacity style={vcStyles.thumbWrap} onPress={() => openResponse(targetResponse, data)} activeOpacity={0.8}>
                    <VcThumbContent r={targetResponse} />
                    <View style={vcStyles.targetLabel}>
                      <Text style={vcStyles.targetLabelText}>Cible</Text>
                    </View>
                  </TouchableOpacity>
                )
              ) : (
                <View style={[vcStyles.thumbWrap, vcStyles.thumbEmpty]}>
                  {data.target_avatar_url ? (
                    <Image source={{ uri: data.target_avatar_url }} style={vcStyles.avatarCenter} contentFit="cover" />
                  ) : (
                    <View style={[vcStyles.avatarCenter, vcStyles.avatarFallback]}>
                      <Text style={vcStyles.avatarLetter}>{data.target_username[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={vcStyles.thumbName}>{data.target_username}</Text>
                </View>
              )}
              {/* Winner response(s) */}
              {winnerResponses.length > 0 ? (
                winnerResponses.slice(0, 2).map((r) => (
                  <TouchableOpacity key={r.id} style={vcStyles.thumbWrap} onPress={() => openResponse(r, data)} activeOpacity={0.8}>
                    <VcThumbContent r={r} />
                    <View style={vcStyles.winnerBadge}><Text style={{ fontSize: typography.size.xs }}>🏆</Text></View>
                    <View style={vcStyles.targetLabel}>
                      <Text style={vcStyles.targetLabelText}>{r.username}</Text>
                    </View>
                    {r.second_image_path && <View style={vcStyles.dualDot} />}
                  </TouchableOpacity>
                ))
              ) : (
                <View style={[vcStyles.thumbWrap, vcStyles.thumbEmpty]}>
                  <Text style={vcStyles.emptyText}>Aucun vote</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}

      {/* Detail modal */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        {sel && selChallenge && (
          <View style={vcStyles.modalOverlay}>
            <View style={[vcStyles.modalContainer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
              {/* Top bar */}
              <View style={vcStyles.modalTopBar}>
                <TouchableOpacity style={vcStyles.modalCloseBtn} onPress={() => setSelected(null)} activeOpacity={0.7}>
                  <Svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <Path d="M18 6L6 18M6 6l12 12" stroke={colors.text} strokeWidth="2.5" strokeLinecap="round" />
                  </Svg>
                </TouchableOpacity>
                <View style={vcStyles.modalAuthorRow}>
                  {sel.avatar_url ? (
                    <Image source={{ uri: sel.avatar_url }} style={vcStyles.modalAvatar} contentFit="cover" />
                  ) : (
                    <View style={[vcStyles.modalAvatar, vcStyles.avatarFallback]}>
                      <Text style={vcStyles.avatarLetter}>{sel.username[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={vcStyles.modalAuthorName}>{sel.username}</Text>
                </View>
                {hasSecond && (
                  <TouchableOpacity style={vcStyles.swapBtn} onPress={() => setSwapped(v => !v)} activeOpacity={0.7}>
                    <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M7 16V4m0 0L3 8m4-4l4 4" /><Path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
                    </Svg>
                    <Text style={vcStyles.swapBtnText}>{swapped ? "1ère" : "2ème"}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Media */}
              <View style={vcStyles.modalMedia}>
                <VcModalMedia imagePath={modalImagePath} url={modalUrl} note={modalNote} />
              </View>

              {/* Caption — skip when text_mode (content is already the media) */}
              {modalType !== "text" && modalNote ? (
                <View style={vcStyles.noteBox}>
                  <Text style={vcStyles.noteText}>{modalNote}</Text>
                </View>
              ) : null}

              {/* Voters */}
              {voters.length > 0 && (
                <View style={vcStyles.votersRow}>
                  <Text style={vcStyles.votersLabel}>Votes ({voters.length})</Text>
                  <View style={vcStyles.votersList}>
                    {voters.map((v) => (
                      <View key={v.user_id} style={vcStyles.voterChip}>
                        {v.avatar_url ? (
                          <Image source={{ uri: v.avatar_url }} style={vcStyles.voterAvatar} contentFit="cover" />
                        ) : (
                          <View style={[vcStyles.voterAvatar, vcStyles.avatarFallback]}>
                            <Text style={{ color: colors.text, fontFamily: typography.family.bold, fontSize: typography.size.xs }}>{v.username[0]?.toUpperCase()}</Text>
                          </View>
                        )}
                        <Text style={vcStyles.voterName}>{v.username}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const makeVcStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerText: {
    color: colors.text,
    fontFamily: typography.family.bold,
    fontSize: typography.size.sm,
  },
  period: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.cardBorder,
  },
  periodLabel: {
    color: colors.textTertiary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  prompt: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
    lineHeight: 19,
  },
  proposerChip: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,200,80,0.1)",
    borderRadius: radii.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(255,200,80,0.22)",
  },
  proposerChipText: {
    color: "rgba(255,200,80,0.8)",
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  thumbWrap: {
    width: 90,
    height: 90,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: colors.card,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  thumbEmpty: {
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  thumbName: {
    color: colors.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  avatarOverlay: {
    position: "absolute",
    top: 6,
    left: 6,
  },
  avatarSmall: {
    width: 22,
    height: 22,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  avatarCenter: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
  },
  avatarFallback: {
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    color: colors.text,
    fontFamily: typography.family.bold,
    fontSize: typography.size.xs,
  },
  targetLabel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.opacityLight,
    paddingVertical: 3,
    alignItems: "center",
  },
  targetLabelText: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  winnerBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: radii.md,
    backgroundColor: colors.opacityLight,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: colors.textTertiary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    textAlign: "center",
  },
  dualDot: {
    position: "absolute",
    bottom: 22,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.textSecondary,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  modalContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  modalTopBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    backgroundColor: colors.accentMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  modalAuthorRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalAvatar: {
    width: 28,
    height: 28,
    borderRadius: radii.md,
  },
  modalAuthorName: {
    color: colors.text,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.sm,
  },
  swapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.lg,
  },
  swapBtnText: {
    color: colors.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
  modalMedia: {
    flex: 1,
    borderRadius: radii.lg,
    overflow: "hidden",
    backgroundColor: colors.bg,
    marginBottom: 12,
  },
  noteBox: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  noteText: {
    color: colors.secondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.sm,
    textAlign: "center",
    lineHeight: 20,
  },
  votersRow: {
    gap: 8,
  },
  votersLabel: {
    color: colors.textTertiary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  votersList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  voterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accentMuted,
    borderRadius: radii.lg,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  voterAvatar: {
    width: 20,
    height: 20,
    borderRadius: radii.sm,
  },
  voterName: {
    color: colors.secondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
  },
});

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Switcher
  switcherContainer: { backgroundColor: colors.bg, paddingHorizontal: 24, paddingBottom: 16 },
  switcherSegment: {
    flexDirection: "row", height: 40,
    borderWidth: 1, borderColor: colors.borderSecondary,
    borderRadius: radii.sm, overflow: "hidden",
  },
  switcherSlot: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 6 },
  slotBorderLeft: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.borderSecondary },
  slotActive: { backgroundColor: colors.text },
  slotText: { color: colors.secondary, fontFamily: typography.family.semibold, fontSize: typography.size.xs },
  slotTextActive: { color: colors.bg },
  slotAddText: { color: colors.secondary, fontFamily: typography.family.semibold, fontSize: typography.size.xl, lineHeight: 22 },

  // Content
  scrollContent: { paddingHorizontal: 24, paddingTop: 14 },

  // Group header
  groupHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  groupTitle: { fontFamily: typography.family.bold, fontSize: typography.size.xxl, color: colors.text, letterSpacing: -1, flex: 1, marginRight: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: radii.lg, backgroundColor: colors.accentMuted, justifyContent: "center", alignItems: "center" },
  leaveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.sm, backgroundColor: "rgba(255,59,48,0.12)", borderWidth: 1, borderColor: "rgba(255,59,48,0.3)" },
  leaveBtnText: { color: "#FF3B30", fontFamily: typography.family.semibold, fontSize: typography.size.xs },

  // Stats card
  statsCard: { backgroundColor: colors.card, borderRadius: radii.lg, padding: 20, marginBottom: 28, borderWidth: 1, borderColor: colors.cardBorder },
  statsRow: { flexDirection: "row", alignItems: "center" },
  statBlock: { flex: 1, alignItems: "center" },
  statNumber: { fontFamily: typography.family.bold, fontSize: typography.size.title, color: colors.text, letterSpacing: -2 },
  statLabelText: { fontFamily: typography.family.semibold, fontSize: typography.size.xs, color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 1, marginTop: -2 },
  statSeparator: { width: 1, height: 44, backgroundColor: colors.cardBorder },
  statLockWrap: { height: 56, justifyContent: "center", alignItems: "center" },
  statHint: { fontFamily: typography.family.regular, fontSize: typography.size.xs, color: colors.textTertiary, marginBottom: 3 },
  statCountdown: { fontFamily: typography.family.bold, fontSize: typography.size.xl, color: colors.text, letterSpacing: 0.5 },

  // Reveal card
  revealCard: { backgroundColor: colors.card, borderRadius: radii.lg, paddingVertical: 32, alignItems: "center", marginBottom: 28, gap: 8, borderWidth: 1, borderColor: colors.cardBorder },
  revealEmoji: { fontSize: typography.size.title },
  revealTitle: { fontFamily: typography.family.bold, fontSize: typography.size.xl, color: colors.text, textAlign: "center" },
  revealEmptyHint: { fontFamily: typography.family.regular, fontSize: typography.size.xs, color: colors.textTertiary, textAlign: "center", paddingHorizontal: 24, marginTop: 4 },
  revealExpiry: { marginTop: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radii.md, backgroundColor: colors.accentMuted },
  revealExpiryRed: { backgroundColor: "rgba(200,30,30,0.2)" },
  revealExpiryText: { fontFamily: typography.family.semibold, fontSize: typography.size.xs, color: colors.secondary },
  revealExpiryTextRed: { color: "#C81E1E" },

  postFirstBtn: {
    marginTop: 20,
    backgroundColor: colors.text,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center"
  },
  postFirstBtnText: {
    color: colors.bg,
    fontSize: typography.size.sm,
    fontFamily: typography.family.bold
  },

  // Post reminder (inside statsCard)
  postReminderText: { fontFamily: typography.family.regular, fontSize: typography.size.xs, color: "#FFA600", lineHeight: 18, textAlign: "center" },
  postReminderBold: { fontFamily: typography.family.bold, color: "#FFA600" },

  // Reveal locked card
  revealLockedCard: {
    backgroundColor: colors.card, borderRadius: radii.lg, paddingVertical: 32, alignItems: "center",
    marginBottom: 28, gap: 10, borderWidth: 1, borderColor: colors.cardBorder,
  },
  revealLockedTitle: { fontFamily: typography.family.bold, fontSize: typography.size.xl, color: colors.secondary, textAlign: "center" },
  revealLockedHint: { fontFamily: typography.family.regular, fontSize: typography.size.xs, color: colors.textTertiary, textAlign: "center", paddingHorizontal: 24 },

  // Participants
  sectionTitle: { fontFamily: typography.family.bold, fontSize: typography.size.md, color: colors.text, marginBottom: 14, marginTop: 4 },
  participantsRow: { flexDirection: "row", gap: 14, marginBottom: 28, alignItems: "flex-start" },
  avatarWrap: { backgroundColor: colors.card, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  avatarAdmin: { borderWidth: 2, borderColor: "#FF3B30" },
  crownWrap: { position: "absolute", top: -8, left: 0, right: 0, alignItems: "center", zIndex: 1 },
  memberLabel: { fontFamily: typography.family.regular, fontSize: typography.size.xs, color: colors.secondary, textAlign: "center" },
  seeMoreCircle: { width: 48, height: 48, borderRadius: radii.xl, backgroundColor: colors.accentMuted, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.borderSecondary },
  seeMoreCount: { color: colors.text, fontFamily: typography.family.semibold, fontSize: typography.size.xs },

  // Access
  accessCard: { backgroundColor: colors.card, borderRadius: radii.lg, overflow: "hidden", marginBottom: 28, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.cardBorder },
  accessRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  accessLabel: { fontFamily: typography.family.semibold, fontSize: typography.size.xs, color: colors.textTertiary, width: 34 },
  accessValue: { fontFamily: typography.family.semibold, fontSize: typography.size.xs, color: colors.text, flex: 1 },
  accessDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.cardBorder, marginHorizontal: 16 },
  copyBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.sm, backgroundColor: colors.accentMuted },
  copyBtnText: { fontFamily: typography.family.semibold, fontSize: typography.size.xs, color: colors.text },

  // Members / remove sheets
  membersTitle: { fontFamily: typography.family.bold, fontSize: typography.size.lg, color: colors.text, marginBottom: 20 },
  membersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  membersGridItem: {},
  removeBody: { color: colors.secondary, fontFamily: typography.family.regular, fontSize: typography.size.sm, marginBottom: 24, lineHeight: 20 },
  removeUsername: { color: colors.text, fontFamily: typography.family.semibold },
  removeBtn: { backgroundColor: "#FF3B30", borderRadius: radii.md, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  removeBtnText: { color: "#FFFFFF", fontSize: typography.size.sm, fontFamily: typography.family.bold },
  removeCancelWrap: { alignItems: "center", paddingVertical: 8 },
  removeCancelText: { color: colors.textTertiary, fontFamily: typography.family.semibold, fontSize: typography.size.sm },

  // Debug
  debugBtn: { paddingVertical: 12, borderRadius: radii.md, backgroundColor: "rgba(255,200,0,0.15)", borderWidth: 1, borderColor: "rgba(255,200,0,0.4)", alignItems: "center" },
  debugBtnText: { color: "#FFD700", fontFamily: typography.family.semibold, fontSize: typography.size.sm },
});
