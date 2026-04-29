import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal-auth";
import GuideNewClient from "./GuideNewClient";

export default async function GuideNewPage() {
  const session = await getPortalSession();
  if (!session) {
    redirect("/auth/login?returnTo=/guides/new");
  }

  return <GuideNewClient authorName={session.name || session.email} />;
}
