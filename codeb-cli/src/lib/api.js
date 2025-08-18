/**
 * API Client
 * 서버와 통신하는 API 클라이언트
 */

const axios = require('axios');
const config = require('./config');
const chalk = require('chalk');

class ApiClient {
  constructor() {
    this.client = null;
    this.init();
  }

  init() {
    const serverUrl = config.get('server');
    const apiKey = config.get('apiKey') || config.get('token'); // Support both for backwards compatibility

    if (!serverUrl) {
      console.error(chalk.red('Server URL not configured. Run "codeb config:init" first.'));
      process.exit(1);
    }

    if (!apiKey) {
      console.error(chalk.red('API Key not configured. Run "codeb config:init" or "codeb config set apiKey <key>" first.'));
      process.exit(1);
    }

    this.client = axios.create({
      baseURL: `${serverUrl}/api`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-API-Key': apiKey
      }
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add timestamp to prevent caching
        config.params = {
          ...config.params,
          _t: Date.now()
        };
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          switch (error.response.status) {
            case 401:
              console.error(chalk.red('Authentication failed. Please check your API token.'));
              break;
            case 403:
              console.error(chalk.red('Access denied. You don\'t have permission for this action.'));
              break;
            case 404:
              console.error(chalk.red('Resource not found.'));
              break;
            case 500:
              console.error(chalk.red('Server error. Please try again later.'));
              break;
          }
        } else if (error.request) {
          console.error(chalk.red('Cannot connect to server. Please check your connection.'));
        }
        return Promise.reject(error);
      }
    );
  }

  async get(url, config) {
    return this.client.get(url, config);
  }

  async post(url, data, config) {
    return this.client.post(url, data, config);
  }

  async put(url, data, config) {
    return this.client.put(url, data, config);
  }

  async delete(url, config) {
    return this.client.delete(url, config);
  }

  async patch(url, data, config) {
    return this.client.patch(url, data, config);
  }

  // Stream support for logs
  async stream(url, params) {
    const EventSource = require('eventsource');
    const serverUrl = config.get('server');
    const token = config.get('token');
    
    const queryString = new URLSearchParams(params).toString();
    const streamUrl = `${serverUrl}/api${url}?${queryString}`;
    
    const eventSource = new EventSource(streamUrl, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : undefined
      }
    });

    return eventSource;
  }
}

module.exports = new ApiClient();