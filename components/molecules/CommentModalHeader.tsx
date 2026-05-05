import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CloseIcon } from "../atoms/CloseIcon";

interface CommentModalHeaderProps {
  onClose: () => void;
}

export const CommentModalHeader = ({ onClose }: CommentModalHeaderProps) => {
  return (
    <View style={styles.header}>
      <View style={styles.headerIndicator} />
      <View style={styles.headerContent}>
        <Text style={styles.headerTitle}>Commentaires</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <CloseIcon />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  headerIndicator: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
  },
  headerContent: {
    width: "100%",
    paddingVertical: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#FFF",
    letterSpacing: 0.5,
  },
  closeBtn: {
    position: "absolute",
    right: 20,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
});
