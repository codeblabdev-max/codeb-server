/**
 * Jest Test Setup
 */

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.CODEB_DB_HOST = 'localhost';
process.env.CODEB_DB_PORT = '5432';
process.env.CODEB_DB_NAME = 'codeb_test';
process.env.CODEB_DB_USER = 'codeb';
process.env.CODEB_DB_PASSWORD = 'test';
process.env.LOG_LEVEL = 'error';

// Suppress console during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});
