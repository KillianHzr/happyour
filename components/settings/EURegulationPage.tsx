import { ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedStyles } from "../../lib/theme-context";
import { spacing, type ThemeColors } from "../../lib/theme";
import {
  Section, P, BulletList, Card, CardTitle, CardText, CardRow,
} from "./LegalComponents";

export default function EURegulationPage() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      showsVerticalScrollIndicator={false}
    >
      <P>Dernière mise à jour : 09/06/2026. Ce document présente les mesures de conformité de Disclose au regard des réglementations européennes applicables.</P>

      <Section title="Règlement général sur la protection des données – RGPD">
        <P>Disclose traite des données personnelles conformément au Règlement (UE) 2016/679 (RGPD). Le responsable du traitement est Source Studio.</P>
        <BulletList
          intro="Vos droits en tant que résident(e) de l'UE :"
          items={[
            "Droit d'accès (art. 15) : obtenir une copie de vos données",
            "Droit de rectification (art. 16) : corriger des données inexactes",
            "Droit à l'effacement (art. 17) : \"droit à l'oubli\"",
            "Droit à la portabilité (art. 20) : recevoir vos données dans un format structuré",
            "Droit d'opposition (art. 21) : vous opposer à certains traitements",
            "Droit à la limitation (art. 18) : restreindre temporairement un traitement",
            "Droit de retrait du consentement : à tout moment, sans rétroactivité",
          ]}
        />
        <Card>
          <CardTitle>Pour exercer vos droits</CardTitle>
          <CardText>source.studio@etik.com</CardText>
        </Card>
        <P>Vous pouvez aussi déposer une réclamation auprès de la CNIL (www.cnil.fr).</P>
      </Section>

      <Section title="Digital services act (UE 2022/2065) – DSA">
        <BulletList
          intro="Disclose se qualifie de « petite plateforme » au sens du DSA (moins de 45 millions d'utilisateurs actifs mensuels dans l'UE). À ce titre, certaines obligations renforcées du DSA ne s'appliquent pas, mais Source Studio s'engage à respecter les obligations de base :"
          items={[
            "Fournir un point de contact unique pour les autorités (cf. coordonnées ci-dessous)",
            "Traiter les signalements de manière diligente et non arbitraire",
            "Informer les utilisateurs des décisions de modération",
            "Ne pas utiliser de dark patterns pour tromper les utilisateurs",
            "Protéger les mineurs contre les contenus inappropriés",
          ]}
        />
        <P>Pour signaler un contenu illicite, utilisez le formulaire disponible dans Profil → Paramètres → Aide et assistance → Problème</P>
      </Section>

      <Section title="Droits des consommateurs (Directives 2011/83/UE)">
        <BulletList
          intro="Disclose est une application gratuite. Aucun frais d'abonnement n'est prélevé sans consentement explicite préalable. En cas d'achat futur intégré à l'application :"
          items={[
            "Le prix total sera clairement affiché avant confirmation",
            "Un droit de rétractation de 14 jours s'applique pour les achats numériques non commencés",
            "Les conditions spécifiques seront communiquées au moment de l'achat",
          ]}
        />
      </Section>

      <Section title="Accessibilité (Directive UE 2019/882)">
        <BulletList
          intro="Disclose s'engage à améliorer progressivement l'accessibilité de son application conformément à la directive européenne sur l'accessibilité des produits et services numériques, applicable aux nouvelles applications à partir du 28 juin 2025 :"
          items={[
            "Compatibilité avec les lecteurs d'écran (VoiceOver / TalkBack)",
            "Contrastes de couleurs respectant les recommandations WCAG 2.1 AA",
            "Options de thème et d'accessibilité dans les paramètres",
            "Sous-titres à venir pour les contenus audio et vidéo",
          ]}
        />
      </Section>

      <Section title="Localisation des données">
        <BulletList
          intro="Vos données sont hébergées dans des infrastructures conformes au RGPD :"
          items={[
            "Supabase Inc. — serveurs en Europe (Frankfurt, Allemagne)",
            "Cloudflare Inc. — réseau mondial avec présence européenne",
            "Les transferts hors UE sont encadrés par des clauses contractuelles types (CCT) approuvées par la Commission européenne",
          ]}
        />
      </Section>

      <Section title="Cookies et traceurs">
        <P>L'application mobile Disclose n'utilise pas de cookies. Les identifiants techniques (tokens de session et tokens push) sont strictement nécessaires au fonctionnement du service et ne requièrent pas de consentement préalable au sens de la directive ePrivacy. Aucun cookie publicitaire, aucun traceur de navigation, aucun partage de données à des fins de ciblage publicitaire.</P>
      </Section>

      <Section title="Contact et autorité compétente">
        <P>Pour toute question relative à la conformité réglementaire de Disclose :</P>
        <Card>
          <CardRow label="Société" value="Source Studio" />
          <CardRow label="Adresse" value="Annecy, France" />
          <CardRow label="E-mail" value="source.studio@etik.com" />
        </Card>
        <BulletList
          intro="Autorité de contrôle compétente pour la France :"
          items={[
            "CNIL — Commission Nationale de l'Informatique et des Libertés",
            "3 Place de Fontenoy, 75007 Paris",
            "www.cnil.fr, 01 53 73 22 22",
          ]}
        />
        <P>Plateforme européenne de règlement en ligne des litiges (RLL) : ec.europa.eu/consumers/odr</P>
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
