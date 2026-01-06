"use client";

import { ReactNode } from "react";
import { Bell, Search, User } from "lucide-react";

interface HeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function Header({ title, description, action }: HeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          {description && (
            <p className="text-sm text-gray-500">{description}</p>
          )}
        </div>
        {action && <div className="ml-4">{action}</div>}
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="h-9 w-64 rounded-lg border border-gray-300 bg-gray-50 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Notifications */}
        <button className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
        </button>

        {/* User Menu */}
        <button className="flex items-center gap-2 rounded-lg p-2 text-gray-700 hover:bg-gray-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
            <User className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium">Admin</span>
        </button>
      </div>
    </header>
  );
}
