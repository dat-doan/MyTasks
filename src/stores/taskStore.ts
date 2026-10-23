import type { Task } from "@/models/Task";
import { taskRepository } from "@/repositories/taskRepository";
import { randomUUID } from "expo-crypto";

type TaskSnapshot = {
  tasks: Task[];
  status: "loading" | "ready" | "error";
  error: unknown;
};

const listeners = new Set<() => void>();
let snapshot: TaskSnapshot = { tasks: [], status: "loading", error: null };
let loadPromise: Promise<void> | null = null;
let writeQueue = Promise.resolve();

function publish(next: TaskSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function updateTasks(update: (tasks: Task[]) => Task[]) {
  publish({ ...snapshot, tasks: update(snapshot.tasks) });
}

function load(): Promise<void> {
  if (snapshot.status === "ready") return Promise.resolve();
  if (loadPromise) return loadPromise;

  publish({ ...snapshot, status: "loading", error: null });
  loadPromise = taskRepository
    .list()
    .then((tasks) => publish({ tasks, status: "ready", error: null }))
    .catch((error: unknown) => {
      publish({ ...snapshot, status: "error", error });
      throw error;
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

function enqueueWrite(operation: () => Promise<void>): Promise<void> {
  // Share the queue across screen mounts; a failed write must not block later ones.
  const result = writeQueue.then(async () => {
    await load();
    await operation();
  });
  writeQueue = result.catch(() => undefined);
  return result;
}

function normalizeTitle(title: string): string {
  const value = title.trim();
  if (!value) throw new Error("Task title cannot be empty.");
  return value;
}

async function add(title: string): Promise<void> {
  const task: Task = {
    id: randomUUID(),
    title: normalizeTitle(title),
    complete: false,
    createAt: new Date(),
  };

  return enqueueWrite(async () => {
    await taskRepository.create(task);
    updateTasks((tasks) => [...tasks, task]);
  });
}

async function rename(id: string, title: string): Promise<void> {
  const value = normalizeTitle(title);
  return enqueueWrite(async () => {
    await taskRepository.rename(id, value);
    updateTasks((tasks) =>
      tasks.map((task) => (task.id === id ? { ...task, title: value } : task)),
    );
  });
}

function toggle(id: string): Promise<void> {
  return enqueueWrite(async () => {
    const complete = await taskRepository.toggle(id);
    updateTasks((tasks) =>
      tasks.map((task) => (task.id === id ? { ...task, complete } : task)),
    );
  });
}

function remove(id: string): Promise<void> {
  return enqueueWrite(async () => {
    await taskRepository.remove(id);
    updateTasks((tasks) => tasks.filter((task) => task.id !== id));
  });
}

export const taskStore = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  load,
  add,
  rename,
  toggle,
  remove,
};
