"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Plus,
  Key,
  Eye,
  EyeOff,
  Copy,
  Edit,
  Trash2,
  Lock,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

// Mock data
const projects = [
  { id: "1", name: "videopick-web" },
  { id: "2", name: "api-gateway" },
  { id: "3", name: "admin-panel" },
  { id: "4", name: "landing-page" },
];

const environmentVariables = {
  "videopick-web": {
    production: [
      {
        id: "1",
        key: "DATABASE_URL",
        value: "postgres://user:pass@db.example.com:5432/prod",
        secure: true,
        required: true,
        updatedAt: "2024-12-15T10:00:00Z",
      },
      {
        id: "2",
        key: "NEXT_PUBLIC_API_URL",
        value: "https://api.videopick.codeb.kr",
        secure: false,
        required: true,
        updatedAt: "2024-12-10T14:30:00Z",
      },
      {
        id: "3",
        key: "SECRET_KEY",
        value: "super-secret-key-here-1234567890",
        secure: true,
        required: true,
        updatedAt: "2024-11-20T09:15:00Z",
      },
      {
        id: "4",
        key: "REDIS_URL",
        value: "redis://localhost:6379",
        secure: true,
        required: false,
        updatedAt: "2024-12-01T16:45:00Z",
      },
    ],
    staging: [
      {
        id: "5",
        key: "DATABASE_URL",
        value: "postgres://user:pass@db.example.com:5432/staging",
        secure: true,
        required: true,
        updatedAt: "2024-12-15T10:00:00Z",
      },
      {
        id: "6",
        key: "NEXT_PUBLIC_API_URL",
        value: "https://api-staging.videopick.codeb.kr",
        secure: false,
        required: true,
        updatedAt: "2024-12-10T14:30:00Z",
      },
    ],
  },
  "api-gateway": {
    production: [
      {
        id: "7",
        key: "JWT_SECRET",
        value: "jwt-secret-production-key",
        secure: true,
        required: true,
        updatedAt: "2024-11-25T11:00:00Z",
      },
      {
        id: "8",
        key: "AWS_ACCESS_KEY_ID",
        value: "AKIAIOSFODNN7EXAMPLE",
        secure: true,
        required: false,
        updatedAt: "2024-12-05T08:20:00Z",
      },
    ],
    staging: [],
  },
};

export default function EnvPage() {
  const [selectedProject, setSelectedProject] = useState(projects[0].name);
  const [selectedEnv, setSelectedEnv] = useState<"production" | "staging">(
    "production"
  );
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [isAddingNew, setIsAddingNew] = useState(false);

  const currentVars =
    (environmentVariables[
      selectedProject as keyof typeof environmentVariables
    ]?.[selectedEnv] as typeof environmentVariables["videopick-web"]["production"]) || [];

  const toggleShowValue = (id: string) => {
    setShowValues((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
    // TODO: Show toast notification
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
  };

  const handleCancelAdd = () => {
    setIsAddingNew(false);
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="환경 변수"
        description="프로젝트 환경 변수 관리"
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Project & Environment Selector */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 max-w-xs">
            <Select
              label="프로젝트"
              value={selectedProject}
              onChange={setSelectedProject}
              options={projects.map((p) => ({ value: p.name, label: p.name }))}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setSelectedEnv("production")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                selectedEnv === "production"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              프로덕션
            </button>
            <button
              onClick={() => setSelectedEnv("staging")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                selectedEnv === "staging"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              스테이징
            </button>
          </div>

          <Button onClick={handleAddNew} className="ml-auto">
            <Plus className="mr-2 h-4 w-4" />
            변수 추가
          </Button>
        </div>

        {/* Warning for Production */}
        {selectedEnv === "production" && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-yellow-900">
                    프로덕션 환경
                  </h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    프로덕션 변수 변경은 배포 후 적용됩니다. 먼저 스테이징에서
                    테스트하세요.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <Key className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{currentVars.length}</p>
                  <p className="text-sm text-gray-500">전체 변수</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {currentVars.filter((v) => v.required).length}
                  </p>
                  <p className="text-sm text-gray-500">필수</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <Lock className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {currentVars.filter((v) => v.secure).length}
                  </p>
                  <p className="text-sm text-gray-500">보안</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                  <CheckCircle className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {currentVars.filter((v) => !v.required).length}
                  </p>
                  <p className="text-sm text-gray-500">선택</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Variables Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              환경 변수
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({selectedProject} - {selectedEnv === "production" ? "프로덕션" : "스테이징"})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {currentVars.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Key className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">
                  환경 변수 없음
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  첫 번째 환경 변수를 추가하세요
                </p>
                <Button onClick={handleAddNew} className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  변수 추가
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                      <th className="px-6 py-3 font-medium">키</th>
                      <th className="px-6 py-3 font-medium">값</th>
                      <th className="px-6 py-3 font-medium">타입</th>
                      <th className="px-6 py-3 font-medium">필수 여부</th>
                      <th className="px-6 py-3 font-medium">마지막 수정</th>
                      <th className="px-6 py-3 font-medium">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentVars.map((variable) => (
                      <tr
                        key={variable.id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono font-medium text-gray-900">
                              {variable.key}
                            </code>
                            {variable.secure && (
                              <Lock className="h-3 w-3 text-gray-400" />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 max-w-md">
                            {variable.secure && !showValues[variable.id] ? (
                              <code className="text-sm font-mono text-gray-400">
                                ••••••••••••••••
                              </code>
                            ) : (
                              <code className="text-sm font-mono text-gray-700 truncate">
                                {variable.value}
                              </code>
                            )}
                            {variable.secure && (
                              <button
                                onClick={() => toggleShowValue(variable.id)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                {showValues[variable.id] ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => copyToClipboard(variable.value)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {variable.secure ? (
                            <Badge variant="warning">보안</Badge>
                          ) : (
                            <Badge variant="default">공개</Badge>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {variable.required ? (
                            <Badge variant="error">필수</Badge>
                          ) : (
                            <Badge variant="default">선택</Badge>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-500">
                            {new Date(variable.updatedAt).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add New Variable Form */}
        {isAddingNew && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle>새 환경 변수 추가</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="키" placeholder="DATABASE_URL" />
                <Input label="값" placeholder="postgres://..." />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" />
                  <span className="text-sm text-gray-700">보안 (값 숨기기)</span>
                </label>

                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" />
                  <span className="text-sm text-gray-700">필수</span>
                </label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button>변수 저장</Button>
                <Button variant="outline" onClick={handleCancelAdd}>
                  취소
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
