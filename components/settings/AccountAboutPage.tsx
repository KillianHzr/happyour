import { ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedStyles } from "../../lib/theme-context";
import { spacing, type ThemeColors } from "../../lib/theme";
import { useAuth } from "../../lib/auth-context";
import {
  APP_NAME,
  Section, P, BulletList, Card, CardText, CardRow,
} from "./LegalComponents";

const formatDate = (raw?: string | null) => {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export default function AccountAboutPage() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Carte compte ── */}
      <Card>
        <CardRow label="Compte" value={user?.email ?? "—"} />
        <CardRow label="Inscrit" value={formatDate(user?.created_at)} />
      </Card>

      <Section title="Ce que contient votre compte">
        <BulletList
          intro={`Votre compte ${APP_NAME} regroupe :`}
          items={[
            "Vos informations de profil (pseudo, photo, e-mail)",
            "L'ensemble des moments que vous avez partagés dans vos groupes",
            "Vos réactions et commentaires sur les moments des autres",
            "Vos préférences (thème, langue, notifications)",
            "L'historique de vos reveals",
          ]}
        />
      </Section>

      <Section title="Sécurité de votre compte">
        <BulletList items={[
          "Votre mot de passe est chiffré — nous n'y avons jamais accès",
          "Chaque session est identifiée par un token unique et sécurisé",
          "La déconnexion invalide immédiatement votre session",
          "Vous pouvez ajouter un e-mail de récupération dans les paramètres",
        ]} />
        <Card>
          <CardText>En cas d'accès non autorisé suspecté, changez immédiatement votre mot de passe et contactez-nous.</CardText>
        </Card>
      </Section>

      <Section title="Accéder à vos données">
        <BulletList
          intro="Vous pouvez à tout moment :"
          items={[
            "Consulter et modifier votre profil dans les paramètres",
            "Supprimer un moment publié depuis l'écran de reveal",
            "Demander une copie complète de vos données par e-mail",
            "Supprimer définitivement votre compte depuis les paramètres",
          ]}
        />
        <P>Pour toute demande d'export ou question sur vos données :</P>
        <Card>
          <CardRow label="Société" value="Source Studio" />
          <CardRow label="Adresse" value="Annecy, France" />
          <CardRow label="E-mail" value="source.studio@etik.com" />
        </Card>
      </Section>

      <Section title="Suppression du compte">
        <P>La suppression de votre compte est définitive et irréversible.</P>
        <BulletList items={[
          "Votre profil et pseudo sont supprimés immédiatement",
          "Vos moments, réactions et commentaires sont effacés sous 30 jours",
          "Les membres de vos groupes ne verront plus votre contenu",
          "Vos données ne sont pas récupérables après suppression",
        ]} />
        <P>Vous pouvez supprimer votre compte depuis : Profil → Paramètres → Supprimer mon compte</P>
      </Section>

      <Section title="Besoin d'aide">
        <P>Pour toute question sur votre compte ou vos données, contactez l'équipe Disclose :</P>
        <Card>
          <CardRow label="Société" value="Source Studio" />
          <CardRow label="Adresse" value="Annecy, France" />
          <CardRow label="E-mail" value="source.studio@etik.com" />
        </Card>
        <P>Vous pouvez aussi utiliser le formulaire dans : Profil → Paramètres → Aide et assistance</P>
      </Section>
    </ScrollView>
  );
}

const makeStyles = (_colors: ThemeColors) => StyleSheet.create({
  content: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xl2,             // space/1000 = 40px
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
  },
});
