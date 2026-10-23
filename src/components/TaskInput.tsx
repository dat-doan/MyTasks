import { SymbolView } from "expo-symbols";
import { useRef, useState } from "react";
import { withTranslation, WithTranslation } from "react-i18next";
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type TaskInputProps = {
  onAdd: (task: string) => Promise<void>;
  onError: (error: unknown) => void;
  disabled?: boolean;
} & WithTranslation<"tasks">;

function TaskInput({ onAdd, onError, disabled = false, t }: TaskInputProps) {
  const [taskName, setTaskName] = useState("");
  const [inputHeight, setInputHeight] = useState<number>();

  const [isSaving, setIsSaving] = useState(false);
  const submittingRef = useRef(false);
  const canAdd = !disabled && !isSaving && taskName.trim().length > 0;

  async function submit() {
    if (!canAdd || submittingRef.current) return;
    submittingRef.current = true;
    setIsSaving(true);
    try {
      await onAdd(taskName.trim());
      setTaskName("");
    } catch (error) {
      onError(error);
    } finally {
      submittingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        editable={!disabled && !isSaving}
        placeholder={t(($) => $.input.placeholder)}
        placeholderTextColor="#94A3B8"
        selectionColor="#4F46E5"
        underlineColorAndroid="transparent"
        onChangeText={(e) => setTaskName(e)}
        onLayout={({ nativeEvent }) =>
          setInputHeight(nativeEvent.layout.height)
        }
        style={styles.input}
        value={taskName}
      />
      <TouchableOpacity
        accessibilityLabel={t(($) => $.actions.add)}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canAdd, busy: isSaving }}
        disabled={!canAdd}
        style={[
          styles.button,
          { height: inputHeight },
          !canAdd && styles.disable,
        ]}
        activeOpacity={0.5}
        onPress={() => void submit()}
      >
        {isSaving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <SymbolView
            name={{ ios: "plus", android: "add", web: "add" }}
            size={24}
            tintColor="#FFFFFF"
          />
        )}
      </TouchableOpacity>
    </View>
  );
}

export default withTranslation("tasks")(TaskInput);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#0F172A",
    height: 55,
  },
  button: {
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#4F46E5",
    borderRadius: 12,
  },
  disable: {
    opacity: 0.6,
  },
});
