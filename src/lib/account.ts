import { audit } from "@/lib/audit";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import type { Member } from "@/lib/types";

/**
 * What a member holds here, for the Settings page: counting it, handing it
 * over (export) and removing it (delete). Calendar feed addresses and push
 * tokens are secrets in their own right, so the export describes them rather
 * than repeating them.
 */

export interface AccountSummary {
  calendars: number;
  availability: number;
  responses: number;
  volunteer: boolean;
  phones: number;
  tasks: number;
}

const EMPTY: AccountSummary = { calendars: 0, availability: 0, responses: 0, volunteer: false, phones: 0, tasks: 0 };

async function count(table: string, column: string, memberId: string, extra?: (q: CountQuery) => CountQuery): Promise<number> {
  let query = getSupabaseAdmin().from(table).select("*", { count: "exact", head: true }).eq(column, memberId) as CountQuery;
  if (extra) query = extra(query);
  const { count: n, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}
type CountQuery = ReturnType<ReturnType<ReturnType<typeof getSupabaseAdmin>["from"]>["select"]>;

export async function accountSummary(memberId: string): Promise<AccountSummary> {
  if (!isSupabaseConfigured()) return EMPTY;
  const [calendars, availability, responses, volunteer, phones, tasks] = await Promise.all([
    count("calendar_links", "member_id", memberId),
    count("availability_blocks", "member_id", memberId),
    count("event_responses", "member_id", memberId),
    count("volunteers", "member_id", memberId),
    count("push_devices", "member_id", memberId),
    count("tasks", "assignee_member_id", memberId, (q) => q.is("completed_at", null)),
  ]);
  return { calendars, availability, responses, volunteer: volunteer > 0, phones, tasks };
}

async function rows(table: string, columns: string, column: string, memberId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await getSupabaseAdmin().from(table).select(columns).eq(column, memberId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as unknown as Record<string, unknown>[];
}

/** Everything held about the member, as one JSON document. */
export async function exportAccount(member: Member): Promise<Record<string, unknown>> {
  const id = member.id;
  const [volunteer, availability, responses, calendars, timetable, tasks, phones, activity] = await Promise.all([
    rows("volunteers", "name,email,study,commitment,periods,slots,interests,free_times,available_until,notes,created_at,updated_at", "member_id", id),
    rows("availability_blocks", "weekday,start_minute,end_minute,note,created_at", "member_id", id),
    rows("event_responses", "event_id,response,updated_at", "member_id", id),
    rows("calendar_links", "kind,label,last_fetched_at,last_status,block_count,created_at", "member_id", id),
    rows("calendar_link_blocks", "kind,starts_at,ends_at,title,location", "member_id", id),
    rows("tasks", "title,board,status,due_on,completed_at,created_at", "assignee_member_id", id),
    rows("push_devices", "platform,food_alerts,task_reminders,created_at,last_seen_at", "member_id", id),
    rows("audit_log", "action,target_type,target_id,created_at", "actor_member_id", id),
  ]);
  return {
    exported_at: new Date().toISOString(),
    about:
      "Everything VolSoc holds about you. Linked calendar addresses and phone push tokens are left out: they are keys, and this file may travel",
    account: {
      name: member.name,
      email: member.email,
      role: member.governance_role,
      colour: member.colour,
      created_at: member.created_at,
      last_seen_at: member.last_seen_at,
    },
    volunteer_sign_up: volunteer[0] ?? null,
    weekly_unavailability: availability,
    event_responses: responses,
    linked_calendars: calendars,
    linked_calendar_times: timetable,
    tasks_assigned_to_you: tasks,
    phones_getting_notifications: phones,
    things_you_did: activity,
  };
}

export class AccountError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Remove the member and everything that hangs off them. Only for people off
 * the committee: a committee seat is the society's record, so a principal
 * takes it away first. Signing in again starts a fresh, empty account.
 */
export async function deleteAccount(member: Member): Promise<void> {
  if (member.governance_role !== null) {
    throw new AccountError("You're on the committee, so a principal needs to take you off it first", 409);
  }
  const db = getSupabaseAdmin();
  // Phones would otherwise outlive the member, still getting food alerts.
  const { error: phonesError } = await db.from("push_devices").delete().eq("member_id", member.id);
  if (phonesError) throw new Error(`push_devices: ${phonesError.message}`);

  const { error } = await db.from("members").delete().eq("id", member.id);
  if (error) {
    // tasks.assignee_member_id is ON DELETE RESTRICT.
    if (error.code === "23503") throw new AccountError("Some tasks are still assigned to you; ask the committee to reassign them", 409);
    throw new Error(`members: ${error.message}`);
  }
  await audit(null, "account.delete", "member", member.id);
}
