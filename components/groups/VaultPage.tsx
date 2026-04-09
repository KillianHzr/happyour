import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Text as SvgText } from "react-native-svg";
import { scheduleImmediateLocalNotification } from "../../lib/notifications";
import PhotoFeed, { type PhotoEntry } from "../PhotoFeed";
import VaultCounter from "../VaultCounter";
import { type StickerId } from "../stickers";
import { GroupIcon, GroupAddIcon } from "./GroupIcons";
import LiveReactions from "../reveal/LiveReactions";

type Props = {
  unlocked: boolean;
  photos: PhotoEntry[];
  crownWinnerId: string | null;
  crownDurationMs: number;
  groupName: string;
  onReact: (photoId: string, stickerId: StickerId) => void;
  currentUserId?: string;
  currentUsername?: string;
  currentAvatarUrl?: string | null;
  isVisible: boolean;
  nextRevealDate: Date;
  photoCount: number;
  revealDate: Date;
  isAdmin: boolean;
  onOpenMembers: () => void;
  onSimulateReveal: () => void;
  groupId: string;
  onScrollLock?: (locked: boolean) => void;
};

export default function VaultPage({
  unlocked, photos, crownWinnerId, crownDurationMs, groupName,
  onReact, currentUserId, currentUsername, currentAvatarUrl, isVisible, nextRevealDate, photoCount, revealDate,
  isAdmin, onOpenMembers, onSimulateReveal, groupId, onScrollLock,
}: Props) {
  const insets = useSafeAreaInsets();

  if (unlocked) {
    return (
      <View style={styles.unlocked}>
        <PhotoFeed
          photos={photos}
          onReact={onReact}
          currentUserId={currentUserId}
          nextUnlockDate={nextRevealDate}
          crownWinnerId={crownWinnerId}
          crownDurationMs={crownDurationMs}
          groupName={groupName}
          onScrollLock={onScrollLock}
        />
        {currentUserId && currentUsername && (
          <LiveReactions
            groupId={groupId}
            currentUserId={currentUserId}
            currentUsername={currentUsername}
            currentAvatarUrl={currentAvatarUrl ?? null}
            isVisible={isVisible}
          />
        )}
      </View>
    );
  }

  const lastPoster = photos.length > 0 ? photos[photos.length - 1] : null;

  return (
    <ScrollView
      style={[styles.scroll, { paddingTop: insets.top + 40 }]}
      contentContainerStyle={{ paddingBottom: 160 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.groupTitle, { flexShrink: 1, marginRight: 12 }]}>{groupName || "Groupe"}</Text>
        <TouchableOpacity onPress={onOpenMembers} style={styles.groupBtn}>
          {isAdmin ? <GroupAddIcon /> : <GroupIcon />}
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.lockedContent}>
        
          <VaultCounter
            totalCount={photoCount}
            unlockDate={revealDate}
            lastPoster={lastPoster ? { avatar_url: lastPoster.avatar_url, username: lastPoster.username } : null}
          />
        </View>
      </View>

      {__DEV__ && (
        <View style={{ gap: 8, marginTop: 24, marginHorizontal: 24 }}>
          <TouchableOpacity style={styles.debugBtn} onPress={onSimulateReveal}>
            <Text style={styles.debugBtnText}>🔓 Simuler reveal (DEV)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.debugBtn}
            onPress={() => scheduleImmediateLocalNotification(
              "Le coffre est ouvert !",
              `Les moments de "${groupName || "Groupe"}" sont disponibles`,
              { type: "recap", groupId }
            )}
          >
            <Text style={styles.debugBtnText}>🔔 Debug Reveal (DEV)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.debugBtn}
            onPress={() => scheduleImmediateLocalNotification(
              groupName || "Groupe",
              `Un ami a partagé un moment !`,
              { type: "new_photo", groupId }
            )}
          >
            <Text style={styles.debugBtnText}>🔔 Debug Photo (DEV)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.debugBtn}
            onPress={() => scheduleImmediateLocalNotification(
              "Nouvelle invitation !",
              `Tu as été invité à rejoindre "${groupName || "Groupe"}"`,
              { type: "invite", groupName: groupName || "Groupe" }
            )}
          >
            <Text style={styles.debugBtnText}>🔔 Debug Invite (DEV)</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  unlocked: { flex: 1 },
  scroll: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, marginBottom: 40 },
  groupTitle: { fontFamily: "Inter_700Bold", fontSize: 28, color: "#FFF", letterSpacing: -1 },
  groupBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  body: { flex: 1 },
  lockedContent: { paddingHorizontal: 24 },
  debugBtn: { paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(255,200,0,0.15)", borderWidth: 1, borderColor: "rgba(255,200,0,0.4)", alignItems: "center" },
  debugBtnText: { color: "#FFD700", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
