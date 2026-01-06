import { redirect } from "next/navigation";

interface ProjectPageProps {
  params: Promise<{ name: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { name } = await params;
  redirect(`/projects/${name}/deployments`);
}
