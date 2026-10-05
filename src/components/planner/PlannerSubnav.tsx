import Link from "next/link";
import { TASK_BOARDS, TASK_BOARD_LABELS, type TaskBoard } from "@/lib/types";
import { boardHref } from "./format";

/** Events · Documents, the planner's two boards. Like the calendar's Week · List. */
export function PlannerSubnav({ active }: { active: TaskBoard }) {
  return (
    <nav className="subnav planner-subnav" aria-label="Planner boards">
      {TASK_BOARDS.map((board) => (
        <Link
          key={board}
          href={boardHref(board)}
          className={board === active ? "active" : undefined}
          aria-current={board === active ? "page" : undefined}
        >
          {TASK_BOARD_LABELS[board]}
        </Link>
      ))}
    </nav>
  );
}
