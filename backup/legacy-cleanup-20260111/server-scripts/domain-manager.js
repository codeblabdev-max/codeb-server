#!/usr/bin/env node

/**
 * CodeB Domain Manager
 *
 * PowerDNS + Caddy + SSL 자동화
 *
 * 기능:
 * 1. PowerDNS API를 통한 DNS 레코드 자동 생성/삭제
 * 2. Caddy 설정 파일 자동 생성/업데이트
 * 3. Let's Encrypt SSL 자동 발급 (Caddy)
 * 4. SSOT Registry 연동
 *
 * 서버: 158.247.203.55
 * 위치: /opt/codeb/ssot-registry/domain-manager.js
 */

const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

// ==================== Configuration ====================

const CONFIG = {
  // PowerDNS Configuration
  powerdns: {
    apiUrl: 'http://localhost:8081/api/v1',
    apiKey: process.env.PDNS_API_KEY || 'changeme',
    serverID: 'localhost',
    zone: process.env.DNS_ZONE || 'codeb.kr',
    nameservers: ['n1.codeb.kr', 'n2.codeb.kr'],
  },

  // Caddy Configuration
  caddy: {
    configDir: '/etc/caddy',
    sitesDir: '/etc/caddy/sites',
    mainConfig: '/etc/caddy/Caddyfile',
    reloadCommand: 'systemctl reload caddy',
  },

  // SSOT Registry
  ssot: {
    url: 'http://localhost:3102',
  },

  // Server IP
  serverIP: '158.247.203.55',

  // API Server
  port: 3103,
};

// ==================== PowerDNS API Client ====================

class PowerDNSClient {
  constructor(config) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
    this.serverID = config.serverID;
    this.zone = config.zone;

    this.client = axios.create({
      baseURL: `${this.apiUrl}/servers/${this.serverID}`,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * DNS 존 확인 (없으면 생성)
   */
  async ensureZone() {
    try {
      await this.client.get(`/zones/${this.zone}`);
      console.log(`✓ Zone ${this.zone} exists`);
      return true;
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`Creating zone ${this.zone}...`);
        await this.createZone();
        return true;
      }
      throw error;
    }
  }

  /**
   * DNS 존 생성
   */
  async createZone() {
    const zoneData = {
      name: this.zone + '.',
      kind: 'Native',
      masters: [],
      nameservers: CONFIG.powerdns.nameservers.map(ns => ns + '.'),
    };

    await this.client.post('/zones', zoneData);
    console.log(`✓ Zone ${this.zone} created`);
  }

  /**
   * A 레코드 추가
   */
  async addARecord(subdomain, ipAddress, ttl = 300) {
    const fqdn = subdomain ? `${subdomain}.${this.zone}.` : `${this.zone}.`;

    const rrsets = {
      rrsets: [
        {
          name: fqdn,
          type: 'A',
          ttl: ttl,
          changetype: 'REPLACE',
          records: [
            {
              content: ipAddress,
              disabled: false,
            },
          ],
        },
      ],
    };

    try {
      await this.client.patch(`/zones/${this.zone}`, rrsets);
      console.log(`✓ DNS A record created: ${fqdn} -> ${ipAddress}`);
      return { success: true, fqdn, ip: ipAddress };
    } catch (error) {
      console.error(`✗ Failed to create DNS record:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * A 레코드 삭제
   */
  async deleteARecord(subdomain) {
    const fqdn = subdomain ? `${subdomain}.${this.zone}.` : `${this.zone}.`;

    const rrsets = {
      rrsets: [
        {
          name: fqdn,
          type: 'A',
          changetype: 'DELETE',
        },
      ],
    };

    try {
      await this.client.patch(`/zones/${this.zone}`, rrsets);
      console.log(`✓ DNS A record deleted: ${fqdn}`);
      return { success: true, fqdn };
    } catch (error) {
      console.error(`✗ Failed to delete DNS record:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 레코드 조회
   */
  async getRecord(subdomain) {
    const fqdn = subdomain ? `${subdomain}.${this.zone}.` : `${this.zone}.`;

    try {
      const response = await this.client.get(`/zones/${this.zone}`);
      const zone = response.data;

      const record = zone.rrsets.find(r => r.name === fqdn && r.type === 'A');
      return record || null;
    } catch (error) {
      console.error(`✗ Failed to get DNS record:`, error.response?.data || error.message);
      return null;
    }
  }

  /**
   * 모든 A 레코드 조회
   */
  async listARecords() {
    try {
      const response = await this.client.get(`/zones/${this.zone}`);
      const zone = response.data;

      return zone.rrsets
        .filter(r => r.type === 'A')
        .map(r => ({
          name: r.name,
          type: r.type,
          ttl: r.ttl,
          records: r.records.map(rec => rec.content),
        }));
    } catch (error) {
      console.error(`✗ Failed to list DNS records:`, error.response?.data || error.message);
      return [];
    }
  }
}

// ==================== Caddy Configuration Manager ====================

class CaddyManager {
  constructor(config) {
    this.configDir = config.configDir;
    this.sitesDir = config.sitesDir;
    this.mainConfig = config.mainConfig;
    this.reloadCommand = config.reloadCommand;
  }

  /**
   * 사이트 디렉토리 확인 (없으면 생성)
   */
  async ensureSitesDir() {
    try {
      await fs.mkdir(this.sitesDir, { recursive: true });
      console.log(`✓ Sites directory ready: ${this.sitesDir}`);
    } catch (error) {
      console.error(`✗ Failed to create sites directory:`, error.message);
      throw error;
    }
  }

  /**
   * 메인 Caddyfile에 import 구문 추가
   */
  async ensureImportStatement() {
    try {
      const mainConfigContent = await fs.readFile(this.mainConfig, 'utf8');
      const importStatement = 'import sites/*.caddy';

      if (!mainConfigContent.includes(importStatement)) {
        const newContent = mainConfigContent + '\n' + importStatement + '\n';
        await fs.writeFile(this.mainConfig, newContent);
        console.log(`✓ Added import statement to ${this.mainConfig}`);
      }
    } catch (error) {
      console.error(`✗ Failed to update main Caddyfile:`, error.message);
      throw error;
    }
  }

  /**
   * Caddy 사이트 설정 생성
   */
  async createSiteConfig(domain, targetPort, options = {}) {
    const {
      enableSSL = true,
      enableGzip = true,
      enableLogs = true,
      customHeaders = {},
    } = options;

    const configPath = path.join(this.sitesDir, `${domain}.caddy`);

    let config = `# ${domain} - Auto-generated by CodeB Domain Manager
${domain} {
  # Reverse proxy to application
  reverse_proxy localhost:${targetPort}

`;

    // SSL 설정
    if (enableSSL) {
      config += `  # Automatic HTTPS with Let's Encrypt
  tls {
    protocols tls1.2 tls1.3
  }

`;
    }

    // Gzip 압축
    if (enableGzip) {
      config += `  # Gzip compression
  encode gzip

`;
    }

    // Custom headers
    if (Object.keys(customHeaders).length > 0) {
      config += `  # Custom headers\n`;
      for (const [key, value] of Object.entries(customHeaders)) {
        config += `  header ${key} "${value}"\n`;
      }
      config += '\n';
    }

    // Security headers
    config += `  # Security headers
  header {
    X-Frame-Options "SAMEORIGIN"
    X-Content-Type-Options "nosniff"
    X-XSS-Protection "1; mode=block"
    Referrer-Policy "strict-origin-when-cross-origin"
  }

`;

    // Logs
    if (enableLogs) {
      config += `  # Access logs
  log {
    output file /var/log/caddy/${domain}.log {
      roll_size 10mb
      roll_keep 5
    }
  }
`;
    }

    config += `}
`;

    try {
      await fs.writeFile(configPath, config);
      console.log(`✓ Caddy config created: ${configPath}`);
      return { success: true, configPath, config };
    } catch (error) {
      console.error(`✗ Failed to create Caddy config:`, error.message);
      throw error;
    }
  }

  /**
   * Caddy 사이트 설정 삭제
   */
  async deleteSiteConfig(domain) {
    const configPath = path.join(this.sitesDir, `${domain}.caddy`);

    try {
      await fs.unlink(configPath);
      console.log(`✓ Caddy config deleted: ${configPath}`);
      return { success: true, configPath };
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`⚠ Caddy config not found: ${configPath}`);
        return { success: true, configPath, notFound: true };
      }
      console.error(`✗ Failed to delete Caddy config:`, error.message);
      throw error;
    }
  }

  /**
   * Caddy 설정 유효성 검사
   */
  async validateConfig() {
    return new Promise((resolve, reject) => {
      exec('caddy validate --config /etc/caddy/Caddyfile', (error, stdout, stderr) => {
        if (error) {
          console.error(`✗ Caddy config validation failed:`, stderr);
          reject(new Error(stderr || error.message));
        } else {
          console.log(`✓ Caddy config is valid`);
          resolve({ success: true, output: stdout });
        }
      });
    });
  }

  /**
   * Caddy 재시작
   */
  async reload() {
    return new Promise((resolve, reject) => {
      exec(this.reloadCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`✗ Caddy reload failed:`, stderr);
          reject(new Error(stderr || error.message));
        } else {
          console.log(`✓ Caddy reloaded successfully`);
          resolve({ success: true, output: stdout });
        }
      });
    });
  }

  /**
   * SSL 인증서 상태 확인
   */
  async checkSSLStatus(domain) {
    const certDir = '/var/lib/caddy/certificates/acme-v02.api.letsencrypt.org-directory';
    const certPath = path.join(certDir, domain, `${domain}.crt`);

    try {
      const stats = await fs.stat(certPath);
      return {
        exists: true,
        certPath,
        modifiedAt: stats.mtime,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { exists: false, certPath };
      }
      throw error;
    }
  }
}

// ==================== SSOT Registry Client ====================

class SSOTClient {
  constructor(url) {
    this.url = url;
    this.client = axios.create({
      baseURL: url,
      timeout: 5000,
    });
  }

  /**
   * 도메인 정보 등록
   */
  async registerDomain(domainData) {
    try {
      const response = await this.client.post('/domains', domainData);
      console.log(`✓ Domain registered in SSOT: ${domainData.domain}`);
      return response.data;
    } catch (error) {
      console.error(`✗ Failed to register domain in SSOT:`, error.message);
      // SSOT 실패는 치명적이지 않음
      return null;
    }
  }

  /**
   * 도메인 정보 삭제
   */
  async removeDomain(domain) {
    try {
      await this.client.delete(`/domains/${domain}`);
      console.log(`✓ Domain removed from SSOT: ${domain}`);
      return { success: true };
    } catch (error) {
      console.error(`✗ Failed to remove domain from SSOT:`, error.message);
      return null;
    }
  }

  /**
   * 도메인 정보 조회
   */
  async getDomain(domain) {
    try {
      const response = await this.client.get(`/domains/${domain}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error(`✗ Failed to get domain from SSOT:`, error.message);
      return null;
    }
  }

  /**
   * 모든 도메인 조회
   */
  async listDomains() {
    try {
      const response = await this.client.get('/domains');
      return response.data;
    } catch (error) {
      console.error(`✗ Failed to list domains from SSOT:`, error.message);
      return [];
    }
  }
}

// ==================== Domain Manager Service ====================

class DomainManager {
  constructor() {
    this.pdns = new PowerDNSClient(CONFIG.powerdns);
    this.caddy = new CaddyManager(CONFIG.caddy);
    this.ssot = new SSOTClient(CONFIG.ssot.url);
  }

  /**
   * 초기화
   */
  async initialize() {
    console.log('='.repeat(60));
    console.log('CodeB Domain Manager - Initializing...');
    console.log('='.repeat(60));

    // PowerDNS Zone 확인
    await this.pdns.ensureZone();

    // Caddy Sites 디렉토리 확인
    await this.caddy.ensureSitesDir();
    await this.caddy.ensureImportStatement();

    console.log('✓ Domain Manager initialized successfully\n');
  }

  /**
   * 도메인 설정 (DNS + Caddy + SSL)
   */
  async setupDomain(projectName, targetPort, options = {}) {
    const {
      subdomain = null,
      customDomain = null,
      environment = 'production',
      enableSSL = true,
    } = options;

    console.log('\n' + '='.repeat(60));
    console.log(`Setting up domain for: ${projectName}`);
    console.log('='.repeat(60));

    let domain;
    let dnsRequired = true;

    // 도메인 결정
    if (customDomain) {
      domain = customDomain;
      dnsRequired = false; // 커스텀 도메인은 사용자가 직접 DNS 설정
      console.log(`Using custom domain: ${domain}`);
    } else if (subdomain) {
      domain = `${subdomain}.${CONFIG.powerdns.zone}`;
      console.log(`Using custom subdomain: ${domain}`);
    } else {
      // 자동 서브도메인 생성
      if (environment === 'production') {
        domain = `${projectName}.${CONFIG.powerdns.zone}`;
      } else {
        domain = `${projectName}-${environment}.${CONFIG.powerdns.zone}`;
      }
      console.log(`Auto-generated domain: ${domain}`);
    }

    const results = {
      domain,
      targetPort,
      dns: null,
      caddy: null,
      ssl: null,
      ssot: null,
      timestamp: new Date().toISOString(),
    };

    try {
      // Step 1: DNS 레코드 생성 (codeb.kr 서브도메인만)
      if (dnsRequired) {
        console.log('\n[1/4] Creating DNS A record...');
        const subdomainPart = domain.replace(`.${CONFIG.powerdns.zone}`, '');
        results.dns = await this.pdns.addARecord(subdomainPart, CONFIG.serverIP);
      } else {
        console.log('\n[1/4] Skipping DNS (custom domain)...');
        results.dns = { success: true, custom: true, domain };
      }

      // Step 2: Caddy 설정 생성
      console.log('\n[2/4] Creating Caddy configuration...');
      results.caddy = await this.caddy.createSiteConfig(domain, targetPort, {
        enableSSL,
        enableGzip: true,
        enableLogs: true,
      });

      // Step 3: Caddy 설정 검증 및 재시작
      console.log('\n[3/4] Validating and reloading Caddy...');
      await this.caddy.validateConfig();
      await this.caddy.reload();

      // SSL 인증서 발급까지 대기 (최대 30초)
      if (enableSSL) {
        console.log('\nWaiting for SSL certificate issuance...');
        await this.waitForSSL(domain, 30);
        results.ssl = await this.caddy.checkSSLStatus(domain);
      }

      // Step 4: SSOT에 도메인 정보 등록
      console.log('\n[4/4] Registering in SSOT Registry...');
      results.ssot = await this.ssot.registerDomain({
        domain,
        projectName,
        targetPort,
        environment,
        dnsManaged: dnsRequired,
        sslEnabled: enableSSL,
        createdAt: new Date().toISOString(),
      });

      console.log('\n' + '='.repeat(60));
      console.log(`✓ Domain setup complete: ${domain}`);
      console.log('='.repeat(60));
      console.log(`\nURL: https://${domain}`);
      console.log(`Target: http://localhost:${targetPort}\n`);

      return {
        success: true,
        ...results,
      };

    } catch (error) {
      console.error('\n' + '='.repeat(60));
      console.error(`✗ Domain setup failed: ${error.message}`);
      console.error('='.repeat(60));

      // 롤백 시도
      await this.rollbackDomain(domain, results);

      return {
        success: false,
        error: error.message,
        ...results,
      };
    }
  }

  /**
   * 도메인 삭제 (DNS + Caddy)
   */
  async removeDomain(domain) {
    console.log('\n' + '='.repeat(60));
    console.log(`Removing domain: ${domain}`);
    console.log('='.repeat(60));

    const results = {
      domain,
      dns: null,
      caddy: null,
      ssot: null,
      timestamp: new Date().toISOString(),
    };

    try {
      // Step 1: Caddy 설정 삭제
      console.log('\n[1/3] Removing Caddy configuration...');
      results.caddy = await this.caddy.deleteSiteConfig(domain);
      await this.caddy.reload();

      // Step 2: DNS 레코드 삭제 (codeb.kr만)
      if (domain.endsWith(`.${CONFIG.powerdns.zone}`)) {
        console.log('\n[2/3] Removing DNS A record...');
        const subdomain = domain.replace(`.${CONFIG.powerdns.zone}`, '');
        results.dns = await this.pdns.deleteARecord(subdomain);
      } else {
        console.log('\n[2/3] Skipping DNS (custom domain)...');
        results.dns = { success: true, custom: true };
      }

      // Step 3: SSOT에서 삭제
      console.log('\n[3/3] Removing from SSOT Registry...');
      results.ssot = await this.ssot.removeDomain(domain);

      console.log('\n' + '='.repeat(60));
      console.log(`✓ Domain removed: ${domain}`);
      console.log('='.repeat(60));

      return {
        success: true,
        ...results,
      };

    } catch (error) {
      console.error('\n' + '='.repeat(60));
      console.error(`✗ Domain removal failed: ${error.message}`);
      console.error('='.repeat(60));

      return {
        success: false,
        error: error.message,
        ...results,
      };
    }
  }

  /**
   * 도메인 상태 확인
   */
  async checkDomainStatus(domain) {
    console.log(`\nChecking status for: ${domain}\n`);

    const status = {
      domain,
      timestamp: new Date().toISOString(),
      dns: { configured: false },
      caddy: { configured: false },
      ssl: { configured: false },
      ssot: { registered: false },
    };

    // DNS 확인
    if (domain.endsWith(`.${CONFIG.powerdns.zone}`)) {
      const subdomain = domain.replace(`.${CONFIG.powerdns.zone}`, '');
      const dnsRecord = await this.pdns.getRecord(subdomain);
      status.dns = {
        configured: !!dnsRecord,
        record: dnsRecord,
      };
    }

    // Caddy 확인
    const configPath = path.join(this.caddy.sitesDir, `${domain}.caddy`);
    try {
      await fs.access(configPath);
      status.caddy = { configured: true, configPath };
    } catch (error) {
      status.caddy = { configured: false, configPath };
    }

    // SSL 확인
    status.ssl = await this.caddy.checkSSLStatus(domain);

    // SSOT 확인
    const ssotData = await this.ssot.getDomain(domain);
    status.ssot = {
      registered: !!ssotData,
      data: ssotData,
    };

    return status;
  }

  /**
   * SSL 인증서 발급 대기
   */
  async waitForSSL(domain, timeoutSeconds = 30) {
    const startTime = Date.now();
    const timeout = timeoutSeconds * 1000;

    while (Date.now() - startTime < timeout) {
      const sslStatus = await this.caddy.checkSSLStatus(domain);
      if (sslStatus.exists) {
        console.log(`✓ SSL certificate issued for ${domain}`);
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
      process.stdout.write('.');
    }

    console.log(`\n⚠ SSL certificate not found (will be issued on first HTTPS request)`);
    return false;
  }

  /**
   * 롤백
   */
  async rollbackDomain(domain, results) {
    console.log('\n⚠ Rolling back changes...');

    if (results.caddy?.success) {
      await this.caddy.deleteSiteConfig(domain).catch(() => {});
      await this.caddy.reload().catch(() => {});
    }

    if (results.dns?.success && domain.endsWith(`.${CONFIG.powerdns.zone}`)) {
      const subdomain = domain.replace(`.${CONFIG.powerdns.zone}`, '');
      await this.pdns.deleteARecord(subdomain).catch(() => {});
    }

    if (results.ssot?.success) {
      await this.ssot.removeDomain(domain).catch(() => {});
    }

    console.log('✓ Rollback completed');
  }

  /**
   * 모든 도메인 목록
   */
  async listAllDomains() {
    const dnsRecords = await this.pdns.listARecords();
    const ssotDomains = await this.ssot.listDomains();

    return {
      dns: dnsRecords,
      ssot: ssotDomains,
      timestamp: new Date().toISOString(),
    };
  }
}

// ==================== Express API Server ====================

const app = express();
app.use(express.json());

const domainManager = new DomainManager();

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'codeb-domain-manager',
    timestamp: new Date().toISOString(),
  });
});

// POST /domain/setup - 도메인 설정
app.post('/domain/setup', async (req, res) => {
  try {
    const {
      projectName,
      targetPort,
      subdomain = null,
      customDomain = null,
      environment = 'production',
      enableSSL = true,
    } = req.body;

    if (!projectName || !targetPort) {
      return res.status(400).json({
        success: false,
        error: 'projectName and targetPort are required',
      });
    }

    const result = await domainManager.setupDomain(projectName, targetPort, {
      subdomain,
      customDomain,
      environment,
      enableSSL,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// DELETE /domain/remove - 도메인 삭제
app.delete('/domain/remove', async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'domain is required',
      });
    }

    const result = await domainManager.removeDomain(domain);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /domain/status/:domain - 도메인 상태 확인
app.get('/domain/status/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const status = await domainManager.checkDomainStatus(domain);
    res.json(status);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /domains - 모든 도메인 조회
app.get('/domains', async (req, res) => {
  try {
    const domains = await domainManager.listAllDomains();
    res.json(domains);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== Server Startup ====================

async function startServer() {
  try {
    await domainManager.initialize();

    app.listen(CONFIG.port, () => {
      console.log('='.repeat(60));
      console.log(`CodeB Domain Manager API Server`);
      console.log('='.repeat(60));
      console.log(`Server: http://localhost:${CONFIG.port}`);
      console.log(`PowerDNS: ${CONFIG.powerdns.apiUrl}`);
      console.log(`Caddy: ${CONFIG.caddy.configDir}`);
      console.log(`SSOT: ${CONFIG.ssot.url}`);
      console.log('='.repeat(60));
      console.log('\nAPI Endpoints:');
      console.log(`  POST   /domain/setup      - Setup new domain`);
      console.log(`  DELETE /domain/remove     - Remove domain`);
      console.log(`  GET    /domain/status/:id - Check domain status`);
      console.log(`  GET    /domains           - List all domains`);
      console.log(`  GET    /health            - Health check`);
      console.log('='.repeat(60) + '\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down gracefully...');
  process.exit(0);
});

// Start server
if (require.main === module) {
  startServer();
}

module.exports = { DomainManager, PowerDNSClient, CaddyManager, SSOTClient };
