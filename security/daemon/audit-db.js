#!/usr/bin/env node
/**
 * CodeB Audit Database
 *
 * SQLite 기반 감사 로그 시스템
 * 모든 명령 실행 기록 저장
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class AuditDB {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.retentionDays = 90; // 90일 보관
  }

  async initialize() {
    // 디렉토리 생성
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // SQLite 연결
    this.db = new Database(this.dbPath);

    // 테이블 생성
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        command TEXT NOT NULL,
        context TEXT,
        reason TEXT,
        pid INTEGER,
        client_id TEXT,
        ip_address TEXT,
        user TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_command ON audit_logs(command);

      CREATE TABLE IF NOT EXISTS blocked_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        command TEXT NOT NULL,
        reason TEXT NOT NULL,
        client_id TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_blocked_timestamp ON blocked_attempts(timestamp);

      CREATE TABLE IF NOT EXISTS production_containers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        container_name TEXT UNIQUE NOT NULL,
        project_name TEXT,
        port INTEGER,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        registered_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_prod_container ON production_containers(container_name);
    `);

    // 정리 작업
    this.cleanup();

    console.error('[AuditDB] Initialized');
  }

  // --------------------------------------------------------------------------
  // 감사 로그
  // --------------------------------------------------------------------------

  log(entry) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO audit_logs (timestamp, action, command, context, reason, pid, client_id, ip_address, user)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        entry.timestamp || new Date().toISOString(),
        entry.action || 'unknown',
        entry.command || '',
        entry.context || '{}',
        entry.reason || '',
        entry.pid || process.pid,
        entry.clientId || null,
        entry.ipAddress || null,
        entry.user || process.env.USER || null
      );
    } catch (error) {
      console.error(`[AuditDB] Log failed: ${error.message}`);
    }
  }

  logBlocked(entry) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO blocked_attempts (timestamp, command, reason, client_id, ip_address)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        entry.timestamp || new Date().toISOString(),
        entry.command || '',
        entry.reason || '',
        entry.clientId || null,
        entry.ipAddress || null
      );
    } catch (error) {
      console.error(`[AuditDB] Log blocked failed: ${error.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // 프로덕션 컨테이너 관리
  // --------------------------------------------------------------------------

  registerProductionContainer(containerName, projectName, port, registeredBy) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO production_containers (container_name, project_name, port, registered_by)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(containerName, projectName, port, registeredBy);
      return true;
    } catch (error) {
      console.error(`[AuditDB] Register production container failed: ${error.message}`);
      return false;
    }
  }

  getProductionContainers() {
    try {
      const stmt = this.db.prepare('SELECT container_name FROM production_containers');
      const rows = stmt.all();
      return rows.map(r => r.container_name);
    } catch (error) {
      console.error(`[AuditDB] Get production containers failed: ${error.message}`);
      return [];
    }
  }

  isProductionContainer(containerName) {
    try {
      const stmt = this.db.prepare(
        'SELECT 1 FROM production_containers WHERE container_name = ?'
      );
      const row = stmt.get(containerName);
      return !!row;
    } catch (error) {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // 조회
  // --------------------------------------------------------------------------

  getRecentLogs(limit = 100, action = null) {
    try {
      let query = 'SELECT * FROM audit_logs';
      const params = [];

      if (action) {
        query += ' WHERE action = ?';
        params.push(action);
      }

      query += ' ORDER BY id DESC LIMIT ?';
      params.push(limit);

      const stmt = this.db.prepare(query);
      return stmt.all(...params);
    } catch (error) {
      console.error(`[AuditDB] Get recent logs failed: ${error.message}`);
      return [];
    }
  }

  getBlockedAttempts(limit = 100, since = null) {
    try {
      let query = 'SELECT * FROM blocked_attempts';
      const params = [];

      if (since) {
        query += ' WHERE timestamp >= ?';
        params.push(since);
      }

      query += ' ORDER BY id DESC LIMIT ?';
      params.push(limit);

      const stmt = this.db.prepare(query);
      return stmt.all(...params);
    } catch (error) {
      console.error(`[AuditDB] Get blocked attempts failed: ${error.message}`);
      return [];
    }
  }

  getStats(days = 7) {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString();

      const totalStmt = this.db.prepare(
        'SELECT COUNT(*) as count FROM audit_logs WHERE timestamp >= ?'
      );
      const total = totalStmt.get(sinceStr).count;

      const blockedStmt = this.db.prepare(
        "SELECT COUNT(*) as count FROM audit_logs WHERE timestamp >= ? AND action = 'blocked'"
      );
      const blocked = blockedStmt.get(sinceStr).count;

      const allowedStmt = this.db.prepare(
        "SELECT COUNT(*) as count FROM audit_logs WHERE timestamp >= ? AND action = 'allowed'"
      );
      const allowed = allowedStmt.get(sinceStr).count;

      const byActionStmt = this.db.prepare(`
        SELECT action, COUNT(*) as count
        FROM audit_logs
        WHERE timestamp >= ?
        GROUP BY action
      `);
      const byAction = byActionStmt.all(sinceStr);

      const topBlockedStmt = this.db.prepare(`
        SELECT command, COUNT(*) as count
        FROM blocked_attempts
        WHERE timestamp >= ?
        GROUP BY command
        ORDER BY count DESC
        LIMIT 10
      `);
      const topBlocked = topBlockedStmt.all(sinceStr);

      return {
        period: `${days} days`,
        total,
        blocked,
        allowed,
        blockRate: total > 0 ? ((blocked / total) * 100).toFixed(2) + '%' : '0%',
        byAction,
        topBlocked,
      };
    } catch (error) {
      console.error(`[AuditDB] Get stats failed: ${error.message}`);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // 정리
  // --------------------------------------------------------------------------

  cleanup() {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.retentionDays);
      const cutoffStr = cutoff.toISOString();

      const auditStmt = this.db.prepare('DELETE FROM audit_logs WHERE timestamp < ?');
      const auditResult = auditStmt.run(cutoffStr);

      const blockedStmt = this.db.prepare('DELETE FROM blocked_attempts WHERE timestamp < ?');
      const blockedResult = blockedStmt.run(cutoffStr);

      if (auditResult.changes > 0 || blockedResult.changes > 0) {
        console.error(
          `[AuditDB] Cleanup: removed ${auditResult.changes} audit logs, ${blockedResult.changes} blocked attempts`
        );
      }
    } catch (error) {
      console.error(`[AuditDB] Cleanup failed: ${error.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // 종료
  // --------------------------------------------------------------------------

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = { AuditDB };
