"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Settings,
  Key,
  Users,
  Bell,
  Cog,
  Save,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<
    "general" | "api-keys" | "users" | "notifications" | "system"
  >("general");

  const tabs = [
    { id: "general" as const, label: "General", icon: Settings },
    { id: "api-keys" as const, label: "API Keys", icon: Key },
    { id: "users" as const, label: "Users", icon: Users },
    { id: "notifications" as const, label: "Notifications", icon: Bell },
    { id: "system" as const, label: "System", icon: Cog },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Settings"
        description="Manage your CodeB configuration"
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex gap-8">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-1 py-4 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.id
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === "general" && <GeneralSettings />}
          {activeTab === "api-keys" && <APIKeysSettings />}
          {activeTab === "users" && <UsersSettings />}
          {activeTab === "notifications" && <NotificationsSettings />}
          {activeTab === "system" && <SystemSettings />}
        </div>
      </div>
    </div>
  );
}

function GeneralSettings() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input label="Default Refresh Interval (seconds)" defaultValue="30" />
          <Input label="Time Zone" defaultValue="Asia/Seoul" />
          <Input label="Date Format" defaultValue="YYYY-MM-DD" />
          <Button>
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deployment Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span className="text-sm text-gray-700">
                Auto-deploy on Git push
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span className="text-sm text-gray-700">
                Send deployment notifications
              </span>
            </label>
          </div>
          <Input label="Build Timeout (minutes)" defaultValue="10" />
          <Input label="Max Concurrent Deployments" defaultValue="3" />
          <Button>
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Domain Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input label="Default Domain Suffix" defaultValue="codeb.kr" />
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="rounded" />
            <span className="text-sm text-gray-700">Auto SSL (Let's Encrypt)</span>
          </label>
          <Button>
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function APIKeysSettings() {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const apiKeys = [
    {
      id: "1",
      name: "Production Deploy Key",
      key: "codeb_prod_1234567890abcdef",
      permissions: "read-write",
      createdAt: "2024-11-15",
      lastUsed: "2024-12-19",
    },
    {
      id: "2",
      name: "CI/CD Pipeline Key",
      key: "codeb_ci_0987654321fedcba",
      permissions: "read-only",
      createdAt: "2024-10-20",
      lastUsed: "2024-12-18",
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>API Keys</CardTitle>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create API Key
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">API Key</th>
                <th className="px-6 py-3 font-medium">Permissions</th>
                <th className="px-6 py-3 font-medium">Last Used</th>
                <th className="px-6 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((apiKey) => (
                <tr
                  key={apiKey.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{apiKey.name}</p>
                    <p className="text-xs text-gray-500">
                      Created {apiKey.createdAt}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">
                        {showKeys[apiKey.id]
                          ? apiKey.key
                          : "••••••••••••••••"}
                      </code>
                      <button
                        onClick={() =>
                          setShowKeys((prev) => ({
                            ...prev,
                            [apiKey.id]: !prev[apiKey.id],
                          }))
                        }
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {showKeys[apiKey.id] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                      <button className="text-gray-400 hover:text-gray-600">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600 capitalize">
                      {apiKey.permissions}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">
                      {apiKey.lastUsed}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Button variant="ghost" size="sm">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook URLs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Deployment Webhook"
            defaultValue="https://hooks.example.com/deployments"
            helper="Triggered on every deployment event"
          />
          <Input
            label="Monitoring Webhook"
            defaultValue="https://hooks.example.com/monitoring"
            helper="Triggered on server alerts"
          />
          <Button>
            <Save className="mr-2 h-4 w-4" />
            Save Webhooks
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function UsersSettings() {
  const users = [
    {
      id: "1",
      name: "Admin User",
      email: "admin@example.com",
      role: "admin",
      status: "active",
      lastLogin: "2024-12-19",
    },
    {
      id: "2",
      name: "Developer 1",
      email: "dev1@example.com",
      role: "developer",
      status: "active",
      lastLogin: "2024-12-18",
    },
    {
      id: "3",
      name: "Viewer User",
      email: "viewer@example.com",
      role: "viewer",
      status: "inactive",
      lastLogin: "2024-11-20",
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>User Management</CardTitle>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Email</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Last Login</th>
                <th className="px-6 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{user.name}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-600">{user.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 capitalize">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        user.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">
                      {user.lastLogin}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roles & Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-l-4 border-blue-600 pl-4">
              <h4 className="font-medium text-gray-900">Admin</h4>
              <p className="text-sm text-gray-500 mt-1">
                Full access to all features including server management, deployments,
                and user management.
              </p>
            </div>
            <div className="border-l-4 border-green-600 pl-4">
              <h4 className="font-medium text-gray-900">Developer</h4>
              <p className="text-sm text-gray-500 mt-1">
                Can deploy projects, manage environment variables, and view logs.
                Cannot access server settings or user management.
              </p>
            </div>
            <div className="border-l-4 border-gray-400 pl-4">
              <h4 className="font-medium text-gray-900">Viewer</h4>
              <p className="text-sm text-gray-500 mt-1">
                Read-only access to dashboards, projects, and deployments.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsSettings() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900">Deployment Success</p>
              <p className="text-sm text-gray-500">
                Notify when deployments complete successfully
              </p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>

          <label className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900">Deployment Failure</p>
              <p className="text-sm text-gray-500">
                Notify when deployments fail
              </p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>

          <label className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900">Server Alerts</p>
              <p className="text-sm text-gray-500">
                Notify on high CPU, memory, or disk usage
              </p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>

          <label className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-gray-900">SSL Expiry Warnings</p>
              <p className="text-sm text-gray-500">
                Notify 30 days before SSL certificates expire
              </p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>

          <Button>
            <Save className="mr-2 h-4 w-4" />
            Save Email Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Slack Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Webhook URL"
            placeholder="https://hooks.slack.com/services/..."
          />
          <Input label="Channel" placeholder="#deployments" />
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span className="text-sm text-gray-700">Deployment events</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span className="text-sm text-gray-700">Server alerts</span>
            </label>
          </div>
          <Button>
            <Save className="mr-2 h-4 w-4" />
            Save Slack Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SystemSettings() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-sm text-gray-500">CodeB Version</dt>
              <dd className="text-sm font-medium text-gray-900">v1.0.0</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-sm text-gray-500">Node.js Version</dt>
              <dd className="text-sm font-medium text-gray-900">v20.10.0</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-sm text-gray-500">Database</dt>
              <dd className="text-sm font-medium text-gray-900">PostgreSQL 15</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-sm text-gray-500">Uptime</dt>
              <dd className="text-sm font-medium text-gray-900">45d 12h 34m</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Maintenance Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="rounded" />
            <span className="text-sm text-gray-700">Enable maintenance mode</span>
          </label>
          <Input
            label="Maintenance Message"
            placeholder="System is under maintenance. Please check back later."
          />
          <Button variant="outline">Enable Maintenance Mode</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input label="Auto Backup Schedule" defaultValue="0 2 * * *" helper="Cron expression (daily at 2 AM)" />
          <Input label="Backup Retention (days)" defaultValue="30" />
          <div className="flex gap-2">
            <Button>Save Backup Settings</Button>
            <Button variant="outline">Backup Now</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
