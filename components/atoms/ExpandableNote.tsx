import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface ExpandableNoteProps {
  text: string;
  maxLines: number;
}

export const ExpandableNote = ({ text, maxLines }: ExpandableNoteProps) => {
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

const styles = StyleSheet.create({
  momentNote: { 
    color: "rgba(255,255,255,0.75)", 
    fontFamily: "Inter_400Regular", 
    fontSize: 12, 
    marginTop: 3 
  },
  noteExpand: { 
    color: "rgba(255,255,255,0.45)", 
    fontFamily: "Inter_600SemiBold", 
    fontSize: 12, 
    marginTop: 2 
  },
});
