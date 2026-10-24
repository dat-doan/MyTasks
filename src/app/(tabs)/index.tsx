import EditTaskModal from "@/components/EditTaskModal";
import TaskInput from "@/components/TaskInput";
import type { TaskItemAction } from "@/components/TaskItem";
import TaskList from "@/components/TaskList";
import TaskSummary from "@/components/TaskSummary";
import TaskTracking from "@/components/TaskTracking";
import { useTasks } from "@/hooks/useTasks";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function MyTasks({ t }: WithTranslation<"tasks">) {
  const { tasks, status, load, add, rename, toggle, remove } = useTasks();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const editingTask = tasks.find((e) => e.id === editingTaskId);
  const selectedTaskId =
    typeof taskId === "string" && tasks.some((task) => task.id === taskId)
      ? taskId
      : undefined;
  const visibleTasks = useMemo(() => {
    if (!selectedTaskId) return tasks;
    const selectedTask = tasks.find((task) => task.id === selectedTaskId)!;
    return [selectedTask, ...tasks.filter((task) => task.id !== selectedTaskId)];
  }, [tasks, selectedTaskId]);

  const completedCount = useMemo(
    () => tasks.reduce((count, task) => count + Number(task.complete), 0),
    [tasks],
  );
  const message = t(($) => $.completedCount, {
    count: completedCount,
  });
  const percent =
    tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100);

  const showStorageError = useCallback(
    (error: unknown) => {
      console.warn("Failed to save task:", error);
      Alert.alert(
        t(($) => $.storage.errorTitle),
        t(($) => $.storage.saveError),
      );
    },
    [t],
  );

  const onTaskAction = useCallback(
    (action: TaskItemAction, id: string) => {
      switch (action) {
        case "edit":
          setEditingTaskId(id);
          break;
        case "toggle":
          void toggle(id).catch(showStorageError);
          break;
        case "delete":
          Alert.alert(
            t(($) => $.deleteConfirmation.title),
            t(($) => $.deleteConfirmation.message),
            [
              {
                text: t(($) => $.deleteConfirmation.cancel),
                style: "cancel",
              },
              {
                text: t(($) => $.deleteConfirmation.confirm),
                style: "destructive",
                onPress: () => void remove(id).catch(showStorageError),
              },
            ],
          );
          break;
      }
    },
    [remove, showStorageError, t, toggle],
  );

  async function saveTask(title: string) {
    if (!editingTaskId) return;
    await rename(editingTaskId, title);
    setEditingTaskId(null);
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "top"]}>
      <TaskSummary title={t(($) => $.title)} subtitle={message} />
      <TaskTracking percent={percent} />
      <TaskInput
        disabled={status !== "ready"}
        onAdd={add}
        onError={showStorageError}
      />
      {selectedTaskId && (
        <View style={styles.notificationContext}>
          <Text style={styles.statusText}>{t(($) => $.notification.openedTask)}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.setParams({ taskId: undefined })}
            style={styles.dismissSelection}
          >
            <Text style={styles.selectionLabel}>{t(($) => $.notification.dismiss)}</Text>
          </Pressable>
        </View>
      )}
      {status === "loading" ? (
        <View style={styles.status}>
          <ActivityIndicator color="#4F46E5" />
          <Text style={styles.statusText}>{t(($) => $.storage.loading)}</Text>
        </View>
      ) : status === "error" ? (
        <View style={styles.status}>
          <Text accessibilityRole="alert" style={styles.statusText}>
            {t(($) => $.storage.loadError)}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load().catch(() => undefined)}
            style={styles.retryButton}
          >
            <Text style={styles.retryLabel}>{t(($) => $.storage.retry)}</Text>
          </Pressable>
        </View>
      ) : (
        <TaskList
          tasks={visibleTasks}
          selectedTaskId={selectedTaskId}
          onAction={onTaskAction}
        />
      )}

      {editingTask && (
        <EditTaskModal
          key={editingTask.id}
          visible
          title={editingTask.title}
          onSave={saveTask}
          onError={showStorageError}
          onClose={() => setEditingTaskId(null)}
        />
      )}
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
  status: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  notificationContext: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dismissSelection: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  selectionLabel: {
    color: "#4F46E5",
    fontWeight: "600",
  },
  statusText: {
    color: "#475569",
    textAlign: "center",
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: 20,
    justifyContent: "center",
    backgroundColor: "#4F46E5",
    borderRadius: 10,
  },
  retryLabel: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
