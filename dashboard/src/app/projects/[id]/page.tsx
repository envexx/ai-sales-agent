import { ProjectDetailView } from "@/components/project-detail-view";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDetailView key={id} id={id} />;
}
