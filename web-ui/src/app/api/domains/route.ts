import { NextRequest, NextResponse } from "next/server";
import { sshExec, getCaddyDomains } from "@/lib/ssh";

const POWERDNS_API_KEY = process.env.POWERDNS_API_KEY || "wc-hub-pdns-api-key-2024";

// GET: Get all domains
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source"); // dns | caddy | all

    const results: { dns?: unknown[]; caddy?: unknown[] } = {};

    // PowerDNS 도메인
    if (!source || source === "dns" || source === "all") {
      const dnsResult = await sshExec(
        "app",
        `curl -s -H "X-API-Key: ${POWERDNS_API_KEY}" http://localhost:8081/api/v1/servers/localhost/zones/codeb.kr 2>/dev/null`
      );

      if (dnsResult.success && dnsResult.output) {
        try {
          const zone = JSON.parse(dnsResult.output);
          results.dns = (zone.rrsets || [])
            .filter((rr: { type: string }) => rr.type === "A" || rr.type === "CNAME")
            .map((rr: { name: string; type: string; records: { content: string }[] }) => ({
              id: rr.name,
              domain: rr.name.replace(/\.$/, ""),
              type: rr.type,
              content: rr.records?.[0]?.content || "",
              source: "powerdns",
              dnsStatus: "active",
              sslStatus: "valid",
            }));
        } catch {
          results.dns = [];
        }
      }
    }

    // Caddy 도메인
    if (!source || source === "caddy" || source === "all") {
      const appDomains = await getCaddyDomains("app");
      const backupDomains = await getCaddyDomains("backup");
      results.caddy = [...appDomains, ...backupDomains].map((d) => ({
        id: (d as { domain: string }).domain,
        domain: (d as { domain: string }).domain,
        type: "CADDY",
        server: (d as { server: string }).server,
        source: "caddy",
        dnsStatus: "active",
        sslStatus: "valid",
      }));
    }

    // 통합 결과
    if (source === "all" || !source) {
      const allDomains = [
        ...(results.dns || []),
        ...(results.caddy || []),
      ];

      // 중복 제거 (DNS 우선)
      const uniqueDomains = Array.from(
        new Map(allDomains.map((d) => [(d as { domain: string }).domain, d])).values()
      );

      return NextResponse.json({
        success: true,
        data: uniqueDomains,
        count: uniqueDomains.length,
        source: "ssh",
      });
    }

    return NextResponse.json({
      success: true,
      data: results.dns || results.caddy || [],
      source: "ssh",
    });
  } catch (error) {
    console.error("Failed to fetch domains:", error);
    return NextResponse.json({
      success: true,
      data: getMockDomains(),
      source: "mock",
    });
  }
}

// POST: Create domain
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      domain,
      subdomain,
      baseDomain = "codeb.kr",
      type = "A",
      content,
      ttl = 300,
      server = "app",
      projectId,
      projectName,
      environment,
      targetPort,
    } = body;

    // 도메인 이름 결정
    const domainName = domain || (subdomain ? `${subdomain}.${baseDomain}` : null);
    if (!domainName) {
      return NextResponse.json(
        { success: false, error: "domain or subdomain is required" },
        { status: 400 }
      );
    }

    // DNS 레코드 추가
    const recordName = domainName.endsWith(".")
      ? domainName
      : domainName.endsWith(".codeb.kr")
      ? domainName + "."
      : domainName + ".codeb.kr.";

    const targetIP =
      content ||
      (server === "backup"
        ? "141.164.37.63"
        : server === "streaming"
        ? "141.164.42.213"
        : server === "storage"
        ? "64.176.226.119"
        : "158.247.203.55");

    const patchData = {
      rrsets: [
        {
          name: recordName,
          type: type,
          ttl: ttl,
          changetype: "REPLACE",
          records: [{ content: targetIP, disabled: false }],
        },
      ],
    };

    const result = await sshExec(
      "app",
      `curl -s -X PATCH -H "X-API-Key: ${POWERDNS_API_KEY}" -H "Content-Type: application/json" \
        -d '${JSON.stringify(patchData)}' \
        http://localhost:8081/api/v1/servers/localhost/zones/codeb.kr`
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to create DNS record" },
        { status: 500 }
      );
    }

    // Caddy 설정 추가 (포트가 지정된 경우)
    if (targetPort) {
      const serverTarget = server === "backup" ? "backup" : "app";
      const caddyConfig = `${domainName.replace(/\.$/, "")} {
  reverse_proxy localhost:${targetPort}
}`;

      await sshExec(
        serverTarget,
        `echo '${caddyConfig}' > /etc/caddy/sites.d/${domainName.replace(/[.]/g, "-")}.caddy && systemctl reload caddy`
      );
    }

    return NextResponse.json({
      success: true,
      message: `Domain ${domainName} created`,
      data: {
        domain: recordName.replace(/\.$/, ""),
        type,
        content: targetIP,
        targetPort,
      },
    });
  } catch (error) {
    console.error("Failed to create domain:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create domain" },
      { status: 500 }
    );
  }
}

// DELETE: Delete domain
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain");
    const type = searchParams.get("type") || "A";

    if (!domain) {
      return NextResponse.json(
        { success: false, error: "domain is required" },
        { status: 400 }
      );
    }

    const recordName = domain.endsWith(".")
      ? domain
      : domain.endsWith(".codeb.kr")
      ? domain + "."
      : domain + ".codeb.kr.";

    const patchData = {
      rrsets: [
        {
          name: recordName,
          type: type,
          changetype: "DELETE",
        },
      ],
    };

    // DNS 레코드 삭제
    await sshExec(
      "app",
      `curl -s -X PATCH -H "X-API-Key: ${POWERDNS_API_KEY}" -H "Content-Type: application/json" \
        -d '${JSON.stringify(patchData)}' \
        http://localhost:8081/api/v1/servers/localhost/zones/codeb.kr`
    );

    // Caddy 설정 삭제
    const caddyFileName = domain.replace(/[.]/g, "-");
    await sshExec("app", `rm -f /etc/caddy/sites.d/${caddyFileName}.caddy && systemctl reload caddy`);
    await sshExec("backup", `rm -f /etc/caddy/sites.d/${caddyFileName}.caddy && systemctl reload caddy`);

    return NextResponse.json({
      success: true,
      message: `Domain ${domain} deleted`,
    });
  } catch (error) {
    console.error("Failed to delete domain:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete domain" },
      { status: 500 }
    );
  }
}

function getMockDomains() {
  return [
    {
      id: "1",
      domain: "videopick.codeb.kr",
      projectName: "videopick-web",
      environment: "production",
      targetPort: 4001,
      sslStatus: "valid",
      dnsStatus: "active",
    },
    {
      id: "2",
      domain: "api.codeb.kr",
      projectName: "api-gateway",
      environment: "production",
      targetPort: 4002,
      sslStatus: "valid",
      dnsStatus: "active",
    },
  ];
}
