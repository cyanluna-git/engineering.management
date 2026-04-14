import { PortalHomeClient } from "@/components/portal/PortalHomeClient";
import { getPortalSession } from "@/lib/portal-auth";

export default async function PortalPage() {
  const session = await getPortalSession();

  return <PortalHomeClient currentUserName={session?.name || null} />;
}
