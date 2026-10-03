import Link from "next/link";
import { LogIn } from "lucide-react";

/** Goes through /auth/signin, which explains the handoff before opening UCL sign-in. */
export function SignInButton({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={compact ? "button small" : "button primary"} href="/auth/signin">
      <LogIn size={16} aria-hidden="true" />
      <span>{compact ? "Sign in" : "Committee sign-in"}</span>
    </Link>
  );
}
