import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What UCL Volunteering Society's website and VolSoc app collect, why, and how to delete it",
};

/** The privacy policy both store listings link to. Change it when what's collected changes. */
export default function PrivacyPage() {
  return (
    <article className="page narrow prose">
      <header className="page-head">
        <span className="micro-label">Updated 7 November 2026</span>
        <h1>Privacy</h1>
      </header>

      <p>
        UCL Volunteering Society (VolSoc), a student society at University College London, runs uclvolunteering.org and
        the VolSoc app for iOS and Android. This page explains what we collect, why, and what you can do about it
      </p>

      <h2>Without signing in</h2>
      <p>
        The calendar, the list of places to volunteer and the maps need no account, and we don&apos;t record who looks
        at them. If you log a Zero Food Waste shift, the outlet, the shift leaders&apos; names you type and the counts
        of food collected go to the society&apos;s tracking spreadsheet (Google Sheets)
      </p>

      <h2>When you sign in</h2>
      <ul>
        <li>
          <b>Your account:</b> your name, UCL email address and an account ID, from your UCL login through Adam&apos;s
          Campus Toolbox, which runs the sign-in. We never see your password
        </li>
        <li>
          <b>The volunteer list:</b> if you sign up, what you put on the form: what you study, how often and when
          you&apos;re free, until when, what you&apos;d like to do and any notes
        </li>
        <li>
          <b>Notifications:</b> if you turn them on, a device token so we can send them, and your choices about which
          ones you get
        </li>
        <li>
          <b>Committee members only:</b> the plans, availability and tasks you enter in the committee portal, and a log
          of changes made there
        </li>
        <li>
          <b>A sign-in cookie</b> that keeps you signed in. It&apos;s needed for the site to work and isn&apos;t used
          for anything else
        </li>
      </ul>
      <p>
        We don&apos;t use analytics, advertising or tracking of any kind, and we don&apos;t collect your location,
        contacts or photos
      </p>

      <h2>How we use it</h2>
      <p>
        To run the volunteer list (the committee contacts you when something fits what you told us), to send the
        notifications you asked for, and to run the committee&apos;s planning. We don&apos;t sell or share your data, and
        we don&apos;t use it for marketing
      </p>

      <h2>Where it&apos;s kept</h2>
      <p>
        Data is stored with Supabase and the site is hosted by Vercel. Sign-in is provided by Adam&apos;s Campus Toolbox
        and UCL&apos;s Microsoft accounts, Zero Food Waste logs are kept in Google Sheets, and notifications are delivered
        by Apple and Google. These providers process data only to run the service for us
      </p>

      <h2>How long we keep it</h2>
      <p>
        For as long as you have an account. You can take yourself off the volunteer list from the form at any time, and
        deleting your account removes everything linked to you straight away
      </p>

      <h2>Deleting your account</h2>
      <p>
        Sign in, open <Link href="/account">Settings</Link> and choose <b>Delete account</b>. This removes your member
        record, your volunteer sign-up and your notification settings, and signs you out. If you&apos;re on the
        committee, a principal takes you off it first. Settings can also download a copy of everything we hold about
        you. You can also email us and we&apos;ll do either for you
      </p>

      <h2>Your rights</h2>
      <p>
        Under UK GDPR you can ask to see, correct or delete your data, or object to how we use it. Email us and we&apos;ll
        reply within a month. You can also complain to the Information Commissioner&apos;s Office (ico.org.uk)
      </p>

      <h2>Children</h2>
      <p>The service is for UCL students and isn&apos;t aimed at children under 13</p>

      <h2>Contact</h2>
      <p>
        UCL Volunteering Society · <a href="mailto:support@uclvolunteering.org">support@uclvolunteering.org</a>
      </p>
    </article>
  );
}
