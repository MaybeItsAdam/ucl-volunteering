import type { Task } from "@/lib/types";

/** Browser calls to /api/tasks. Each throws an Error carrying the server's message. */

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: init.body ? { "content-type": "application/json" } : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Couldn't reach the server — check your connection");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export async function createTask(body: Record<string, unknown>): Promise<Task> {
  const { task } = await call<{ task: Task }>("/api/tasks", { method: "POST", body: JSON.stringify(body) });
  return task;
}

export async function patchTask(id: string, body: Record<string, unknown>): Promise<Task> {
  const { task } = await call<{ task: Task }>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  return task;
}

export async function deleteTask(id: string): Promise<void> {
  await call(`/api/tasks/${id}`, { method: "DELETE" });
}
