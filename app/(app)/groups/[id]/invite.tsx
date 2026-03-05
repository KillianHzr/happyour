import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../../lib/auth-context";
import { supabase } from "../../../../lib/supabase";
import { notifyGroupInvite } from "../../../../lib/notifications";
import { colors, theme } from "../../../../lib/theme";

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleInvite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return Alert.alert("Erreur", "Entre une adresse email.");
    if (!user) return;
    setLoading(true);

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", trimmed)
        .single();

      if (profile) {
        const { data: existing } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", id)
          .eq("user_id", profile.id)
          .single();

        if (existing) {
          Alert.alert("Info", "Cette personne est déjà dans le groupe.");
          return;
        }

        const { error } = await supabase
          .from("group_members")
          .insert({ group_id: id, user_id: profile.id });

        if (error) throw error;

        try {
          const { data: group } = await supabase
            .from("groups")
            .select("name")
            .eq("id", id)
            .single();
          if (group?.name) {
            await notifyGroupInvite(profile.id, group.name);
          }
        } catch {}

        Alert.alert("Ajouté !", `${trimmed} a été ajouté au groupe.`);
        setEmail("");
      } else {
        await supabase
          .from("invitations")
          .upsert({ group_id: id, email: trimmed, invited_by: user.id });

        const subject = encodeURIComponent("Rejoins-moi sur HappyOur !");
        const body = encodeURIComponent(
          `Hey ! Je t'invite à rejoindre mon groupe sur HappyOur.\n\n` +
          `Télécharge l'app et inscris-toi avec cette adresse (${trimmed}) pour rejoindre le groupe automatiquement.\n\n` +
          `À bientôt !`
        );

        const mailUrl = `mailto:${trimmed}?subject=${subject}&body=${body}`;
        const canOpen = await Linking.canOpenURL(mailUrl);

        if (canOpen) {
          await Linking.openURL(mailUrl);
        }

        Alert.alert(
          "Invitation envoyée",
          `${trimmed} n'a pas encore de compte. Un email d'invitation a été préparé.`
        );
        setEmail("");
      }
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inviter un membre</Text>
      <Text style={styles.subtitle}>
        Si la personne a déjà un compte, elle sera ajoutée directement.
        Sinon, elle recevra un email d'invitation.
      </Text>

      <TextInput
        style={[theme.glassInput, styles.input]}
        placeholder="Adresse email"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TouchableOpacity style={theme.accentButton} onPress={handleInvite} disabled={loading}>
        <Text style={theme.accentButtonText}>{loading ? "Envoi..." : "Inviter"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 32, paddingTop: 80, backgroundColor: colors.bg },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, marginBottom: 8, color: colors.text },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 14, color: colors.secondary, marginBottom: 24, lineHeight: 20 },
  input: { marginBottom: 16 },
});
