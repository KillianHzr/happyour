import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { supabase } from "../../lib/supabase";
import { radii, spacing, textStyles, type ThemeColors } from "../../lib/theme";
import { useTheme, useThemedStyles } from "../../lib/theme-context";
import Icon from "../../components/Icon";
import {
  OnboardingSlideLayout,
  OnboardingStickerText,
  OnboardingButton,
} from "../../components/onboarding/OnboardingKit";

const APP_URL = "disclose-app.com";

export default function OnboardingGroupInviteScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { groupId, groupName } = useLocalSearchParams<{ groupId: string; groupName: string }>();

  const [inviteCode, setInviteCode] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!groupId) return;
    supabase.from("groups").select("invite_code").eq("id", groupId).single().then(({ data }) => {
      if (data?.invite_code) setInviteCode(data.invite_code);
    });
  }, [groupId]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const doCopy = async (value: string, which: "code" | "link") => {
    await Clipboard.setStringAsync(value);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setCopied(which);
    copyTimer.current = setTimeout(() => setCopied(null), 2000);
  };

  const renderCopyRow = (value: string, which: "code" | "link") => (
    <TouchableOpacity style={styles.copyRow} activeOpacity={0.8} onPress={() => doCopy(value, which)}>
      <Text style={styles.copyValue} numberOfLines={1}>{value}</Text>
      <View style={styles.copyBtn} pointerEvents="none">
        <Icon name={copied === which ? "check" : "copy"} size={20} color={colors.iconNeutral} />
      </View>
    </TouchableOpacity>
  );

  return (
    <OnboardingSlideLayout
      top={
        <>
          <OnboardingStickerText text="Invite tes [proches]" />
          <View style={styles.copyList}>
            {renderCopyRow(inviteCode, "code")}
            {renderCopyRow(APP_URL, "link")}
          </View>
        </>
      }
      footer={
        <OnboardingButton
          label="Suivant"
          onPress={() => router.replace({ pathname: "/(onboarding)/notifications", params: { groupId, groupName } })}
          active
        />
      }
    />
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    copyList: {
      flexDirection: "column",
      alignItems: "flex-start",
      gap: spacing.md,        // space/300
      alignSelf: "stretch",
      marginTop: spacing.xl3, // space/1200 sous le texte
    },
    copyRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      alignSelf: "stretch",
    },
    copyValue: {
      ...textStyles.bodyStrong,
      color: colors.text,
      flex: 1,
    },
    copyBtn: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.card,
    },
  });
