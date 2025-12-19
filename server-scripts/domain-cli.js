#!/usr/bin/env node

/**
 * CodeB Domain CLI
 *
 * 서버측 도메인 관리 CLI 도구
 *
 * Usage:
 *   domain-cli setup <project> <port> [options]
 *   domain-cli remove <domain>
 *   domain-cli status <domain>
 *   domain-cli list
 */

const axios = require('axios');
const { program } = require('commander');

const API_BASE = 'http://localhost:3103';

// Color helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function success(msg) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function error(msg) {
  console.error(`${colors.red}✗${colors.reset} ${msg}`);
}

function info(msg) {
  console.log(`${colors.blue}ℹ${colors.reset} ${msg}`);
}

function warn(msg) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

// ==================== Commands ====================

async function setupDomain(projectName, targetPort, options) {
  try {
    info(`Setting up domain for ${projectName} -> localhost:${targetPort}`);

    const response = await axios.post(`${API_BASE}/domain/setup`, {
      projectName,
      targetPort: parseInt(targetPort),
      subdomain: options.subdomain || null,
      customDomain: options.domain || null,
      environment: options.environment || 'production',
      enableSSL: options.ssl !== false,
    });

    const result = response.data;

    if (result.success) {
      console.log('\n' + '='.repeat(60));
      success(`Domain setup complete!`);
      console.log('='.repeat(60));
      console.log(`Domain:      ${result.domain}`);
      console.log(`Target Port: ${result.targetPort}`);
      console.log(`URL:         https://${result.domain}`);

      if (result.dns?.success) {
        success(`DNS configured: ${result.dns.fqdn} -> ${result.dns.ip}`);
      }

      if (result.caddy?.success) {
        success(`Caddy configured: ${result.caddy.configPath}`);
      }

      if (result.ssl?.exists) {
        success(`SSL certificate: ${result.ssl.certPath}`);
      } else {
        warn(`SSL certificate will be issued on first HTTPS request`);
      }

      console.log('='.repeat(60) + '\n');
    } else {
      error(`Failed: ${result.error}`);
      process.exit(1);
    }
  } catch (err) {
    error(`API Error: ${err.response?.data?.error || err.message}`);
    process.exit(1);
  }
}

async function removeDomain(domain) {
  try {
    info(`Removing domain: ${domain}`);

    const response = await axios.delete(`${API_BASE}/domain/remove`, {
      data: { domain },
    });

    const result = response.data;

    if (result.success) {
      console.log('\n' + '='.repeat(60));
      success(`Domain removed!`);
      console.log('='.repeat(60));
      console.log(`Domain: ${result.domain}`);

      if (result.dns?.success) {
        success(`DNS record deleted`);
      }

      if (result.caddy?.success) {
        success(`Caddy config removed`);
      }

      console.log('='.repeat(60) + '\n');
    } else {
      error(`Failed: ${result.error}`);
      process.exit(1);
    }
  } catch (err) {
    error(`API Error: ${err.response?.data?.error || err.message}`);
    process.exit(1);
  }
}

async function checkStatus(domain) {
  try {
    const response = await axios.get(`${API_BASE}/domain/status/${domain}`);
    const status = response.data;

    console.log('\n' + '='.repeat(60));
    console.log(`Domain Status: ${domain}`);
    console.log('='.repeat(60));

    // DNS Status
    console.log(`\n${colors.cyan}DNS:${colors.reset}`);
    if (status.dns.configured) {
      success(`Configured`);
      if (status.dns.record) {
        console.log(`  Record: ${status.dns.record.name} -> ${status.dns.record.records.join(', ')}`);
        console.log(`  TTL: ${status.dns.record.ttl}`);
      }
    } else {
      warn(`Not configured`);
    }

    // Caddy Status
    console.log(`\n${colors.cyan}Caddy:${colors.reset}`);
    if (status.caddy.configured) {
      success(`Configured`);
      console.log(`  Config: ${status.caddy.configPath}`);
    } else {
      warn(`Not configured`);
    }

    // SSL Status
    console.log(`\n${colors.cyan}SSL:${colors.reset}`);
    if (status.ssl.exists) {
      success(`Certificate issued`);
      console.log(`  Path: ${status.ssl.certPath}`);
      console.log(`  Modified: ${status.ssl.modifiedAt}`);
    } else {
      warn(`Certificate not found`);
    }

    // SSOT Status
    console.log(`\n${colors.cyan}SSOT Registry:${colors.reset}`);
    if (status.ssot.registered) {
      success(`Registered`);
      if (status.ssot.data) {
        console.log(`  Project: ${status.ssot.data.projectName}`);
        console.log(`  Port: ${status.ssot.data.targetPort}`);
        console.log(`  Environment: ${status.ssot.data.environment}`);
      }
    } else {
      warn(`Not registered`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  } catch (err) {
    error(`API Error: ${err.response?.data?.error || err.message}`);
    process.exit(1);
  }
}

async function listDomains() {
  try {
    const response = await axios.get(`${API_BASE}/domains`);
    const { dns, ssot } = response.data;

    console.log('\n' + '='.repeat(60));
    console.log(`All Domains`);
    console.log('='.repeat(60));

    // DNS Records
    console.log(`\n${colors.cyan}DNS Records (PowerDNS):${colors.reset}`);
    if (dns.length > 0) {
      dns.forEach(record => {
        console.log(`  ${record.name} -> ${record.records.join(', ')} (TTL: ${record.ttl})`);
      });
    } else {
      warn(`  No DNS records found`);
    }

    // SSOT Domains
    console.log(`\n${colors.cyan}Registered Domains (SSOT):${colors.reset}`);
    if (ssot.length > 0) {
      ssot.forEach(domain => {
        console.log(`  ${domain.domain} (${domain.projectName}) -> :${domain.targetPort}`);
      });
    } else {
      warn(`  No domains registered in SSOT`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  } catch (err) {
    error(`API Error: ${err.response?.data?.error || err.message}`);
    process.exit(1);
  }
}

// ==================== CLI Setup ====================

program
  .name('domain-cli')
  .description('CodeB Domain Manager CLI')
  .version('1.0.0');

program
  .command('setup <project> <port>')
  .description('Setup a new domain with DNS, Caddy, and SSL')
  .option('-s, --subdomain <subdomain>', 'Custom subdomain')
  .option('-d, --domain <domain>', 'Custom domain (skip DNS)')
  .option('-e, --environment <env>', 'Environment (production/staging)', 'production')
  .option('--no-ssl', 'Disable SSL')
  .action(setupDomain);

program
  .command('remove <domain>')
  .description('Remove a domain')
  .action(removeDomain);

program
  .command('status <domain>')
  .description('Check domain status')
  .action(checkStatus);

program
  .command('list')
  .description('List all domains')
  .action(listDomains);

program.parse();
