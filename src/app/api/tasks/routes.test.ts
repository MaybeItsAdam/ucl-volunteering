import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanError } from "@/lib/plan";
import type { Task } from "@/lib/types";

// The routes with the database, the session and the audit log stubbed out:
// what's checked here is the wiring (capability, 503, JSON, audit, errors),
// not Postgres. The parsing they rely on is covered in src/lib/tasks.test.ts.

const state = vi.hoisted(() => ({ dbReady: true, capabilities: [] as string[], signedIn: true }));

vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: () => state.dbReady }));
vi.mock("@/lib/session", () => ({
  requireApiCapability: async (capability: string) => {
    state.capabilities.push(capability);
    return state.signedIn
      ? { member: { id: "member-1" } }
      : { error: NextResponse.json({ error: "Sign in first" }, { status: 401 }) };
  },
}));
const audit = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}));
vi.mock("@/lib/audit", () => ({ audit }));
const tasks = vi.hoisted(() => ({
  createTask: vi.fn(),
  listTasks: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));
vi.mock("@/lib/tasks", () => ({ ...tasks, DONE_WINDOW_DAYS: 30 }));

const { GET: list, POST: create } = await import("./route");
const { PATCH: patch, DELETE: remove } = await import("./[id]/route");

const TASK: Task = {
  id: "task-1",
  title: "Book the minibus",
  notes: null,
  status: "todo",
  assigneeId: null,
  dueOn: "2026-10-20",
  eventId: null,
  event: null,
  createdBy: "member-1",
  createdAt: "2026-10-05T09:00:00.000Z",
  updatedAt: "2026-10-05T09:00:00.000Z",
  completedAt: null,
};

const json = (body: unknown) =>
  new Request("http://test/api/tasks", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  state.dbReady = true;
  state.signedIn = true;
  state.capabilities = [];
  audit.mockClear();
  for (const fn of Object.values(tasks)) fn.mockReset();
});

describe("/api/tasks", () => {
  it("reads with view_plan and writes with edit_plan", async () => {
    tasks.listTasks.mockResolvedValue([]);
    tasks.createTask.mockResolvedValue(TASK);
    await list(new Request("http://test/api/tasks"));
    await create(json({ title: "x" }));
    expect(state.capabilities).toEqual(["view_plan", "edit_plan"]);
  });

  it("passes on the session's refusal", async () => {
    state.signedIn = false;
    expect((await create(json({ title: "x" }))).status).toBe(401);
    expect(tasks.createTask).not.toHaveBeenCalled();
  });

  it("answers 503 with no database", async () => {
    state.dbReady = false;
    expect((await list(new Request("http://test/api/tasks"))).status).toBe(503);
  });

  it("lists an event's tasks in full, else recent done only", async () => {
    tasks.listTasks.mockResolvedValue([TASK]);
    const response = await list(new Request("http://test/api/tasks?event=e1"));
    expect(await response.json()).toEqual({ tasks: [TASK] });
    expect(tasks.listTasks).toHaveBeenLastCalledWith({ eventId: "e1" });
    await list(new Request("http://test/api/tasks"));
    expect(tasks.listTasks.mock.lastCall?.[0]).toHaveProperty("doneSince");
  });

  it("creates as the caller and audits it", async () => {
    tasks.createTask.mockResolvedValue(TASK);
    const response = await create(json({ title: "Book the minibus" }));
    expect(response.status).toBe(201);
    expect(tasks.createTask).toHaveBeenCalledWith("member-1", { title: "Book the minibus" });
    expect(audit).toHaveBeenCalledWith("member-1", "planner.task.create", "task", "task-1", {
      title: "Book the minibus",
      assigneeId: null,
      dueOn: "2026-10-20",
      eventId: null,
    });
  });

  it("refuses a body that isn't JSON", async () => {
    expect((await create(json("{nope"))).status).toBe(400);
  });

  it("turns a PlanError into its status", async () => {
    tasks.createTask.mockRejectedValue(new PlanError("title is required"));
    const response = await create(json({}));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "title is required" });
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("/api/tasks/[id]", () => {
  it("audits what changed, before and after", async () => {
    tasks.updateTask.mockResolvedValue({
      before: TASK,
      task: { ...TASK, status: "done", completedAt: "2026-10-05T12:00:00.000Z" },
      changed: ["status"],
    });
    const response = await patch(json({ status: "done" }), params("task-1"));
    expect(response.status).toBe(200);
    expect(audit).toHaveBeenCalledWith("member-1", "planner.task.update", "task", "task-1", {
      title: "Book the minibus",
      from: { status: "todo" },
      to: { status: "done" },
    });
  });

  it("404s a missing task", async () => {
    tasks.deleteTask.mockRejectedValue(new PlanError("No such task", 404));
    expect((await remove(new Request("http://test"), params("nope"))).status).toBe(404);
  });

  it("deletes and audits", async () => {
    tasks.deleteTask.mockResolvedValue(TASK);
    expect(await (await remove(new Request("http://test"), params("task-1"))).json()).toEqual({ ok: true });
    expect(audit.mock.lastCall?.[1]).toBe("planner.task.delete");
  });
});
