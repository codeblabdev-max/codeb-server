"use client";

import { clsx } from "clsx";

type Environment = "production" | "staging" | "preview";

interface EnvironmentSubTabsProps {
  selected: Environment;
  onChange: (env: Environment) => void;
  availableEnvironments?: Environment[];
}

const environments: { value: Environment; label: string; color: string }[] = [
  { value: "production", label: "프로덕션", color: "bg-green-500" },
  { value: "staging", label: "스테이징", color: "bg-yellow-500" },
  { value: "preview", label: "프리뷰", color: "bg-blue-500" },
];

export function EnvironmentSubTabs({
  selected,
  onChange,
  availableEnvironments = ["production", "staging", "preview"],
}: EnvironmentSubTabsProps) {
  const filteredEnvironments = environments.filter((env) =>
    availableEnvironments.includes(env.value)
  );

  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
      {filteredEnvironments.map((env) => (
        <button
          key={env.value}
          onClick={() => onChange(env.value)}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all",
            selected === env.value
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          <div className={clsx("w-2 h-2 rounded-full", env.color)} />
          {env.label}
        </button>
      ))}
    </div>
  );
}
