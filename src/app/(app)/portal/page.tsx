import { redirect } from "next/navigation";
import { profileOf } from "@/lib/access";
import { APP_PAGE_HREFS, availablePages } from "@/lib/app-pages";
import { getCurrentMember } from "@/lib/session";

/** Sign-in lands here; send each person to the first page they can use. */
export default async function PortalPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/auth/signin");
  redirect(APP_PAGE_HREFS[availablePages(profileOf(member))[0]]);
}
