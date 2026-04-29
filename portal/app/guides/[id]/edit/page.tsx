import { notFound, redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal-auth";
import { getGuide } from "@/lib/guides-store";
import GuideEditClient from "./GuideEditClient";

export default async function GuideEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getPortalSession();
  if (!session) {
    redirect(`/auth/login?returnTo=/guides/${id}/edit`);
  }

  const guide = await getGuide(id);
  if (!guide || guide.format === "static-html") {
    notFound();
  }

  return (
    <GuideEditClient
      id={id}
      initialTitle={guide.title}
      initialCategory={guide.category}
      initialContent={guide.content}
      authorName={session.name || session.email}
    />
  );
}
