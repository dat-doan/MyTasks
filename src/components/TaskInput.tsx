import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { withTranslation, WithTranslation } from "react-i18next";
import { StyleSheet, TextInput, TouchableOpacity, View } from "react-native";

type TaskInputProps = {
  onAdd: (task: string) => void;
} & WithTranslation<"tasks">;

export function TaskInput({ onAdd, t }: TaskInputProps) {
  const [taskName, setTaskName] = useState("");
  const [inputHeight, setInputHeight] = useState<number>();

  const enable = () => taskName.trim().length > 0;

  return (
    <View style={styles.container}>
      <TextInput
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
        disabled={!enable()}
        style={[
          styles.button,
          { height: inputHeight },
          !enable() && styles.disable,
        ]}
        activeOpacity={0.5}
        onPress={() => {
          onAdd(taskName);
          setTaskName("");
        }}
      >
        <SymbolView
          name={{ ios: "plus", android: "add", web: "add" }}
          size={24}
          tintColor="#FFFFFF"
        />
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
