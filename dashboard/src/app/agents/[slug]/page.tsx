import { redirect } from "next/navigation";
export default async function AgentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/workflow?agent=${encodeURIComponent(slug)}`);
}
