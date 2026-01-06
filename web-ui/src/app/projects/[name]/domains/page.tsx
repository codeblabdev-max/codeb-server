"use client";

import { useState, useEffect, use } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { domainApi, slotApi, SlotRegistry, Domain } from "@/lib/api";
import {
  Globe,
  ExternalLink,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Info,
} from "lucide-react";

interface DomainsPageProps {
  params: Promise<{ name: string }>;
}

interface DomainWithStatus extends Domain {
  verified?: boolean;
  sslValid?: boolean;
  sslExpiry?: string;
}

export default function DomainsPage({ params }: DomainsPageProps) {
  const { name: projectName } = use(params);
  const [slots, setSlots] = useState<SlotRegistry[]>([]);
  const [domains, setDomains] = useState<DomainWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);

  // 도메인 추가 폼
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newEnvironment, setNewEnvironment] = useState<"production" | "staging">("production");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);

      // 슬롯 조회
      const allSlots = await slotApi.list();
      const projectSlots = allSlots.filter((s) => s.projectName === projectName);
      setSlots(projectSlots);

      // 도메인 조회
      try {
        const domainList = await domainApi.list(projectName);
        setDomains(domainList);
      } catch {
        setDomains([]);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectName]);

  // 슬롯에서 프리뷰 도메인 생성
  const previewDomains = slots.flatMap((slot) => {
    const domains = [];
    if (slot.blue.state !== "empty") {
      domains.push({
        url: `https://${projectName}-blue.preview.codeb.kr`,
        slot: "blue" as const,
        environment: slot.environment,
        isActive: slot.activeSlot === "blue",
        state: slot.blue.state,
      });
    }
    if (slot.green.state !== "empty") {
      domains.push({
        url: `https://${projectName}-green.preview.codeb.kr`,
        slot: "green" as const,
        environment: slot.environment,
        isActive: slot.activeSlot === "green",
        state: slot.green.state,
      });
    }
    return domains;
  });

  // 프로덕션 도메인
  const productionDomain = `https://${projectName}.codeb.kr`;

  const copyDomain = async (domain: string) => {
    await navigator.clipboard.writeText(domain);
    setCopiedDomain(domain);
    setTimeout(() => setCopiedDomain(null), 2000);
  };

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return;

    try {
      setIsAdding(true);
      setAddError(null);
      await domainApi.setup({
        projectName,
        domain: newDomain,
        environment: newEnvironment,
        ssl: true,
      });
      await fetchData();
      setNewDomain("");
      setShowAddForm(false);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "도메인 추가 실패");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteDomain = async (domain: string) => {
    if (!confirm(`도메인 ${domain}을(를) 삭제하시겠습니까?`)) return;

    try {
      await domainApi.delete(domain, projectName);
      await fetchData();
    } catch (error) {
      console.error("Failed to delete domain:", error);
    }
  };

  const handleVerifyDomain = async (domain: string) => {
    try {
      const result = await domainApi.verify(domain);
      alert(result.verified ? "DNS 검증 성공!" : "DNS 검증 실패. DNS 설정을 확인해 주세요.");
      await fetchData();
    } catch (error) {
      console.error("Verification failed:", error);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">도메인</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-2" />
            도메인 추가
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* 도메인 추가 폼 */}
          {showAddForm && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  커스텀 도메인 추가
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="example.com 또는 subdomain.example.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={newEnvironment}
                    onChange={(e) => setNewEnvironment(e.target.value as "production" | "staging")}
                    className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="production">프로덕션</option>
                    <option value="staging">스테이징</option>
                  </select>
                  <Button onClick={handleAddDomain} disabled={isAdding || !newDomain.trim()}>
                    {isAdding ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    추가
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddForm(false)}>
                    취소
                  </Button>
                </div>

                {addError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {addError}
                  </div>
                )}

                {/* DNS 설정 안내 */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">DNS 설정 방법</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        도메인에 다음 DNS 레코드 중 하나를 추가하세요:
                      </p>
                      <div className="space-y-3">
                        <div className="p-3 bg-white rounded border font-mono text-sm">
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <span className="text-gray-500">타입:</span>{" "}
                              <span className="font-semibold">CNAME</span>
                            </div>
                            <div>
                              <span className="text-gray-500">이름:</span>{" "}
                              <span className="font-semibold">@ 또는 서브도메인</span>
                            </div>
                            <div>
                              <span className="text-gray-500">값:</span>{" "}
                              <span className="font-semibold">{projectName}.codeb.kr</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-center text-sm text-gray-500">또는</div>
                        <div className="p-3 bg-white rounded border font-mono text-sm">
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <span className="text-gray-500">타입:</span>{" "}
                              <span className="font-semibold">A</span>
                            </div>
                            <div>
                              <span className="text-gray-500">이름:</span>{" "}
                              <span className="font-semibold">@ 또는 서브도메인</span>
                            </div>
                            <div>
                              <span className="text-gray-500">값:</span>{" "}
                              <span className="font-semibold">158.247.203.55</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-3">
                        DNS 검증 후 SSL 인증서가 자동으로 발급됩니다.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 프로덕션 도메인 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">프로덕션 도메인</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 rounded-lg bg-green-50 border border-green-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Globe className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <a
                      href={productionDomain}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-gray-900 hover:text-blue-600 flex items-center gap-1"
                    >
                      {productionDomain.replace("https://", "")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="bg-green-100 text-green-700">
                        <Shield className="h-3 w-3 mr-1" />
                        SSL
                      </Badge>
                      <Badge className="bg-green-100 text-green-700">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        활성
                      </Badge>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => copyDomain(productionDomain)}
                  className="p-2 rounded-lg hover:bg-green-100 transition-colors"
                >
                  {copiedDomain === productionDomain ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
            </CardContent>
          </Card>

          {/* 프리뷰 URL */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">프리뷰 URL (Blue-Green)</CardTitle>
            </CardHeader>
            <CardContent>
              {previewDomains.length > 0 ? (
                <div className="space-y-3">
                  {previewDomains.map((preview) => (
                    <div
                      key={preview.url}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        preview.isActive
                          ? "bg-blue-50 border-blue-200"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            preview.slot === "blue" ? "bg-blue-500" : "bg-green-500"
                          }`}
                        />
                        <div>
                          <a
                            href={preview.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-gray-900 hover:text-blue-600 flex items-center gap-1"
                          >
                            {preview.url.replace("https://", "")}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500 capitalize">
                              {preview.environment === "production" ? "프로덕션" :
                               preview.environment === "staging" ? "스테이징" : preview.environment}
                            </span>
                            {preview.isActive && (
                              <Badge variant="success" className="text-xs">
                                활성
                              </Badge>
                            )}
                            {preview.state === "deployed" && (
                              <Badge variant="warning" className="text-xs">
                                프리뷰
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => copyDomain(preview.url)}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        {copiedDomain === preview.url ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500">
                  프리뷰 URL이 없습니다. 배포하면 프리뷰 URL이 생성됩니다.
                </div>
              )}
            </CardContent>
          </Card>

          {/* 커스텀 도메인 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">커스텀 도메인</CardTitle>
            </CardHeader>
            <CardContent>
              {domains.length > 0 ? (
                <div className="space-y-3">
                  {domains.map((domain) => (
                    <div
                      key={domain.domain}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <Globe className="h-5 w-5 text-gray-400" />
                        <div>
                          <a
                            href={`https://${domain.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-gray-900 hover:text-blue-600 flex items-center gap-1"
                          >
                            {domain.domain}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500">
                              {domain.environment === "production" ? "프로덕션" : "스테이징"}
                            </span>
                            {domain.sslEnabled ? (
                              <Badge className="bg-green-100 text-green-700 text-xs">
                                <Shield className="h-3 w-3 mr-1" />
                                SSL
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-700 text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                SSL 대기
                              </Badge>
                            )}
                            {domain.status === "active" ? (
                              <Badge className="bg-green-100 text-green-700 text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                검증됨
                              </Badge>
                            ) : domain.status === "pending" ? (
                              <Badge className="bg-yellow-100 text-yellow-700 text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                대기 중
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-700 text-xs">
                                <XCircle className="h-3 w-3 mr-1" />
                                오류
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {domain.status !== "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVerifyDomain(domain.domain)}
                          >
                            DNS 검증
                          </Button>
                        )}
                        <button
                          onClick={() => handleDeleteDomain(domain.domain)}
                          className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500">
                  <p>설정된 커스텀 도메인이 없습니다</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => setShowAddForm(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    첫 번째 도메인 추가
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
