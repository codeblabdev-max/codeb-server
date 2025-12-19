import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { 
  getProject, 
  startProject, 
  stopProject, 
  restartProject,
  getProjectStatus,
  getProjectLogs 
} from "~/services/project.server";

// GET /api/projects/:name
export async function loader({ params, request }: LoaderFunctionArgs) {
  const { name } = params;
  
  if (!name) {
    return json({ error: "Project name is required" }, { status: 400 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    switch (action) {
      case "status":
        const status = await getProjectStatus(name);
        return json({ status });
      
      case "logs":
        const tail = url.searchParams.get("tail") || "100";
        const container = url.searchParams.get("container") || "app";
        const logs = await getProjectLogs(name, { tail, container });
        return json({ logs });
      
      default:
        const project = await getProject(name);
        if (!project) {
          return json({ error: "Project not found" }, { status: 404 });
        }
        return json({ project });
    }
  } catch (error) {
    return json({ error: "Failed to get project information" }, { status: 500 });
  }
}

// POST /api/projects/:name
export async function action({ params, request }: ActionFunctionArgs) {
  const { name } = params;
  
  if (!name) {
    return json({ error: "Project name is required" }, { status: 400 });
  }

  const body = await request.json();
  const { action } = body;

  try {
    switch (action) {
      case "start":
        await startProject(name);
        return json({ message: "Project started successfully" });
      
      case "stop":
        const { graceful } = body;
        await stopProject(name, { graceful });
        return json({ message: "Project stopped successfully" });
      
      case "restart":
        const { hard } = body;
        await restartProject(name, { hard });
        return json({ message: "Project restarted successfully" });
      
      case "clone":
        const { target, skipData, newDomain } = body;
        const cloned = await cloneProject(name, target, { skipData, newDomain });
        return json({ project: cloned }, { status: 201 });
      
      case "backup":
        const backup = await createBackup(name);
        return json({ backup });
      
      case "exec":
        const { container, command } = body;
        const output = await execCommand(name, container, command);
        return json({ output });
      
      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    return json({ error: `Failed to ${action} project` }, { status: 500 });
  }
}

// Import additional functions
import { cloneProject, createBackup, execCommand } from "~/services/project.server";