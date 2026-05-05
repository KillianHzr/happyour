import React from "react";
import { View, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { SendIcon } from "../atoms/SendIcon";

interface CommentInputProps {
  content: string;
  setContent: (text: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

export const CommentInput = ({ content, setContent, onSubmit, submitting }: CommentInputProps) => {
  const isDisabled = !content.trim() || submitting;

  return (
    <View style={styles.inputArea}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ajouter un commentaire..."
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={content}
          onChangeText={setContent}
          multiline
          maxLength={500}
        />
        <TouchableOpacity 
          style={[styles.sendBtn, !content.trim() && styles.sendBtnDisabled]} 
          onPress={onSubmit}
          disabled={isDisabled}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <SendIcon disabled={!content.trim()} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  inputArea: {
    padding: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 26,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  input: {
    flex: 1,
    color: "#FFF",
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  sendBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
});
