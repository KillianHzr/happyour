import { ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedStyles } from "../../lib/theme-context";
import { spacing, type ThemeColors } from "../../lib/theme";
import {
  Section, P, BulletList, Card, CardText, CardRow,
} from "./LegalComponents";

export default function TermsPage() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      showsVerticalScrollIndicator={false}
    >
      <P>Dernière mise à jour : 09/06/2026. En utilisant Disclose, vous acceptez les présentes conditions. Veuillez les lire attentivement.</P>

      <Section title="Description du service">
        <P>Disclose est une application mobile de partage de moments en groupe. Les utilisateurs y partagent photos, vidéos, dessins et messages audio au fil de la semaine ; le contenu est révélé collectivement lors d'un événement hebdomadaire (le "Reveal"). Disclose est édité par Source Studio.</P>
      </Section>

      <Section title="Conditions d'accès">
        <BulletList items={[
          "Avoir au moins 16 ans",
          "Disposer d'une adresse e-mail valide",
          "Créer un compte individuel à caractère personnel",
          "Ne pas créer de compte pour le compte d'une autre personne sans son consentement",
        ]} />
        <Card>
          <CardText>En créant un compte, vous déclarez avoir au moins 16 ans et accepter ces conditions.</CardText>
        </Card>
      </Section>

      <Section title="Votre compte">
        <BulletList
          intro="Vous êtes seul responsable :"
          items={[
            "De la confidentialité de vos identifiants de connexion",
            "De toutes les actions effectuées depuis votre compte",
            "De l'exactitude des informations de votre profil",
          ]}
        />
        <Card>
          <CardText>En cas de perte ou d'accès non autorisé, contactez-nous immédiatement à : source.studio@etik.com</CardText>
        </Card>
      </Section>

      <Section title="Contenu partagé">
        <BulletList
          intro="Vous conservez l'intégralité des droits sur le contenu que vous publiez. En le partageant, vous accordez à Disclose une licence limitée, non exclusive et révocable pour :"
          items={[
            "Afficher votre contenu aux membres de votre groupe",
            "Le stocker sur nos serveurs sécurisés",
            "Le transmettre dans le cadre du fonctionnement du Reveal",
          ]}
        />
        <P>Cette licence prend fin à la suppression du contenu ou du compte.</P>
      </Section>

      <Section title="Contenus interdits">
        <BulletList
          intro="Il est strictement interdit de publier :"
          items={[
            "Du contenu illégal, diffamatoire, haineux ou discriminatoire",
            "Du contenu sexuellement explicite ou violent",
            "Des données personnelles de tiers sans leur consentement",
            "Du contenu portant atteinte aux droits de propriété intellectuelle",
            "Des spams, publicités ou contenus à caractère commercial non autorisé",
            "Tout contenu impliquant des mineurs à caractère sexuel",
          ]}
        />
        <Card>
          <CardText>Tout contenu en violation de ces règles peut être supprimé sans préavis. Le compte peut être suspendu ou supprimé.</CardText>
        </Card>
      </Section>

      <Section title="Comportements interdits">
        <BulletList
          intro="Sont également interdits :"
          items={[
            "Le harcèlement, l'intimidation ou toute forme d'abus envers d'autres utilisateurs",
            "La tentative de contournement des mesures de sécurité",
            "L'ingénierie inverse, le décompilage ou l'extraction du code de l'application",
            "L'utilisation de bots ou de scripts automatisés",
            "La création de plusieurs comptes pour contourner une suspension",
          ]}
        />
      </Section>

      <Section title="Disponibilité service">
        <BulletList
          intro="Disclose s'efforce d'assurer la disponibilité continue du service, mais ne peut garantir :"
          items={[
            "Une disponibilité sans interruption (maintenance, incidents techniques)",
            "L'absence d'erreurs ou de bugs",
            "La conservation indéfinie des données en cas de cessation d'activité",
          ]}
        />
        <P>Nous vous notifierons dans l'application ou par e-mail en cas d'interruption planifiée significative.</P>
      </Section>

      <Section title="Propriété intellectuelle">
        <P>L'application Disclose, son design, son logo, son fonctionnement et son code source sont la propriété exclusive de Source Studio et protégés par le droit de la propriété intellectuelle. Toute reproduction, modification ou distribution sans autorisation écrite préalable est interdite.</P>
      </Section>

      <Section title="Résiliation">
        <P>Vous pouvez supprimer votre compte à tout moment depuis les paramètres de l'application. Source Studio se réserve le droit de suspendre ou supprimer tout compte en cas de violation des présentes conditions, sans préavis ni remboursement.</P>
      </Section>

      <Section title="Limitation de responsabilité">
        <P>Dans les limites autorisées par la loi, Source Studio ne saurait être tenu responsable des dommages indirects ou consécutifs résultant de l'utilisation ou de l'impossibilité d'utiliser le service. Le service est fourni "tel quel", sans garantie d'adéquation à un usage particulier.</P>
      </Section>

      <Section title="Droit applicable">
        <P>Les présentes conditions sont régies par le droit français. En cas de litige, et à défaut de résolution amiable, les juridictions compétentes du ressort du siège social de Source Studio seront seuls compétents. Les consommateurs résidant dans l'UE peuvent recourir à la plateforme européenne de règlement en ligne des litiges (ec.europa.eu/consumers/odr).</P>
      </Section>

      <Section title="Contact">
        <P>Pour toute question relative à ces conditions :</P>
        <Card>
          <CardRow label="Société" value="Source Studio" />
          <CardRow label="Adresse" value="Annecy, France" />
          <CardRow label="E-mail" value="source.studio@etik.com" />
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
