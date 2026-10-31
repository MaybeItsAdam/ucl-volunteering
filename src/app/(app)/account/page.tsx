import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, LogOut } from "lucide-react";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { ThemeSetting } from "@/components/ThemeSetting";
import { accountSummary, type AccountSummary } from "@/lib/account";
import { can, profileOf, roleLabel } from "@/lib/access";
import { getCurrentMember } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function AccountPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/auth/signin");

  const committee = can(profileOf(member), "view_plan");
  let summary: AccountSummary | null = null;
  try {
    summary = await accountSummary(member.id);
  } catch (error) {
    console.error("[settings] couldn't count the member's data", error);
  }

  return (
    <article className="page account-settings">
      <header className="page-head">
        <span className="micro-label">Your account</span>
        <h1>Settings</h1>
      </header>

      {member.governance_role === null ? (
        <div className="notice info" role="status">
          <strong>You&apos;re not on the VolSoc committee</strong>
          <p>
            What&apos;s on shows you upcoming events from UCL&apos;s social impact societies — if you&apos;re joining the
            committee, ask a principal to add you and the plan and availability appear here too
          </p>
        </div>
      ) : null}

      <section className="panel" aria-labelledby="account-details">
        <h2 id="account-details" className="micro-label">Account</h2>
        <dl className="details">
          <dt>Name</dt>
          <dd>{member.name}</dd>
          {member.email ? (
            <>
              <dt>Email</dt>
              <dd>{member.email}</dd>
            </>
          ) : null}
          <dt>Role</dt>
          <dd>
            <span className="tag">{roleLabel(member.governance_role)}</span>
          </dd>
        </dl>
        <p className="muted small">
          Your name and email come from your UCL sign-in; principals come from the Toolbox and the committee is set by a
          principal on the Members page
        </p>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="button">
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </form>
      </section>

      <section className="panel" aria-labelledby="notifications">
        <h2 id="notifications" className="micro-label">Notifications</h2>
        <NotificationSettings committee={committee} phones={summary?.phones ?? 0} />
      </section>

      <section className="panel" aria-labelledby="appearance">
        <h2 id="appearance" className="micro-label">Appearance</h2>
        <ThemeSetting />
        <p className="muted small">System follows your phone or computer&apos;s light or dark setting</p>
      </section>

      <section className="panel" aria-labelledby="your-data">
        <h2 id="your-data" className="micro-label">Your data</h2>
        {summary ? (
          <dl className="details">
            <dt>Volunteering</dt>
            <dd>
              {summary.volunteer ? (
                <>
                  Signed up · <Link href="/volunteer">change your answers</Link>
                </>
              ) : (
                "Not signed up"
              )}
            </dd>
            {committee ? (
              <>
                <dt>Calendars</dt>
                <dd>
                  {plural(summary.calendars, "linked calendar")} · <Link href="/portal/calendar">manage on Calendar</Link>
                </dd>
                <dt>Availability</dt>
                <dd>{plural(summary.availability, "weekly busy block")}</dd>
                <dt>Events</dt>
                <dd>{plural(summary.responses, "going / maybe answer")}</dd>
                <dt>Tasks</dt>
                <dd>{plural(summary.tasks, "open task")} assigned to you</dd>
              </>
            ) : null}
            <dt>Phones</dt>
            <dd>{plural(summary.phones, "phone")} getting notifications</dd>
          </dl>
        ) : (
          <p className="muted">Your data couldn&apos;t be counted just now</p>
        )}
        {committee ? (
          <p className="muted small">
            Linked calendars only ever show the rest of the committee when you&apos;re busy, never what you&apos;re doing
          </p>
        ) : null}
        <a className="button" href="/api/account/export" download>
          <Download size={16} aria-hidden="true" /> Download my data
        </a>
      </section>

      <section className="panel settings-danger" aria-labelledby="delete-account">
        <h2 id="delete-account" className="micro-label">Delete account</h2>
        {member.governance_role === null ? (
          <DeleteAccount />
        ) : (
          <p className="muted">
            {member.governance_role === "committee"
              ? "You're on the committee, so your account is part of the society's records. To leave, ask a principal to take you off on the Members page; you can then delete it here"
              : "Your role comes from the society's governance roles on the Toolbox, so your account is part of its records. Once that role is handed on, you can delete it here"}
          </p>
        )}
      </section>
    </article>
  );
}
