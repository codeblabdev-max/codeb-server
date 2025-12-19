import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { getProjects, createProject, deleteProject } from "~/services/project.server";
import { requireAuth } from "~/services/auth.server";
import { z } from "zod";

// GET /api/projects - 프로젝트 목록 조회
export async function loader({ request }: LoaderFunctionArgs) {
  // 읽기 권한 필요
  await requireAuth(request, "read");
  
  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "true";
  
  try {
    const projects = await getProjects({ all });
    return json({ projects });
  } catch (error) {
    return json({ error: "Failed to load projects" }, { status: 500 });
  }
}

// POST /api/projects - 프로젝트 생성
// DELETE /api/projects - 프로젝트 삭제
export async function action({ request }: ActionFunctionArgs) {
  const method = request.method;

  if (method === "POST") {
    // 쓰기 권한 필요
    await requireAuth(request, "write");
    
    try {
      const body = await request.json();
      
      // Validation
      const projectSchema = z.object({
        name: z.string().min(1).regex(/^[a-z0-9-]+$/),
        git: z.string().url().optional(),
        domain: z.string().optional(),
        template: z.enum(["node", "remix", "next", "python", "go"]).default("node"),
        database: z.enum(["postgres", "mysql", "none"]).default("postgres"),
        cache: z.boolean().default(true),
        ssl: z.boolean().default(true),
      });

      const validatedData = projectSchema.parse(body);
      const project = await createProject(validatedData);
      
      return json({ project }, { status: 201 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return json({ error: "Invalid request data", details: error.errors }, { status: 400 });
      }
      return json({ error: "Failed to create project" }, { status: 500 });
    }
  }

  if (method === "DELETE") {
    // 쓰기 권한 필요
    await requireAuth(request, "write");
    
    try {
      const body = await request.json();
      const { name } = body;
      
      if (!name) {
        return json({ error: "Project name is required" }, { status: 400 });
      }
      
      await deleteProject(name);
      return json({ message: "Project deleted successfully" });
    } catch (error) {
      return json({ error: "Failed to delete project" }, { status: 500 });
    }
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}