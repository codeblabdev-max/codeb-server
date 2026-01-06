import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export type BadgeVariant = "default" | "secondary" | "success" | "warning" | "error" | "info" | "outline";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-700",
  secondary: "bg-gray-100 text-gray-600",
  success: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-700",
  error: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
  outline: "border border-gray-200 text-gray-700 bg-transparent",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// Status Badge with dot indicator
interface StatusBadgeProps {
  status: "running" | "stopped" | "deploying" | "failed" | "pending" | "active" | "inactive";
  showDot?: boolean;
}

const statusConfig: Record<string, { variant: BadgeVariant; label: string }> = {
  running: { variant: "success", label: "Running" },
  active: { variant: "success", label: "Active" },
  stopped: { variant: "default", label: "Stopped" },
  inactive: { variant: "default", label: "Inactive" },
  deploying: { variant: "info", label: "Deploying" },
  pending: { variant: "warning", label: "Pending" },
  failed: { variant: "error", label: "Failed" },
};

export function StatusBadge({ status, showDot = true }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;

  return (
    <Badge variant={config.variant} className="gap-1.5">
      {showDot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            config.variant === "success" && "bg-green-500",
            config.variant === "error" && "bg-red-500",
            config.variant === "warning" && "bg-yellow-500",
            config.variant === "info" && "bg-blue-500",
            config.variant === "default" && "bg-gray-500"
          )}
        />
      )}
      {config.label}
    </Badge>
  );
}
