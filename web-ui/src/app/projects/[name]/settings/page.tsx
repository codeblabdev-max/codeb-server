"use client";

import { useState, useEffect, use } from "react";
import { EnvironmentSubTabs } from "@/components/project/EnvironmentSubTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { envApi, slotApi, SlotRegistry } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import {
  Eye,
  EyeOff,
  Plus,
  Trash2,
  RefreshCw,
  Download,
  Upload,
  History,
  RotateCcw,
  Loader2,
  Copy,
  Check,
} from "lucide-react";

type Environment = "production" | "staging" | "preview";

interface SettingsPageProps {
  params: Promise<{ name: string }>;
}

interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;
}

export default function SettingsPage({ params }: SettingsPageProps) {
  const { name: projectName } = use(params);
  const [environment, setEnvironment] = useState<Environment>("production");
  const [variables, setVariables] = useState<EnvVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [backups, setBackups] = useState<string[]>([]);
  const [showBackups, setShowBackups] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [slots, setSlots] = useState<SlotRegistry[]>([]);

  // 새 변수 입력 폼
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchData = async () => {
    try {
      setIsLoading(true);

      // 슬롯 조회하여 사용 가능한 환경 확인
      const allSlots = await slotApi.list();
      const projectSlots = allSlots.filter((s) => s.projectName === projectName);
      setSlots(projectSlots);

      // 환경 변수 조회
      try {
        const envData = await envApi.get(projectName, environment);
        if (envData && typeof envData === "object") {
          const vars: EnvVariable[] = Object.entries(envData).map(([key, value]) => ({
            key,
            value: String(value),
            isSecret: key.includes("SECRET") || key.includes("PASSWORD") || key.includes("KEY"),
          }));
          setVariables(vars);
        }
      } catch {
        setVariables([]);
      }

      // 백업 목록 조회
      try {
        const backupData = await envApi.backups(projectName, environment);
        setBackups(backupData?.backups || []);
      } catch {
        setBackups([]);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectName, environment]);

  // 사용 가능한 환경 목록
  const availableEnvironments = slots.map((s) => s.environment) as Environment[];

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const copyValue = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRestore = async (version: "master" | "current" | string) => {
    try {
      setRestoring(true);
      await envApi.restore(projectName, environment, version);
      await fetchData();
    } catch (error) {
      console.error("Restore failed:", error);
    } finally {
      setRestoring(false);
      setShowBackups(false);
    }
  };

  const handleAddVariable = async () => {
    if (!newKey.trim() || !newValue.trim()) return;

    try {
      const newVars = { ...Object.fromEntries(variables.map((v) => [v.key, v.value])), [newKey]: newValue };
      await envApi.set(projectName, environment, newVars);
      await fetchData();
      setNewKey("");
      setNewValue("");
      setShowAddForm(false);
    } catch (error) {
      console.error("Add variable failed:", error);
    }
  };

  const handleDeleteVariable = async (keyToDelete: string) => {
    try {
      const newVars = Object.fromEntries(
        variables.filter((v) => v.key !== keyToDelete).map((v) => [v.key, v.value])
      );
      await envApi.set(projectName, environment, newVars);
      await fetchData();
    } catch (error) {
      console.error("Delete variable failed:", error);
    }
  };

  const maskValue = (value: string) => {
    if (value.length <= 8) return "••••••••";
    return value.slice(0, 4) + "••••••••" + value.slice(-4);
  };

  return (
    <div className="p-6 space-y-6">
      {/* 환경 선택 */}
      <div className="flex items-center justify-between">
        <EnvironmentSubTabs
          selected={environment}
          onChange={setEnvironment}
          availableEnvironments={
            availableEnvironments.length > 0
              ? availableEnvironments
              : ["production", "staging"]
          }
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBackups(!showBackups)}>
            <History className="h-4 w-4 mr-2" />
            백업
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* 백업 복구 패널 */}
      {showBackups && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              백업 및 복구
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant="outline"
                onClick={() => handleRestore("master")}
                disabled={restoring}
                className="justify-start"
              >
                {restoring ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-2" />
                )}
                Master에서 복구
                <span className="ml-auto text-xs text-gray-500">원본 백업</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => handleRestore("current")}
                disabled={restoring}
                className="justify-start"
              >
                {restoring ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-2" />
                )}
                최신 백업에서 복구
                <span className="ml-auto text-xs text-gray-500">최근 백업</span>
              </Button>
            </div>

            {backups.length > 0 && (
              <div>
                <p className="text-sm text-gray-500 mb-2">이전 버전:</p>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {backups.slice(0, 5).map((backup) => (
                    <button
                      key={backup}
                      onClick={() => handleRestore(backup)}
                      className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      {formatRelativeTime(backup)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 환경 변수 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">환경 변수</CardTitle>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-2" />
            변수 추가
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-2">
              {/* 변수 추가 폼 */}
              {showAddForm && (
                <div className="flex gap-2 p-3 bg-gray-50 rounded-lg mb-4">
                  <input
                    type="text"
                    placeholder="키"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                    className="flex-1 px-3 py-2 text-sm font-mono border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="값"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm font-mono border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Button size="sm" onClick={handleAddVariable}>
                    추가
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>
                    취소
                  </Button>
                </div>
              )}

              {/* 변수 목록 */}
              {variables.length > 0 ? (
                variables.map((variable) => (
                  <div
                    key={variable.key}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    {/* 키 */}
                    <div className="w-48 flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{variable.key}</span>
                      {variable.isSecret && (
                        <Badge variant="secondary" className="text-xs">
                          민감정보
                        </Badge>
                      )}
                    </div>

                    {/* 값 */}
                    <div className="flex-1 font-mono text-sm text-gray-600">
                      {revealedKeys.has(variable.key) ? variable.value : maskValue(variable.value)}
                    </div>

                    {/* 액션 */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleReveal(variable.key)}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        title={revealedKeys.has(variable.key) ? "숨기기" : "보기"}
                      >
                        {revealedKeys.has(variable.key) ? (
                          <EyeOff className="h-4 w-4 text-gray-500" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                      <button
                        onClick={() => copyValue(variable.key, variable.value)}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        title="값 복사"
                      >
                        {copiedKey === variable.key ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteVariable(variable.key)}
                        className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  설정된 환경 변수가 없습니다
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
