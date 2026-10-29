import { describeActivity, type ActivityItem } from "@/lib/activity";
import { isUuid } from "@/lib/plan";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * A task's or an event's history, newest first, read from the audit log. An
 * event's also takes in changes to the tasks linked to it. Server only.
 */

const LIMIT = 100;

interface Row {
  id: number;
  actor_member_id: string | null;
  action: string;
  metadata: unknown;
  created_at: string;
}

export async function listActivity(type: "task" | "event", id: string): Promise<ActivityItem[]> {
  if (!isUuid(id)) return [];
  const supabase = getSupabaseAdmin();
  const query = supabase.from("audit_log").select("id,actor_member_id,action,metadata,created_at").order("created_at", { ascending: false }).limit(LIMIT);
  const { data, error } = await (type === "task"
    ? query.eq("target_type", "task").eq("target_id", id)
    : query.or(`and(target_type.eq.event,target_id.eq.${id}),and(target_type.eq.task,metadata->>eventId.eq.${id})`));
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];

  // Names for the people who acted and for anyone a change names.
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.actor_member_id) ids.add(r.actor_member_id);
    for (const value of JSON.stringify(r.metadata ?? {}).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []) ids.add(value.toLowerCase());
  }
  const names = new Map<string, string>();
  if (ids.size) {
    const { data: members } = await supabase.from("members").select("id,name").in("id", [...ids]);
    for (const m of members ?? []) names.set(m.id as string, m.name as string);
  }
  const nameOf = (memberId: string) => names.get(memberId) ?? "a former member";

  const items: ActivityItem[] = [];
  for (const r of rows) {
    const { lines, comment } = describeActivity(r.action, r.metadata, nameOf);
    if (!lines.length) continue;
    // On an event's page the task's changes need to say which task.
    const title = type === "event" && r.action.startsWith("planner.task.") ? (r.metadata as { title?: string } | null)?.title : undefined;
    items.push({
      id: r.id,
      at: r.created_at,
      actor: r.actor_member_id ? { id: r.actor_member_id, name: nameOf(r.actor_member_id) } : null,
      lines: title ? lines.map((l) => `${l} (task: ${title})`) : lines,
      comment,
    });
  }
  return items;
}
