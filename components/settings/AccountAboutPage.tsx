import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import { spacing, textStyles, type ThemeColors } from "../../lib/theme";
import { useAuth } from "../../lib/auth-context";
import {
  APP_NAME, COMPANY_EMAIL,
  Section, P, BulletList, Highlight, ContactCard,
} from "./LegalComponents";

export default function AccountAboutPage() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Compte actif ── */}
      {user && (
        <View style={[styles.accountCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.accountRow}>
            <Text style={[styles.accountLabel, { color: colors.textSecondary }]}>Compte</Text>
            <Text style={[styles.accountValue, { color: colors.text }]}>{user.email}</Text>
          </View>
          <View style={[styles.accountDivider, { backgroundColor: colors.cardBorder }]} />
          <View style={styles.accountRow}>
            <Text style={[styles.accountLabel, { color: colors.textSecondary }]}>Inscrit le</Text>
            <Text style={[styles.accountValue, { color: colors.text }]}>
              {user.created_at ? new Date(user.created_at).toLocaleDateString("fr-FR") : "—"}
            </Text>
          </View>
        </View>
      )}

      <Section title="Ce que contient votre compte">
        <P>{`Votre compte ${APP_NAME} regroupe :`}</P>
        <BulletList items={[
          "Vos informations de profil (pseudo, photo, e-mail)",
          "L'ensemble des moments que vous avez partagés dans vos groupes",
          "Vos réactions et commentaires sur les moments des autres",
          "Vos préférences (thème, langue, notifications)",
          "L'historique de vos reveals",
        ]} />
      </Section>

      <Section title="Sécurité de votre compte">
        <BulletList items={[
          "Votre mot de passe est chiffré — nous n'y avons jamais accès",
          "Chaque session est identifiée par un token unique et sécurisé",
          "La déconnexion invalide immédiatement votre session",
          "Vous pouvez ajouter un e-mail de récupération dans les paramètres",
        ]} />
        <Highlight>
          {`En cas d'accès non autorisé suspecté, changez immédiatement votre mot de passe et contactez-nous.`}
        </Highlight>
      </Section>

      <Section title="Accéder à vos données">
        <P>Vous pouvez à tout moment :</P>
        <BulletList items={[
          "Consulter et modifier votre profil dans les paramètres",
          "Supprimer un moment publié depuis l'écran de reveal",
          "Demander une copie complète de vos données par e-mail",
          "Supprimer définitivement votre compte depuis les paramètres",
        ]} />
        <P>Pour toute demande d'export ou question sur vos données :</P>
        <ContactCard />
      </Section>

      <Section title="Suppression du compte">
        <P>La suppression de votre compte est définitive et irréversible.</P>
        <BulletList items={[
          "Votre profil et pseudo sont supprimés immédiatement",
          "Vos moments, réactions et commentaires sont effacés sous 30 jours",
          "Les membres de vos groupes ne verront plus votre contenu",
          "Vos données ne sont pas récupérables après suppression",
        ]} />
        <Highlight>
          {`Vous pouvez supprimer votre compte depuis Paramètres → Se déconnecter → Supprimer mon compte.`}
        </Highlight>
      </Section>

      <Section title="Besoin d'aide ?">
        <P>{`Pour toute question sur votre compte ou vos données, contactez l'équipe ${APP_NAME} :`}</P>
        <ContactCard />
        <P>{`Vous pouvez aussi utiliser le formulaire dans Paramètres → Aide et assistance.`}</P>
      </Section>
    </ScrollView>
  );
}

const makeStyles = (_colors: ThemeColors) => StyleSheet.create({
  content: {
    flexDirection: "column",
    gap: spacing.xxl,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
  },
  accountCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  accountDivider: {
    height: 1,
  },
  accountLabel: {
    ...textStyles.bodyExtraSmall,
    flexShrink: 0,
  },
  accountValue: {
    ...textStyles.bodyBase,
    flex: 1,
    textAlign: "right",
  },
});
