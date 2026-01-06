/**
 * Database Layer Tests
 */

import { hashApiKey, generateApiKey } from '../lib/database.js';

describe('Database Utilities', () => {
  describe('hashApiKey', () => {
    it('should hash an API key to a fixed-length string', () => {
      const key = 'codeb_admin_abc123xyz456';
      const hash = hashApiKey(key);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64); // SHA-256 produces 64 hex chars
    });

    it('should produce consistent hashes for the same input', () => {
      const key = 'codeb_dev_test123';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const key1 = 'codeb_admin_key1';
      const key2 = 'codeb_admin_key2';

      expect(hashApiKey(key1)).not.toBe(hashApiKey(key2));
    });
  });

  describe('generateApiKey', () => {
    it('should generate a key with correct format', () => {
      const result = generateApiKey('admin', 'team123456');

      expect(result.key).toMatch(/^codeb_team1234_admin_.+$/);
      expect(result.prefix).toHaveLength(20);
    });

    it('should include role in the key', () => {
      const adminKey = generateApiKey('admin', 'teamxyz123');
      const devKey = generateApiKey('member', 'teamxyz123');

      expect(adminKey.key).toContain('_admin_');
      expect(devKey.key).toContain('_member_');
    });

    it('should generate unique keys each time', () => {
      const key1 = generateApiKey('owner', 'team123');
      const key2 = generateApiKey('owner', 'team123');

      expect(key1.key).not.toBe(key2.key);
    });
  });
});
