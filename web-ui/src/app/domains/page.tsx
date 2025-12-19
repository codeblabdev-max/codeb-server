"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Search,
  Globe,
  Shield,
  ExternalLink,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

// Mock data
const domains = [
  {
    id: "1",
    domain: "videopick.codeb.kr",
    projectName: "videopick-web",
    environment: "production" as const,
    targetPort: 4001,
    sslStatus: "valid" as const,
    sslExpiry: "2025-03-17T00:00:00Z",
    dnsStatus: "active" as const,
    createdAt: "2024-11-01T10:00:00Z",
  },
  {
    id: "2",
    domain: "videopick-staging.codeb.kr",
    projectName: "videopick-web",
    environment: "staging" as const,
    targetPort: 3001,
    sslStatus: "valid" as const,
    sslExpiry: "2025-03-17T00:00:00Z",
    dnsStatus: "active" as const,
    createdAt: "2024-11-01T10:00:00Z",
  },
  {
    id: "3",
    domain: "api.codeb.kr",
    projectName: "api-gateway",
    environment: "production" as const,
    targetPort: 4002,
    sslStatus: "valid" as const,
    sslExpiry: "2025-02-20T00:00:00Z",
    dnsStatus: "active" as const,
    createdAt: "2024-10-15T08:00:00Z",
  },
  {
    id: "4",
    domain: "api-staging.codeb.kr",
    projectName: "api-gateway",
    environment: "staging" as const,
    targetPort: 3002,
    sslStatus: "pending" as const,
    sslExpiry: null,
    dnsStatus: "propagating" as const,
    createdAt: "2024-12-17T09:00:00Z",
  },
  {
    id: "5",
    domain: "admin.codeb.kr",
    projectName: "admin-panel",
    environment: "production" as const,
    targetPort: 4003,
    sslStatus: "valid" as const,
    sslExpiry: "2025-01-15T00:00:00Z",
    dnsStatus: "active" as const,
    createdAt: "2024-09-20T14:00:00Z",
  },
];

const sslStatusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  valid: { label: "Valid", color: "text-green-600", icon: CheckCircle },
  pending: { label: "Pending", color: "text-yellow-600", icon: Clock },
  expired: { label: "Expired", color: "text-red-600", icon: XCircle },
  error: { label: "Error", color: "text-red-600", icon: XCircle },
};

const dnsStatusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-green-100 text-green-700" },
  propagating: { label: "Propagating", color: "bg-yellow-100 text-yellow-700" },
  error: { label: "Error", color: "bg-red-100 text-red-700" },
};

export default function DomainsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEnv, setSelectedEnv] = useState<string | null>(null);

  const filteredDomains = domains.filter((domain) => {
    const matchesSearch =
      domain.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
      domain.projectName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEnv = !selectedEnv || domain.environment === selectedEnv;
    return matchesSearch && matchesEnv;
  });

  const getDaysUntilExpiry = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div className="flex flex-col">
      <Header
        title="Domains"
        description="Manage your domain configurations and SSL certificates"
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <Globe className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{domains.length}</p>
                  <p className="text-sm text-gray-500">Total Domains</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <Shield className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {domains.filter((d) => d.sslStatus === "valid").length}
                  </p>
                  <p className="text-sm text-gray-500">Valid SSL</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {domains.filter((d) => {
                      const days = getDaysUntilExpiry(d.sslExpiry);
                      return days !== null && days <= 30;
                    }).length}
                  </p>
                  <p className="text-sm text-gray-500">Expiring Soon</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                  <RefreshCw className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {domains.filter((d) => d.dnsStatus === "propagating").length}
                  </p>
                  <p className="text-sm text-gray-500">Propagating</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search domains..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Environment Filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedEnv(null)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  !selectedEnv ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setSelectedEnv("production")}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  selectedEnv === "production" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Production
              </button>
              <button
                onClick={() => setSelectedEnv("staging")}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  selectedEnv === "staging" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Staging
              </button>
            </div>
          </div>

          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Domain
          </Button>
        </div>

        {/* Domains Table */}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Domain
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Environment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    SSL Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    DNS Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Port
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredDomains.map((domain) => {
                  const sslConfig = sslStatusConfig[domain.sslStatus];
                  const dnsConfig = dnsStatusConfig[domain.dnsStatus];
                  const SslIcon = sslConfig.icon;
                  const daysUntilExpiry = getDaysUntilExpiry(domain.sslExpiry);

                  return (
                    <tr key={domain.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-gray-400" />
                          <a
                            href={`https://${domain.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-600 hover:underline"
                          >
                            {domain.domain}
                          </a>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{domain.projectName}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={domain.environment === "production" ? "info" : "default"}>
                          {domain.environment}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <SslIcon className={`h-4 w-4 ${sslConfig.color}`} />
                          <span className={`text-sm ${sslConfig.color}`}>{sslConfig.label}</span>
                          {daysUntilExpiry !== null && daysUntilExpiry <= 30 && (
                            <span className="text-xs text-yellow-600">
                              ({daysUntilExpiry}d left)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${dnsConfig.color}`}>
                          {dnsConfig.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-500">:{domain.targetPort}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Empty State */}
        {filteredDomains.length === 0 && (
          <div className="text-center py-12">
            <Globe className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-4 text-gray-500">No domains found</p>
            <Button className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Add your first domain
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
