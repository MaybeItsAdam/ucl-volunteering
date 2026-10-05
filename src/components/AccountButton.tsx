"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { roleLabel } from "@/lib/access";
import type { Member } from "@/lib/types";
import { SignInButton } from "@/components/SignInButton";

/** The top bar's account menu: who you are, Settings, and sign out. */
export function AccountButton({ member }: { member: Member | null }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!member) return <SignInButton compact />;

  const initials = member.name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="account-menu" ref={container}>
      <button
        type="button"
        className="account-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="avatar" data-colour={member.colour ?? undefined} aria-hidden="true">{initials}</span>
        <span className="account-trigger-name">{member.name.split(" ")[0]}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="account-popover" role="menu">
          <div className="account-popover-head">
            <strong>{member.name}</strong>
            {member.email ? <small>{member.email}</small> : null}
            <span className="tag">{roleLabel(member.governance_role)}</span>
          </div>
          <Link role="menuitem" href="/account" onClick={() => setOpen(false)}>
            <Settings size={14} aria-hidden="true" /> Settings
          </Link>
          <form action="/api/auth/logout" method="post">
            <button role="menuitem" type="submit">
              <LogOut size={14} aria-hidden="true" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
