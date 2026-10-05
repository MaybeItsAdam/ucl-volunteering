import { Landing } from "@/components/landing/Landing";

/** The flag behind the front page and the sign-in steps. */
export default function LandingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <Landing>{children}</Landing>;
}
