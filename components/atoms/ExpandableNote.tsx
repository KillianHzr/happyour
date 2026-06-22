import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { typography, type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";

interface ExpandableNoteProps {
  text: string;
  maxLines: number;
  onToggleExpand?: (expanded: boolean) => void;
  /** Dims the text to 0.5 opacity — used for the "Aucune description" placeholder. */
  faded?: boolean;
}

export const ExpandableNote = ({ text, maxLines, onToggleExpand, faded }: ExpandableNoteProps) => {
  const styles = useThemedStyles(makeStyles);
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  const handlePress = () => {
    if (isTruncated) {
      const nextExpanded = !expanded;
      setExpanded(nextExpanded);
      onToggleExpand?.(nextExpanded);
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
      <View style={{ height: 0, overflow: 'hidden' }}>
        <Text
          style={styles.momentNote}
          onTextLayout={(e) => setIsTruncated(e.nativeEvent.lines.length > maxLines)}
        >
          {text}
        </Text>
      </View>
      <Text style={[styles.momentNote, faded && { opacity: 0.5 }]} numberOfLines={expanded ? undefined : maxLines}>
        {text}
      </Text>
      {isTruncated && (
        <Text style={styles.noteExpand}>{expanded ? "voir moins" : "voir plus"}</Text>
      )}
    </TouchableOpacity>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  momentNote: {
    color: colors.text,
    fontFamily: typography.family.regular,
    fontSize: typography.size.md,
    lineHeight: typography.size.md * 1.4,
    letterSpacing: 0,
  },
  noteExpand: {
    color: colors.textSecondary,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xxs,
    lineHeight: typography.size.xxs * 1.4,
    letterSpacing: 0,
  },
});
