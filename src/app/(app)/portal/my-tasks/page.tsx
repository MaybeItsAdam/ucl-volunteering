import type { Metadata } from "next";
import Link from "next/link";
import { MyTaskDone } from "@/components/planner/MyTaskDone";
import { boardHref, DUE_TAG, dueState, eventOptionLabel, groupMine, MINE_GROUP_LABELS, type MineGroup } from "@/components/planner/format";
import { can, profileOf } from "@/lib/access";
import { londonDayKey } from "@/lib/planTime";
import { requireCapability } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import { listTasks } from "@/lib/tasks";
import { TASK_BOARD_LABELS, TASK_STATUS_LABELS, type Task } from "@/lib/types";
import "@/components/planner/planner.css";

export const metadata: Metadata = { title: "My tasks" };

const GROUPS: MineGroup[] = ["overdue", "week", "later", "undated"];

export default async function MyTasksPage() {
  const member = await requireCapability("view_plan");
  const canEdit = can(profileOf(member), "edit_plan");
  const today = londonDayKey(new Date());

  let tasks: Task[] = [];
  let loadError = false;
  if (isSupabaseConfigured()) {
    try {
      tasks = (await listTasks()).filter((t) => t.assigneeId === member.id);
    } catch (error) {
      console.error("[my-tasks]", error);
      loadError = true;
    }
  }
  const groups = groupMine(tasks, member.id, today);
  const total = GROUPS.reduce((n, g) => n + groups[g].length, 0);
  const first = member.name.split(" ")[0];

  return (
    <section className="page narrow planner-page">
      <header className="page-head">
        <span className="micro-label">VolSoc planner</span>
        <h1>{first ? `${first}'s tasks` : "My tasks"}</h1>
      </header>

      {loadError && (
        <div className="notice bad" role="alert">
          <strong>Your tasks couldn&apos;t be loaded</strong>
          <p>Reload the page to try again</p>
        </div>
      )}

      {!loadError && total === 0 && (
        <div className="panel">
          <p className="empty">Nothing is waiting on you</p>
          <p className="muted small">
            Items on the <Link href={boardHref("events")}>planner</Link> that are yours show up here
          </p>
        </div>
      )}

      {GROUPS.filter((g) => groups[g].length).map((g) => (
        <section key={g} className="panel flush" aria-labelledby={`mine-${g}`}>
          <div className="panel-head">
            <span id={`mine-${g}`} className="micro-label">
              {MINE_GROUP_LABELS[g]}
            </span>
            <span className="micro-label mono">{groups[g].length}</span>
          </div>
          <ul className="rows">
            {groups[g].map((task) => {
              const due = dueState(task, today);
              return (
                <li key={task.id} className="planner-event-task">
                  <Link href={`${boardHref(task.board)}?task=${task.id}`} className="planner-event-task-title">
                    {task.title}
                  </Link>
                  <span className="muted small">
                    {TASK_BOARD_LABELS[task.board]} · {TASK_STATUS_LABELS[task.status]}
                    {task.event ? ` · ${eventOptionLabel(task.event)}` : ""}
                  </span>
                  {due && <span className={DUE_TAG[due.tone]}>{due.label}</span>}
                  {canEdit && <MyTaskDone id={task.id} title={task.title} board={task.board} />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}
