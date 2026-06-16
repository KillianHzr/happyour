import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Image } from "expo-image";

const bgGradientOrange = require("../../assets/images/background-gradient-orange.png");
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettingsNav } from "../SettingsSheet";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../lib/toast-context";
import { supabase } from "../../lib/supabase";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { spacing, radii, textStyles, typography, type ThemeColors } from "../../lib/theme";
import Icon, { type IconName } from "../Icon";
import ConfirmModal from "../ConfirmModal";
import BottomSheet from "../BottomSheet";
import { NamePill } from "../atoms/NamePill";
import ProfileSettingsPage from "./ProfileSettingsPage";
import NotificationsSettingsPage from "./NotificationsSettingsPage";
import ThemeSettingsPage from "./ThemeSettingsPage";
import AccessibilitySettingsPage from "./AccessibilitySettingsPage";
import PrivacySettingsPage from "./PrivacySettingsPage";
import HelpSettingsPage from "./HelpSettingsPage";
import AboutSettingsPage from "./AboutSettingsPage";
import { APP_NAME } from "./LegalComponents";;

type Props = {
  username: string;
  avatarUrl: string | null;
  onUsernameUpdate?: (name: string) => void;
  onAvatarUpdate?: (url: string) => void;
  onEmailUpdate?: (email: string) => void;
};

// ─── Empty placeholder page ───────────────────────────────────────────────────

function EmptyPage() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}

// ─── Username pill (same as ProfilePage GroupNamePill) ────────────────────────

// ─── Main content ─────────────────────────────────────────────────────────────

export default function SettingsMainContent({ username, avatarUrl, onUsernameUpdate, onAvatarUpdate, onEmailUpdate }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const { push } = useSettingsNav();
  const insets = useSafeAreaInsets();

  const email = user?.email ?? null;

  const [showSubscription, setShowSubscription] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [showDeleteStep1, setShowDeleteStep1] = useState(false);
  const [showDeleteStep2, setShowDeleteStep2] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const pushEmpty = (title: string) =>
    push({ title, content: <EmptyPage /> });

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setShowLogout(false);
    } catch {
      showToast("Erreur", "Impossible de se déconnecter.", "error");
    } finally {
      setLoggingOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeletingAccount(true);
    try {
      const { error } = await supabase.rpc("delete_user_account");
      if (error) throw error;
      showToast("Compte supprimé", "Ton compte et tes données ont été effacés.", "success");
      await logout();
      setShowDeleteStep2(false);
    } catch {
      showToast("Erreur", "Impossible de supprimer le compte. Réessaie plus tard.", "error");
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile link ── */}
        <TouchableOpacity
          style={styles.profileRow}
          onPress={() => push({
            title: "Profil",
            content: <ProfileSettingsPage username={username} avatarUrl={avatarUrl} email={email} onUsernameUpdate={onUsernameUpdate} onAvatarUpdate={onAvatarUpdate} onEmailUpdate={onEmailUpdate} />,
            trailingButton: { label: "Enregistrer", disabled: true, onPress: () => {} },
          })}
          activeOpacity={0.7}
        >
          <View style={styles.profileInfo}>
            <View style={[styles.avatar, { backgroundColor: colors.accentMuted }]}>
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                : <Text style={[styles.avatarInitial, { color: colors.text }]}>{(username?.[0] ?? "?").toUpperCase()}</Text>
              }
            </View>
            <View style={styles.profileText}>
              <Text style={[styles.profileName, { color: colors.text }]}>{username}</Text>
              {email && (
                <Text style={[styles.profilePhone, { color: colors.textSecondary }]}>{email}</Text>
              )}
            </View>
          </View>
          <View style={styles.iconBtn}>
            <Icon name="chevron-right" size={20} color={colors.icon} />
          </View>
        </TouchableOpacity>

        {/* ── Body ── */}
        <View style={styles.body}>
          <SettingsSection
            title="Personnalisation"
            items={[
              { label: "Notifications", icon: "bell", onPress: () => push({ title: "Notifications", content: <NotificationsSettingsPage /> }) },
              { label: "Thème", icon: "moon", onPress: () => push({ title: "Thème", content: <ThemeSettingsPage /> }) },
              { label: "Accessibilité", icon: "eye", onPress: () => push({ title: "Accessibilité", content: <AccessibilitySettingsPage /> }) },
            ]}
          />
          <SettingsSection
            title="Sécurité"
            items={[
              { label: "Confidentialité", icon: "shield", onPress: () => push({ title: "Confidentialité", content: <PrivacySettingsPage /> }) },
              { label: "Aide et assistance", icon: "life-buoy", onPress: () => push({ title: "Aide et assistance", content: <HelpSettingsPage /> }) },
              { label: "À propos", icon: "info", onPress: () => push({ title: "À propos", content: <AboutSettingsPage /> }) },
            ]}
          />
          {/* ── Subscription button ── */}
          <TouchableOpacity
            style={[styles.subscriptionBtn, { borderColor: colors.borderBrandSecondary }]}
            onPress={() => setShowSubscription(true)}
            activeOpacity={0.85}
          >
            <Image
              source={bgGradientOrange}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory"
            />
            <Icon name="key" size={20} color={colors.iconInverse} />
            <Text style={[styles.subscriptionText, { color: colors.textInverse }]}>
              Souscrire à un abonnement
            </Text>
          </TouchableOpacity>

          <SettingsSection
            items={[
              { label: "Se déconnecter", icon: "log-out", danger: true, onPress: () => setShowLogout(true) },
              { label: "Supprimer mon compte", icon: "trash", danger: true, onPress: () => setShowDeleteStep1(true) },
            ]}
          />
        </View>
      </ScrollView>

      {/* ── Subscription coming soon modal ── */}
      <BottomSheet visible={showSubscription} onClose={() => setShowSubscription(false)}>
        <View style={subscriptionModalSt.content}>
          <View style={subscriptionModalSt.textBlock}>
            <View style={[subscriptionModalSt.iconWrap, { backgroundColor: colors.brandTertiary }]}>
              <Icon name="key" size={28} color={colors.brand} />
            </View>
            <Text style={[subscriptionModalSt.title, { color: colors.text }]}>Bientôt disponible</Text>
            <Text style={[subscriptionModalSt.subtitle, { color: colors.textSecondary }]}>
              L'abonnement {APP_NAME} est en cours de développement. Tu seras notifié dès son lancement.
            </Text>
          </View>
          <TouchableOpacity
            style={[subscriptionModalSt.btn, { backgroundColor: colors.brand }]}
            onPress={() => setShowSubscription(false)}
            activeOpacity={0.8}
          >
            <Text style={[subscriptionModalSt.btnText, { color: colors.textBrandOnBrand }]}>OK, j'attends !</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Logout modal ── */}
      <ConfirmModal
        visible={showLogout}
        onClose={() => setShowLogout(false)}
        title="Te déconnecter ?"
        confirmLabel="Se déconnecter"
        cancelLabel="Annuler"
        confirmVariant="brand"
        onConfirm={handleLogout}
        loading={loggingOut}
      />

      {/* ── Delete account step 1 ── */}
      <ConfirmModal
        visible={showDeleteStep1}
        onClose={() => setShowDeleteStep1(false)}
        title="Supprimer le compte"
        element={<NamePill name={username} />}
        confirmLabel="Oui, supprimer"
        cancelLabel="Non, garder"
        confirmVariant="danger"
        onConfirm={() => {
          setShowDeleteStep1(false);
          setTimeout(() => setShowDeleteStep2(true), 350);
        }}
      />

      {/* ── Delete account step 2 ── */}
      <ConfirmModal
        visible={showDeleteStep2}
        onClose={() => setShowDeleteStep2(false)}
        title="Attention toute suppression est définitive"
        subtitle="L'ensemble de tes moments seront supprimées. Es-tu vraiment sûr ?"
        confirmLabel="Oui, supprimer définitivement"
        cancelLabel="Non, garder"
        confirmVariant="danger"
        onConfirm={handleDeleteAccount}
        loading={deletingAccount}
      />
    </>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

type ItemConfig = {
  label: string;
  icon: IconName;
  trailingText?: string;
  danger?: boolean;
  onPress: () => void;
};

type SectionProps = {
  title?: string;
  trailingButton?: { label: string; icon?: IconName; onPress: () => void };
  items: ItemConfig[];
};

function SettingsSection({ title, trailingButton, items }: SectionProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      {/* title row — rendered only when a title is provided */}
      {title != null && (
        <View style={styles.sectionList}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionTitleTextWrap}>
              <Text style={[styles.sectionTitleText, { color: colors.textSecondary }]}>{title}</Text>
            </View>
            {trailingButton && (
              <TouchableOpacity
                style={[styles.sectionTitleBtn, { backgroundColor: colors.bgNeutralTertiary }]}
                onPress={trailingButton.onPress}
                activeOpacity={0.7}
              >
                <Text style={[styles.sectionTitleBtnText, { color: colors.text }]}>{trailingButton.label}</Text>
                {trailingButton.icon && (
                  <Icon name={trailingButton.icon} size={16} color={colors.icon} />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* items list */}
      <View style={styles.itemsList}>
        {items.map((item, i) => {
          const iconColor = item.danger ? colors.iconDangerTertiary : colors.icon;
          const textColor = item.danger ? colors.textDangerTertiary : colors.text;
          return (
            <TouchableOpacity key={i} style={styles.item} onPress={item.onPress} activeOpacity={0.7}>
              <View style={styles.itemText}>
                <Icon name={item.icon} size={20} color={iconColor} />
                <Text style={[styles.itemLabel, { color: textColor }]}>{item.label}</Text>
              </View>
              <View style={styles.trailingItem}>
                {item.trailingText && (
                  <Text style={[styles.trailingText, { color: colors.textSecondary }]}>{item.trailingText}</Text>
                )}
                <View style={styles.iconBtn}>
                  <Icon name="chevron-right" size={20} color={iconColor} />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (_colors: ThemeColors) => StyleSheet.create({
  // ── Scrollable content container
  content: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xl3,             // space/1200 = 48px  (profile → body)
    marginHorizontal: spacing.lg, // 16px
    marginTop: spacing.xxl,       // 32px below header
  },

  // ── Profile link row
  profileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
  },
  profileInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,              // space/300 = 12px
  },
  avatar: {
    width: 80,
    height: 80,
    aspectRatio: 1,
    borderRadius: radii.xl,       // radius/600 = 24px
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    ...textStyles.subtitleStrong,
  },
  profileText: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs,              // space/100 = 4px
  },
  profileName: {
    ...textStyles.heading,
  },
  profilePhone: {
    ...textStyles.bodyBase,
  },
  iconBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },

  // ── Body
  body: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xxl,             // space/800 = 32px between sections
    alignSelf: "stretch",
    paddingBottom: spacing.xxl,   // space/800 = 32px under last section
  },

  // ── Section  (gap: space/300 = 12px sépare le titre des liens)
  section: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.md,              // space/300 = 12px  ← entre sectionList et itemsList
    alignSelf: "stretch",
  },

  // ── "list" — wrapper du titre (gap: space/050 = 2px pour éléments futurs)
  sectionList: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xxs,             // space/050 = 2px
    alignSelf: "stretch",
  },

  // ── Section title row
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,              // space/400 = 16px
    alignSelf: "stretch",
  },
  sectionTitleTextWrap: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
  },
  sectionTitleText: {
    ...textStyles.bodyStrong,
  },
  sectionTitleBtn: {
    flexDirection: "row",
    paddingVertical: spacing.xs,    // space/100 = 4px
    paddingHorizontal: spacing.xs2, // space/150 = 6px
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs2,               // space/150 = 6px
    borderRadius: radii.xs,
  },
  sectionTitleBtnText: {
    ...textStyles.singleLineBodySmallStrong,
  },

  // ── Subscription button
  subscriptionBtn: {
    flexDirection: "row",
    padding: spacing.md,          // space/300 = 12px
    alignItems: "center",
    gap: spacing.sm,              // space/200 = 8px
    alignSelf: "stretch",
    borderRadius: radii.md,       // radius/300 = 12px
    borderWidth: 1,
    overflow: "hidden",
  },
  subscriptionText: {
    ...textStyles.singleLineBodyBaseStrong,
  },

  // ── Items list
  itemsList: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs2,             // space/150 = 6px between items
    alignSelf: "stretch",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,              // space/400 = 16px
    alignSelf: "stretch",
  },
  itemText: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs2,             // space/150 = 6px
    flex: 1,
  },
  itemLabel: {
    ...textStyles.bodyBase,
  },
  trailingItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  trailingText: {
    ...textStyles.bodyBase,
  },
});

const subscriptionModalSt = StyleSheet.create({
  content: {
    flexDirection: "column",
    gap: spacing.xl3,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  textBlock: {
    flexDirection: "column",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...textStyles.subtitleStrong,
    textAlign: "center",
  },
  subtitle: {
    ...textStyles.bodyBase,
    textAlign: "center",
    lineHeight: 22,
  },
  btn: {
    alignSelf: "stretch",
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  btnText: {
    ...textStyles.singleLineSubheadingStrong,
    lineHeight: typography.size.xl + 4,
  },
});
