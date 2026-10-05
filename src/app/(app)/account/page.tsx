import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { ThemeSetting } from "@/components/ThemeSetting";
import { roleLabel } from "@/lib/access";
import { getCurrentMember } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function AccountPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/auth/signin");

  return (
    <article className="page account-settings">
      <header className="page-head">
        <span className="micro-label">Your account</span>
        <h1>Settings</h1>
      </header>

      {member.governance_role === null ? (
        <div className="notice info" role="status">
          <strong>You&apos;re not on the VolSoc committee yet</strong>
          <p>Ask a principal to add you. Once they have, the plan and availability appear here.</p>
        </div>
      ) : null}

      <section className="panel" aria-labelledby="account-details">
        <h2 id="account-details" className="micro-label">Signed in as</h2>
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
          Your name and email come from your UCL sign-in. Principals come from the Toolbox; the committee is set by a
          principal on the Members page.
        </p>
      </section>

      <section className="panel" aria-labelledby="appearance">
        <h2 id="appearance" className="micro-label">Appearance</h2>
        <ThemeSetting />
        <p className="muted small">System follows your phone or computer&apos;s light or dark setting.</p>
      </section>

      <form action="/api/auth/logout" method="post">
        <button type="submit" className="button">
          <LogOut size={16} aria-hidden="true" /> Sign out
        </button>
      </form>
    </article>
  );
}
