import { useRef, useState } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type EditTaskModalProps = {
  visible: boolean;
  title: string;
  onSave: (title: string) => Promise<void>;
  onError: (error: unknown) => void;
  onClose: () => void;
} & WithTranslation<"tasks">;

function EditTaskModal({
  visible,
  title,
  onSave,
  onError,
  onClose,
  t,
}: EditTaskModalProps) {
  const inputRef = useRef<TextInput>(null);
  const [draftTitle, setDraftTitle] = useState(title);
  const [isSaving, setIsSaving] = useState(false);
  const submittingRef = useRef(false);
  const canSave = !isSaving && draftTitle.trim().length > 0;

  function close() {
    if (!submittingRef.current) onClose();
  }

  async function save() {
    if (!canSave || submittingRef.current) return;
    submittingRef.current = true;
    setIsSaving(true);
    try {
      await onSave(draftTitle.trim());
    } catch (error) {
      onError(error);
    } finally {
      submittingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      onShow={() => inputRef.current?.focus()}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={close}
            style={styles.card}
          >
            <Text accessibilityRole="header" style={styles.title}>
              {t(($) => $.editForm.title)}
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>{t(($) => $.editForm.nameLabel)}</Text>
              <TextInput
                ref={inputRef}
                accessibilityLabel={t(($) => $.editForm.nameLabel)}
                editable={!isSaving}
                value={draftTitle}
                onChangeText={setDraftTitle}
                placeholder={t(($) => $.editForm.placeholder)}
                placeholderTextColor="#94A3B8"
                selectionColor="#4F46E5"
                underlineColorAndroid="transparent"
                multiline
                style={styles.input}
              />
            </View>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isSaving }}
                disabled={isSaving}
                onPress={close}
                style={({ pressed }) => [
                  styles.button,
                  styles.cancelButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.cancelLabel}>
                  {t(($) => $.editForm.cancel)}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSave, busy: isSaving }}
                disabled={!canSave}
                style={({ pressed }) => [
                  styles.button,
                  styles.saveButton,
                  !canSave && styles.disabled,
                  pressed && styles.pressed,
                ]}
                onPress={() => void save()}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveLabel}>
                    {t(($) => $.editForm.save)}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default withTranslation("tasks")(EditTaskModal);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    padding: 24,
    gap: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  input: {
    minHeight: 104,
    maxHeight: 160,
    padding: 14,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    color: "#0F172A",
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: "top",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  saveButton: {
    backgroundColor: "#4F46E5",
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#475569",
  },
  saveLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});
