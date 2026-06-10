import { ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedStyles } from "../../lib/theme-context";
import { spacing, type ThemeColors } from "../../lib/theme";
import {
  APP_NAME, MIN_AGE, COMPANY_EMAIL,
  Section, P, BulletList, Highlight, ContactCard,
} from "./LegalComponents";

const LAST_UPDATED = "09/06/2026";

export default function PrivacySettingsPage() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      showsVerticalScrollIndicator={false}
    >
      <P>{`Mise à jour le ${LAST_UPDATED}. Ce document explique comment ${APP_NAME} traite vos données personnelles.`}</P>

      <Section title="Responsable du traitement">
        <P>Le responsable du traitement des données est :</P>
        <ContactCard />
      </Section>

      <Section title="Données collectées">
        <P>Uniquement les données nécessaires au service :</P>
        <BulletList items={[
          "Compte : e-mail, pseudo, photo de profil",
          "E-mail de récupération (optionnel)",
          "Contenu publié : photos, vidéos, dessins, audio, textes",
          "Métadonnées : date/heure de publication, groupe",
          "Interactions : réactions, commentaires",
          "Préférences : thème, langue, notifications",
          "Technique : token push, identifiant de session",
        ]} />
        <Highlight>
          {`Aucune donnée de localisation ni identifiant publicitaire. Aucun profilage commercial.`}
        </Highlight>
      </Section>

      <Section title="Utilisation de vos données">
        <P>Vos données servent exclusivement à :</P>
        <BulletList items={[
          "Gérer votre compte et authentification",
          "Faire fonctionner les groupes, reveals et archives",
          "Afficher réactions et commentaires dans vos groupes",
          "Envoyer des notifications push liées à votre activité",
          "Personnaliser votre expérience (thème, langue, rappels)",
          "Assurer la sécurité et prévenir les abus",
        ]} />
        <P>{`Bases légales (RGPD) : exécution du contrat (art. 6.1.b) ; intérêt légitime (art. 6.1.f) pour la sécurité ; consentement (art. 6.1.a) pour les notifications.`}</P>
      </Section>

      <Section title="Partage des données">
        <Highlight>
          {`Vos données ne sont jamais vendues. Votre contenu est visible uniquement des membres de votre groupe.`}
        </Highlight>
        <P>Sous-traitants techniques :</P>
        <BulletList items={[
          "Supabase Inc. — base de données et authentification",
          "Cloudflare Inc. — stockage des fichiers médias (R2)",
          "Expo Inc. — infrastructure de notifications push",
        ]} />
        <P>Ces prestataires agissent sur nos instructions dans le respect du RGPD.</P>
      </Section>

      <Section title="Conservation des données">
        <BulletList items={[
          "Données actives : conservées pendant toute la durée de votre compte",
          "Suppression de compte : toutes vos données effacées sous 30 jours",
          "Archives de reveals : disponibles tant que votre compte est actif",
          "Tokens de session et push : supprimés à la déconnexion",
        ]} />
      </Section>

      <Section title="Sécurité">
        <BulletList items={[
          "Chiffrement de toutes les communications (HTTPS/TLS)",
          "Accès aux médias contrôlé au niveau du groupe",
          "Authentification sécurisée via Supabase Auth",
          "Row Level Security sur toutes les tables",
        ]} />
      </Section>

      <Section title="Vos droits (RGPD)">
        <BulletList items={[
          "Accès : obtenir une copie de vos données",
          "Rectification : corriger des informations inexactes",
          "Effacement : supprimer votre compte et toutes vos données",
          "Portabilité : recevoir vos données dans un format standard",
          "Opposition : vous opposer aux traitements fondés sur l'intérêt légitime",
          "Retrait du consentement : désactiver les notifications depuis les paramètres",
        ]} />
        <Highlight>
          {`Pour exercer vos droits : ${COMPANY_EMAIL}\n\nVous pouvez aussi déposer une réclamation auprès de la CNIL (www.cnil.fr).`}
        </Highlight>
      </Section>

      <Section title="Mineurs">
        <P>{`${APP_NAME} est réservé aux personnes de ${MIN_AGE} ans ou plus. Si un mineur de moins de ${MIN_AGE} ans a créé un compte, contactez-nous pour que ses données soient supprimées.`}</P>
      </Section>

      <Section title="Évolution de cette politique">
        <P>{`Nous pouvons mettre à jour cette politique à tout moment. En cas de modification substantielle, vous serez notifié dans l'application ou par e-mail. La poursuite de l'utilisation vaut acceptation.`}</P>
      </Section>

      <Section title="Contact">
        <P>Pour toute question relative à vos données personnelles :</P>
        <ContactCard />
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
});
