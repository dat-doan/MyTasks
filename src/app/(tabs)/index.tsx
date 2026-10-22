import TaskInput from "@/components/TaskInput";
import TaskList from "@/components/TaskList";
import TaskSummary from "@/components/TaskSummary";
import TaskTracking from "@/components/TaskTracking";
import { Task } from "@/models/Task";
import * as Crypto from "expo-crypto";
import { useState } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function MyTasks({ t }: WithTranslation<"tasks">) {
  const [tasks, setTasks] = useState<Task[]>([]);

  const completedCount = tasks.filter((e) => e.complete).length;
  const message = t(($) => $.completedCount, {
    count: completedCount,
  });
  const percent =
    tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100);

  return (
    <SafeAreaView style={styles.container}>
      <TaskSummary title={t(($) => $.title)} subtitle={message} />
      <TaskTracking percent={percent} />
      <TaskInput
        onAdd={(val) =>
          setTasks((v) => [
            ...v,
            { id: Crypto.randomUUID(), title: val, complete: false },
          ])
        }
      />
      <TaskList
        tasks={tasks}
        onAction={(action, id) => {
          switch (action) {
            case "delete":
              setTasks((prev) => prev.filter((e) => e.id !== id));
            case "toggle":
              setTasks((prev) =>
                prev.map((e) =>
                  e.id === id ? { ...e, complete: !e.complete } : e,
                ),
              );
          }
        }}
      />
    </SafeAreaView>
  );
}

export default withTranslation("tasks")(MyTasks);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 10,
    backgroundColor: "#F7F9FB",
  },
});
