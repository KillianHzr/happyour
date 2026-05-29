import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { typography, type ThemeColors } from "../../lib/theme";
import { useThemedStyles } from "../../lib/theme-context";

interface ExpandableNoteProps {
  text: string;
  maxLines: number;
}

export const ExpandableNote = ({ text, maxLines }: ExpandableNoteProps) => {
  const styles = useThemedStyles(makeStyles);
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  return (
    <TouchableOpacity onPress={() => isTruncated && setExpanded(v => !v)} activeOpacity={0.8}>
      <View style={{ height: 0, overflow: 'hidden' }}>
        <Text
          style={styles.momentNote}
          onTextLayout={(e) => setIsTruncated(e.nativeEvent.lines.length > maxLines)}
        >
          {text}
        </Text>
      </View>
      <Text style={styles.momentNote} numberOfLines={expanded ? undefined : maxLines}>
        {text}
      </Text>
      {!expanded && isTruncated && (
        <Text style={styles.noteExpand}>voir plus</Text>
      )}
    </TouchableOpacity>
  );
};

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  momentNote: {
    color: colors.text,
    fontFamily: typography.family.regular,
    fontSize: typography.size.xs,
    marginTop: 3
  },
  noteExpand: {
    color: colors.textSecondary,
    fontFamily: typography.family.semibold,
    fontSize: typography.size.xs,
    marginTop: 2
  },
});
