import type { PlanEvent, ResponseKind } from "@/lib/types";

/** Browser calls to /api/plan. Each throws an Error carrying the server's message. */

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: init.body ? { "content-type": "application/json" } : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection.");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export async function patchEvent(id: string, body: Record<string, unknown>): Promise<PlanEvent> {
  const { event } = await call<{ event: PlanEvent }>(`/api/plan/events/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  return event;
}

export async function createEvent(body: Record<string, unknown>): Promise<PlanEvent> {
  const { event } = await call<{ event: PlanEvent }>("/api/plan/events", { method: "POST", body: JSON.stringify(body) });
  return event;
}

export async function deleteEvent(id: string): Promise<void> {
  await call(`/api/plan/events/${id}`, { method: "DELETE" });
}

export async function putResponse(id: string, response: ResponseKind | null): Promise<void> {
  await call(`/api/plan/events/${id}/response`, { method: "PUT", body: JSON.stringify({ response }) });
}

export async function runSync(): Promise<{ ok: boolean; error?: string }> {
  return call("/api/sync/organiser-events", { method: "POST" });
}
