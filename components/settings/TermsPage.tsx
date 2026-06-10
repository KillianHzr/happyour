import { ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemedStyles } from "../../lib/theme-context";
import { spacing, type ThemeColors } from "../../lib/theme";
import {
  APP_NAME, COMPANY_NAME, COMPANY_EMAIL, MIN_AGE,
  Section, P, BulletList, Highlight, ContactCard,
} from "./LegalComponents";

const LAST_UPDATED = "09/06/2026";

export default function TermsPage() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      showsVerticalScrollIndicator={false}
    >
      <P>{`Dernière mise à jour : ${LAST_UPDATED}. En utilisant ${APP_NAME}, vous acceptez les présentes conditions. Veuillez les lire attentivement.`}</P>

      <Section title="1. Description du service">
        <P>{`${APP_NAME} est une application mobile de partage de moments en groupe. Les utilisateurs capturent des photos, vidéos, dessins et messages audio au fil de la semaine ; le contenu est révélé collectivement lors d'un événement hebdomadaire (le « Reveal »).`}</P>
        <P>{`${APP_NAME} est édité par ${COMPANY_NAME}.`}</P>
      </Section>

      <Section title="2. Conditions d'accès">
        <BulletList items={[
          `Avoir au moins ${MIN_AGE} ans`,
          "Disposer d'une adresse e-mail valide",
          "Créer un compte individuel et personnel",
          "Ne pas créer de compte pour le compte d'une autre personne sans son consentement",
        ]} />
        <Highlight>
          {`En créant un compte, vous déclarez avoir au moins ${MIN_AGE} ans et accepter ces conditions.`}
        </Highlight>
      </Section>

      <Section title="3. Votre compte">
        <P>Vous êtes seul responsable :</P>
        <BulletList items={[
          "De la confidentialité de vos identifiants de connexion",
          "De toutes les actions effectuées depuis votre compte",
          "De l'exactitude des informations de votre profil",
        ]} />
        <P>{`En cas de perte ou d'accès non autorisé, contactez-nous immédiatement à ${COMPANY_EMAIL}.`}</P>
      </Section>

      <Section title="4. Contenu partagé">
        <P>{`Vous conservez l'intégralité des droits sur le contenu que vous publiez. En le partageant, vous accordez à ${APP_NAME} une licence limitée, non exclusive et révocable pour :`}</P>
        <BulletList items={[
          "Afficher votre contenu aux membres de votre groupe",
          "Le stocker sur nos serveurs sécurisés",
          "Le transmettre dans le cadre du fonctionnement du Reveal",
        ]} />
        <P>Cette licence prend fin à la suppression du contenu ou du compte.</P>
      </Section>

      <Section title="5. Contenu interdit">
        <P>Il est strictement interdit de publier :</P>
        <BulletList items={[
          "Du contenu illégal, diffamatoire, haineux ou discriminatoire",
          "Du contenu sexuellement explicite ou violent",
          "Des données personnelles de tiers sans leur consentement",
          "Du contenu portant atteinte aux droits de propriété intellectuelle",
          "Des spams, publicités ou contenus à caractère commercial non autorisé",
          "Tout contenu impliquant des mineurs à caractère sexuel",
        ]} />
        <Highlight>
          {`Tout contenu en violation de ces règles peut être supprimé sans préavis. Le compte peut être suspendu ou supprimé.`}
        </Highlight>
      </Section>

      <Section title="6. Comportements interdits">
        <P>Sont également interdits :</P>
        <BulletList items={[
          "Le harcèlement, l'intimidation ou toute forme d'abus envers d'autres utilisateurs",
          "La tentative de contournement des mesures de sécurité",
          "L'ingénierie inverse, le décompilage ou l'extraction du code de l'application",
          "L'utilisation de bots ou de scripts automatisés",
          "La création de plusieurs comptes pour contourner une suspension",
        ]} />
      </Section>

      <Section title="7. Disponibilité du service">
        <P>{`${APP_NAME} s'efforce d'assurer la disponibilité continue du service, mais ne peut garantir :`}</P>
        <BulletList items={[
          "Une disponibilité sans interruption (maintenance, incidents techniques)",
          "L'absence d'erreurs ou de bugs",
          "La conservation indéfinie des données en cas de cessation d'activité",
        ]} />
        <P>Nous vous notifierons dans l'application ou par e-mail en cas d'interruption planifiée significative.</P>
      </Section>

      <Section title="8. Propriété intellectuelle">
        <P>{`L'application ${APP_NAME}, son design, son logo, ses fonctionnalités et son code source sont la propriété exclusive de ${COMPANY_NAME} et protégés par le droit de la propriété intellectuelle.`}</P>
        <P>Toute reproduction, modification ou distribution sans autorisation écrite préalable est interdite.</P>
      </Section>

      <Section title="9. Résiliation">
        <P>Vous pouvez supprimer votre compte à tout moment depuis les paramètres de l'application.</P>
        <P>{`${COMPANY_NAME} se réserve le droit de suspendre ou supprimer tout compte en cas de violation des présentes conditions, sans préavis ni remboursement.`}</P>
      </Section>

      <Section title="10. Limitation de responsabilité">
        <P>{`Dans les limites autorisées par la loi, ${COMPANY_NAME} ne saurait être tenu responsable des dommages indirects, accessoires ou consécutifs résultant de l'utilisation ou de l'impossibilité d'utiliser le service.`}</P>
        <P>Le service est fourni « tel quel », sans garantie d'adéquation à un usage particulier.</P>
      </Section>

      <Section title="11. Droit applicable">
        <P>Les présentes conditions sont régies par le droit français.</P>
        <P>{`En cas de litige, et à défaut de résolution amiable, les tribunaux compétents du ressort du siège social de ${COMPANY_NAME} seront seuls compétents.`}</P>
        <P>Les consommateurs résidant dans l'UE peuvent recourir à la plateforme européenne de règlement en ligne des litiges (ec.europa.eu/consumers/odr).</P>
      </Section>

      <Section title="12. Contact">
        <P>Pour toute question relative à ces conditions :</P>
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
