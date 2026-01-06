#!/usr/bin/env node

/**
 * CodeB v5.0 - Postinstall Script
 * Automatically updates CLAUDE.md on CLI install/update
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

// ============================================================================
// Configuration
// ============================================================================

const CLAUDE_MD_URL = 'https://raw.githubusercontent.com/anthropics/codeb-server/main/CLAUDE.md';
const CLAUDE_MD_FALLBACK_URL = 'https://api.codeb.kr/claude-md';

const TARGET_PATHS = [
  // Global user config
  path.join(os.homedir(), '.claude', 'CLAUDE.md'),
  // Current working directory (if in a project)
  path.join(process.cwd(), 'CLAUDE.md'),
];

// ============================================================================
// Fetch CLAUDE.md
// ============================================================================

async function fetchClaudeMd(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        fetchClaudeMd(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ============================================================================
// Update CLAUDE.md
// ============================================================================

async function updateClaudeMd() {
  console.log('📦 CodeB v5.0 - Updating CLAUDE.md...');

  let content;

  // Try primary URL first
  try {
    content = await fetchClaudeMd(CLAUDE_MD_URL);
    console.log('✅ Fetched CLAUDE.md from GitHub');
  } catch (err) {
    console.log('⚠️  GitHub fetch failed, trying fallback...');
    try {
      content = await fetchClaudeMd(CLAUDE_MD_FALLBACK_URL);
      console.log('✅ Fetched CLAUDE.md from CodeB API');
    } catch (err2) {
      console.log('⚠️  Could not fetch CLAUDE.md, using bundled version');
      const bundledPath = path.join(__dirname, '..', 'CLAUDE.md');
      if (fs.existsSync(bundledPath)) {
        content = fs.readFileSync(bundledPath, 'utf-8');
      } else {
        console.error('❌ No CLAUDE.md available');
        return;
      }
    }
  }

  // Update target paths
  for (const targetPath of TARGET_PATHS) {
    try {
      const dir = path.dirname(targetPath);

      // Only update if directory exists or is home config
      if (targetPath.includes('.claude')) {
        // Always create ~/.claude directory
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      } else if (!fs.existsSync(dir)) {
        // Skip if project directory doesn't exist
        continue;
      }

      // Check if file exists and compare versions
      if (fs.existsSync(targetPath)) {
        const existing = fs.readFileSync(targetPath, 'utf-8');
        const existingVersion = extractVersion(existing);
        const newVersion = extractVersion(content);

        if (existingVersion === newVersion) {
          console.log(`⏭️  ${targetPath} is already up to date (v${newVersion})`);
          continue;
        }

        // Backup existing file
        const backupPath = `${targetPath}.backup.${Date.now()}`;
        fs.writeFileSync(backupPath, existing);
        console.log(`📁 Backed up existing file to ${backupPath}`);
      }

      // Write new content
      fs.writeFileSync(targetPath, content);
      console.log(`✅ Updated ${targetPath}`);
    } catch (err) {
      console.log(`⚠️  Could not update ${targetPath}: ${err.message}`);
    }
  }

  console.log('');
  console.log('🎉 CodeB v5.0 installed successfully!');
  console.log('');
  console.log('Quick start:');
  console.log('  we init myapp --type nextjs    # Initialize project');
  console.log('  we deploy myapp                 # Deploy to preview');
  console.log('  we promote myapp                # Switch to production');
  console.log('');
}

// ============================================================================
// Extract Version
// ============================================================================

function extractVersion(content) {
  const match = content.match(/CLAUDE\.md v(\d+\.\d+)/);
  return match ? match[1] : '0.0';
}

// ============================================================================
// Main
// ============================================================================

updateClaudeMd().catch((err) => {
  console.error('❌ Postinstall error:', err.message);
  // Don't fail the install
  process.exit(0);
});
