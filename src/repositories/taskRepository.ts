import { getDatabase } from "@/db/database";
import type { Task } from "@/models/Task";

type TaskRow = {
  id: string;
  title: string;
  complete: 0 | 1;
  created_at: number;
};

function validateTitle(title: string): void {
  if (title.trim().length === 0) {
    throw new Error("Task title cannot be empty.");
  }
}

function taskNotFound(id: string): Error {
  return new Error(`Task "${id}" was not found.`);
}

export const taskRepository = {
  async list(): Promise<Task[]> {
    const database = await getDatabase();
    const rows = await database.getAllAsync<TaskRow>(`
      SELECT id, title, complete, created_at
      FROM tasks
      ORDER BY created_at ASC, rowid ASC
    `);

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      complete: row.complete === 1,
      createAt: new Date(row.created_at),
    }));
  },

  async create(task: Task): Promise<void> {
    validateTitle(task.title);
    const createdAt = task.createAt.getTime();

    if (!Number.isFinite(createdAt)) {
      throw new Error("Task creation date is invalid.");
    }

    const database = await getDatabase();
    await database.runAsync(
      "INSERT INTO tasks (id, title, complete, created_at) VALUES (?, ?, ?, ?)",
      task.id,
      task.title,
      task.complete ? 1 : 0,
      createdAt,
    );
  },

  async rename(id: string, title: string): Promise<void> {
    validateTitle(title);
    const database = await getDatabase();
    const result = await database.runAsync(
      "UPDATE tasks SET title = ? WHERE id = ?",
      title,
      id,
    );

    if (result.changes === 0) {
      throw taskNotFound(id);
    }
  },

  async toggle(id: string): Promise<boolean> {
    const database = await getDatabase();
    // Read the result of this exact update rather than racing a second SELECT.
    const result = await database.getFirstAsync<Pick<TaskRow, "complete">>(
      "UPDATE tasks SET complete = 1 - complete WHERE id = ? RETURNING complete",
      id,
    );

    if (result === null) {
      throw taskNotFound(id);
    }

    return result.complete === 1;
  },

  async remove(id: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync("DELETE FROM tasks WHERE id = ?", id);
  },
};
