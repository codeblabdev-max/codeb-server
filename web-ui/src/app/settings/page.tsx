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
    { id: "general" as const, label: "일반", icon: Settings },
    { id: "api-keys" as const, label: "API 키", icon: Key },
    { id: "users" as const, label: "사용자", icon: Users },
    { id: "notifications" as const, label: "알림", icon: Bell },
    { id: "system" as const, label: "시스템", icon: Cog },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="설정"
        description="CodeB 설정 관리"
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
          <CardTitle>대시보드 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input label="기본 새로고침 간격 (초)" defaultValue="30" />
          <Input label="시간대" defaultValue="Asia/Seoul" />
          <Input label="날짜 형식" defaultValue="YYYY-MM-DD" />
          <Button>
            <Save className="mr-2 h-4 w-4" />
            변경사항 저장
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>배포 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span className="text-sm text-gray-700">
                Git push 시 자동 배포
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span className="text-sm text-gray-700">
                배포 알림 전송
              </span>
            </label>
          </div>
          <Input label="빌드 타임아웃 (분)" defaultValue="10" />
          <Input label="최대 동시 배포 수" defaultValue="3" />
          <Button>
            <Save className="mr-2 h-4 w-4" />
            변경사항 저장
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>도메인 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input label="기본 도메인 접미사" defaultValue="codeb.kr" />
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="rounded" />
            <span className="text-sm text-gray-700">자동 SSL (Let's Encrypt)</span>
          </label>
          <Button>
            <Save className="mr-2 h-4 w-4" />
            변경사항 저장
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
      name: "프로덕션 배포 키",
      key: "codeb_prod_1234567890abcdef",
      permissions: "읽기-쓰기",
      createdAt: "2024-11-15",
      lastUsed: "2024-12-19",
    },
    {
      id: "2",
      name: "CI/CD 파이프라인 키",
      key: "codeb_ci_0987654321fedcba",
      permissions: "읽기 전용",
      createdAt: "2024-10-20",
      lastUsed: "2024-12-18",
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>API 키</CardTitle>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            API 키 생성
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                <th className="px-6 py-3 font-medium">이름</th>
                <th className="px-6 py-3 font-medium">API 키</th>
                <th className="px-6 py-3 font-medium">권한</th>
                <th className="px-6 py-3 font-medium">마지막 사용</th>
                <th className="px-6 py-3 font-medium">작업</th>
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
                      생성일 {apiKey.createdAt}
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
                    <span className="text-sm text-gray-600">
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
          <CardTitle>Webhook URL</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="배포 Webhook"
            defaultValue="https://hooks.example.com/deployments"
            helper="모든 배포 이벤트에서 트리거됨"
          />
          <Input
            label="모니터링 Webhook"
            defaultValue="https://hooks.example.com/monitoring"
            helper="서버 알림에서 트리거됨"
          />
          <Button>
            <Save className="mr-2 h-4 w-4" />
            Webhook 저장
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
      name: "관리자",
      email: "admin@example.com",
      role: "관리자",
      status: "활성",
      lastLogin: "2024-12-19",
    },
    {
      id: "2",
      name: "개발자 1",
      email: "dev1@example.com",
      role: "개발자",
      status: "활성",
      lastLogin: "2024-12-18",
    },
    {
      id: "3",
      name: "뷰어 사용자",
      email: "viewer@example.com",
      role: "뷰어",
      status: "비활성",
      lastLogin: "2024-11-20",
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>사용자 관리</CardTitle>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            사용자 추가
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                <th className="px-6 py-3 font-medium">이름</th>
                <th className="px-6 py-3 font-medium">이메일</th>
                <th className="px-6 py-3 font-medium">역할</th>
                <th className="px-6 py-3 font-medium">상태</th>
                <th className="px-6 py-3 font-medium">마지막 로그인</th>
                <th className="px-6 py-3 font-medium">작업</th>
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
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        user.status === "활성"
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
                        수정
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
          <CardTitle>역할 및 권한</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-l-4 border-blue-600 pl-4">
              <h4 className="font-medium text-gray-900">관리자</h4>
              <p className="text-sm text-gray-500 mt-1">
                서버 관리, 배포, 사용자 관리를 포함한 모든 기능에 대한 전체 접근
                권한이 있습니다.
              </p>
            </div>
            <div className="border-l-4 border-green-600 pl-4">
              <h4 className="font-medium text-gray-900">개발자</h4>
              <p className="text-sm text-gray-500 mt-1">
                프로젝트 배포, 환경 변수 관리, 로그 조회가 가능합니다. 서버 설정
                또는 사용자 관리에는 접근할 수 없습니다.
              </p>
            </div>
            <div className="border-l-4 border-gray-400 pl-4">
              <h4 className="font-medium text-gray-900">뷰어</h4>
              <p className="text-sm text-gray-500 mt-1">
                대시보드, 프로젝트, 배포에 대한 읽기 전용 접근 권한이 있습니다.
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
          <CardTitle>이메일 알림</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900">배포 성공</p>
              <p className="text-sm text-gray-500">
                배포가 성공적으로 완료되면 알림
              </p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>

          <label className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900">배포 실패</p>
              <p className="text-sm text-gray-500">
                배포가 실패하면 알림
              </p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>

          <label className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900">서버 알림</p>
              <p className="text-sm text-gray-500">
                높은 CPU, 메모리 또는 디스크 사용량 알림
              </p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>

          <label className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-gray-900">SSL 만료 경고</p>
              <p className="text-sm text-gray-500">
                SSL 인증서 만료 30일 전 알림
              </p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>

          <Button>
            <Save className="mr-2 h-4 w-4" />
            이메일 설정 저장
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Slack 연동</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Webhook URL"
            placeholder="https://hooks.slack.com/services/..."
          />
          <Input label="채널" placeholder="#deployments" />
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span className="text-sm text-gray-700">배포 이벤트</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span className="text-sm text-gray-700">서버 알림</span>
            </label>
          </div>
          <Button>
            <Save className="mr-2 h-4 w-4" />
            Slack 설정 저장
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
          <CardTitle>시스템 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-sm text-gray-500">CodeB 버전</dt>
              <dd className="text-sm font-medium text-gray-900">v1.0.0</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-sm text-gray-500">Node.js 버전</dt>
              <dd className="text-sm font-medium text-gray-900">v20.10.0</dd>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <dt className="text-sm text-gray-500">데이터베이스</dt>
              <dd className="text-sm font-medium text-gray-900">PostgreSQL 15</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-sm text-gray-500">가동 시간</dt>
              <dd className="text-sm font-medium text-gray-900">45일 12시간 34분</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>유지보수 모드</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="rounded" />
            <span className="text-sm text-gray-700">유지보수 모드 활성화</span>
          </label>
          <Input
            label="유지보수 메시지"
            placeholder="시스템 점검 중입니다. 나중에 다시 확인해 주세요."
          />
          <Button variant="outline">유지보수 모드 활성화</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>백업 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input label="자동 백업 일정" defaultValue="0 2 * * *" helper="Cron 표현식 (매일 오전 2시)" />
          <Input label="백업 보존 기간 (일)" defaultValue="30" />
          <div className="flex gap-2">
            <Button>백업 설정 저장</Button>
            <Button variant="outline">지금 백업</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
