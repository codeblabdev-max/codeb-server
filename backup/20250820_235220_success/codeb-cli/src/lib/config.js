/**
 * Configuration Manager
 * CLI 설정 관리
 */

const Conf = require('conf');
const path = require('path');
const os = require('os');

class Config {
  constructor() {
    this.config = new Conf({
      projectName: 'codeb-cli',
      defaults: {
        server: 'http://localhost:3000',
        token: null,
        defaultEnvironment: 'production',
        outputFormat: 'table'
      }
    });
  }

  get(key) {
    return this.config.get(key);
  }

  set(key, value) {
    this.config.set(key, value);
  }

  delete(key) {
    this.config.delete(key);
  }

  clear() {
    this.config.clear();
  }

  getAll() {
    return this.config.store;
  }

  getConfigPath() {
    return this.config.path;
  }

  // Server profiles for multiple servers
  addServer(name, url, token) {
    const servers = this.config.get('servers') || {};
    servers[name] = { url, token };
    this.config.set('servers', servers);
  }

  getServer(name) {
    const servers = this.config.get('servers') || {};
    return servers[name];
  }

  useServer(name) {
    const server = this.getServer(name);
    if (server) {
      this.set('server', server.url);
      this.set('token', server.token);
      this.set('currentServer', name);
      return true;
    }
    return false;
  }

  listServers() {
    return this.config.get('servers') || {};
  }
}

module.exports = new Config();