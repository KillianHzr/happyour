import { ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedStyles } from "../../lib/theme-context";
import { spacing, type ThemeColors } from "../../lib/theme";
import {
  Section, P, BulletList, Card, CardTitle, CardText, CardRow,
  COMPANY_NAME, COMPANY_ADDRESS, COMPANY_EMAIL,
} from "./LegalComponents";

export default function PrivacySettingsPage() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      showsVerticalScrollIndicator={false}
      alwaysBounceVertical={false}
    >
      {/* 1. */}
      <P>Mise à jour le 09/06/2026. Ce document explique comment Disclose traite vos données personnelles.</P>

      {/* 2. Responsable du traitement */}
      <Section title="Responsable du traitement">
        <P>Le responsable du traitement des données est :</P>
        <Card>
          <CardRow label="Société" value={COMPANY_NAME} />
          <CardRow label="Adresse" value={COMPANY_ADDRESS} />
          <CardRow label="E-mail" value={COMPANY_EMAIL} />
        </Card>
      </Section>

      {/* 3. Données collectées */}
      <Section title="Données collectées">
        <BulletList
          intro="Uniquement les données nécessaires au service :"
          items={[
            "Compte : e-mail, pseudo, photo de profil",
            "E-mail de récupération (optionnel)",
            "Contenu publié : photos, vidéos, dessins, audio, textes",
            "Métadonnées : date/heure de publication, groupe",
            "Interactions : réactions, commentaires",
            "Préférences : thème, langue, notifications",
            "Technique : token push, identifiant de session",
          ]}
        />
        <Card>
          <CardText>Aucune donnée de localisation ni identifiant publicitaire. Aucun profilage commercial.</CardText>
        </Card>
      </Section>

      {/* 4. Utilisation de vos données */}
      <Section title="Utilisation de vos données">
        <BulletList
          intro="Vos données servent exclusivement à :"
          items={[
            "Gérer votre compte et authentification",
            "Faire fonctionner les groupes, reveals et archives",
            "Afficher réactions et commentaires dans vos groupes",
            "Envoyer des notifications push liées à votre activité",
            "Personnaliser votre expérience (thème, langue, rappels)",
            "Assurer la sécurité et prévenir les abus",
          ]}
        />
        <P>Bases légales (RGPD) : exécution du contrat (art. 6.1.b) ; intérêt légitime (art. 6.1.f) pour la sécurité ; consentement (art. 6.1.a) pour les notifications.</P>
      </Section>

      {/* 5. Partage des données */}
      <Section title="Partage des données">
        <Card>
          <CardText>Vos données ne sont jamais vendues. Votre contenu est visible uniquement des membres de votre groupe.</CardText>
        </Card>
        <BulletList
          intro="Sous-traitants techniques :"
          items={[
            "Supabase Inc., base de données et authentification",
            "Cloudflare Inc., stockage des fichiers médias (R2)",
            "Expo Inc., infrastructure de notifications push",
          ]}
        />
        <P>Ces prestataires agissent sur nos instructions dans le respect du RGPD.</P>
      </Section>

      {/* 6. Conservation des données */}
      <Section title="Conservation des données">
        <BulletList items={[
          "Données actives : conservées pendant toute la durée de votre compte",
          "Suppression de compte : toutes vos données effacées sous 30 jours",
          "Archives de reveals : disponibles tant que votre compte est actif",
          "Tokens de session et push : supprimés à la déconnexion",
        ]} />
      </Section>

      {/* 7. Sécurité */}
      <Section title="Sécurité">
        <BulletList items={[
          "Chiffrement de toutes les communications (HTTPS/TLS)",
          "Accès aux médias contrôlé au niveau du groupe",
          "Authentification sécurisée via Supabase Auth",
          "Row Level Security sur toutes les tables",
        ]} />
      </Section>

      {/* 8. Vos droits (RGPD) */}
      <Section title="Vos droits (RGPD)">
        <BulletList items={[
          "Accès : obtenir une copie de vos données",
          "Rectification : corriger des informations inexactes",
          "Effacement : supprimer votre compte et toutes vos données",
          "Portabilité : recevoir vos données dans un format standard",
          "Opposition : vous opposer aux traitements fondés sur l'intérêt légitime",
          "Retrait du consentement : désactiver les notifications depuis les paramètres",
        ]} />
        <Card>
          <CardTitle>Pour exercer vos droits</CardTitle>
          <CardText>{COMPANY_EMAIL}</CardText>
        </Card>
        <P>Vous pouvez aussi déposer une réclamation auprès de la CNIL (www.cnil.fr).</P>
      </Section>

      {/* 9. Mineurs */}
      <Section title="Mineurs">
        <P>Disclose est réservé aux personnes de 16 ans ou plus. Si un mineur de moins de 16 ans a créé un compte, contactez-nous pour que ses données soient supprimées.</P>
      </Section>

      {/* 10. Évolution de cette politique */}
      <Section title="Évolution de cette politique">
        <P>Nous pouvons mettre à jour cette politique à tout moment. En cas de modification substantielle, vous serez notifié dans l'application ou par e-mail. La poursuite de l'utilisation vaut acceptation.</P>
      </Section>

      {/* 11. Contact */}
      <Section title="Contact">
        <P>Pour toute question relative à vos données personnelles :</P>
        <Card>
          <CardRow label="Société" value={COMPANY_NAME} />
          <CardRow label="Adresse" value={COMPANY_ADDRESS} />
          <CardRow label="E-mail" value={COMPANY_EMAIL} />
        </Card>
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
