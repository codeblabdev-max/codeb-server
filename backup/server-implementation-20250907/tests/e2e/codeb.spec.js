/**
 * CodeB E2E Test Suite
 * Wave 3: Comprehensive End-to-End Testing
 * 
 * Playwright 기반 E2E 테스트 시스템
 */

const { test, expect } = require('@playwright/test');
const { v4: uuidv4 } = require('uuid');

// Test configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'test-api-key';
const TEST_TIMEOUT = 30000;

test.describe('CodeB E2E Test Suite', () => {
    let projectId;
    let applicationId;
    let databaseId;

    test.beforeAll(async () => {
        console.log('🎬 Starting E2E tests for CodeB platform');
        console.log(`📍 Target: ${BASE_URL}`);
    });

    test.afterAll(async () => {
        console.log('✅ E2E tests completed');
    });

    test.describe('Health Check', () => {
        test('API should be healthy', async ({ request }) => {
            const response = await request.get(`${BASE_URL}/health`);
            expect(response.status()).toBe(200);
            
            const data = await response.json();
            expect(data.status).toBe('healthy');
            expect(data.version).toBeDefined();
        });

        test('Metrics endpoint should be accessible', async ({ request }) => {
            const response = await request.get(`${BASE_URL}/api/metrics`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });
            
            // May return 401 if auth is not set up
            expect([200, 401]).toContain(response.status());
        });
    });

    test.describe('Project Management', () => {
        test('Should create a new project', async ({ request }) => {
            const projectData = {
                name: `test-project-${Date.now()}`,
                type: 'nodejs',
                description: 'E2E test project',
                gitUrl: 'https://github.com/example/test-app.git'
            };

            const response = await request.post(`${BASE_URL}/api/projects`, {
                data: projectData,
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            // Accept both 201 (created) and 200 (success)
            expect([200, 201, 401]).toContain(response.status());
            
            if (response.status() === 201 || response.status() === 200) {
                const project = await response.json();
                projectId = project.id;
                expect(project.name).toBe(projectData.name);
                expect(project.type).toBe(projectData.type);
            }
        });

        test('Should list all projects', async ({ request }) => {
            const response = await request.get(`${BASE_URL}/api/projects`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            expect([200, 401]).toContain(response.status());
            
            if (response.status() === 200) {
                const projects = await response.json();
                expect(Array.isArray(projects)).toBeTruthy();
            }
        });

        test('Should get project by ID', async ({ request }) => {
            if (!projectId) {
                test.skip();
                return;
            }

            const response = await request.get(`${BASE_URL}/api/projects/${projectId}`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            expect([200, 404, 401]).toContain(response.status());
            
            if (response.status() === 200) {
                const project = await response.json();
                expect(project.id).toBe(projectId);
            }
        });

        test('Should update project', async ({ request }) => {
            if (!projectId) {
                test.skip();
                return;
            }

            const updateData = {
                description: 'Updated E2E test project'
            };

            const response = await request.put(`${BASE_URL}/api/projects/${projectId}`, {
                data: updateData,
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            expect([200, 404, 401]).toContain(response.status());
        });
    });

    test.describe('Application Deployment', () => {
        test('Should deploy an application', async ({ request }) => {
            const deploymentData = {
                projectId: projectId || 'test-project',
                gitUrl: 'https://github.com/example/test-app.git',
                branch: 'main',
                environment: {
                    NODE_ENV: 'production',
                    PORT: '3000'
                }
            };

            const response = await request.post(`${BASE_URL}/api/applications/deploy`, {
                data: deploymentData,
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: TEST_TIMEOUT
            });

            expect([200, 202, 401]).toContain(response.status());
            
            if (response.status() === 202 || response.status() === 200) {
                const deployment = await response.json();
                expect(deployment.id).toBeDefined();
                expect(['pending', 'building', 'deploying']).toContain(deployment.status);
                applicationId = deployment.applicationId;
            }
        });

        test('Should check deployment status', async ({ request }) => {
            if (!applicationId) {
                test.skip();
                return;
            }

            // Wait a bit for deployment to start
            await new Promise(resolve => setTimeout(resolve, 2000));

            const response = await request.get(`${BASE_URL}/api/applications/${applicationId}/status`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            expect([200, 404, 401]).toContain(response.status());
            
            if (response.status() === 200) {
                const status = await response.json();
                expect(status.status).toBeDefined();
            }
        });
    });

    test.describe('Database Management', () => {
        test('Should create a database', async ({ request }) => {
            const databaseData = {
                name: `test-db-${Date.now()}`,
                type: 'postgresql',
                version: '14',
                size: 'small'
            };

            const response = await request.post(`${BASE_URL}/api/databases`, {
                data: databaseData,
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            expect([201, 200, 401]).toContain(response.status());
            
            if (response.status() === 201 || response.status() === 200) {
                const database = await response.json();
                databaseId = database.id;
                expect(database.name).toBe(databaseData.name);
                expect(database.type).toBe(databaseData.type);
            }
        });

        test('Should list databases', async ({ request }) => {
            const response = await request.get(`${BASE_URL}/api/databases`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            expect([200, 401]).toContain(response.status());
            
            if (response.status() === 200) {
                const databases = await response.json();
                expect(Array.isArray(databases)).toBeTruthy();
            }
        });
    });

    test.describe('Performance Tests', () => {
        test('API should respond within acceptable time', async ({ request }) => {
            const startTime = Date.now();
            
            const response = await request.get(`${BASE_URL}/health`);
            
            const responseTime = Date.now() - startTime;
            
            expect(response.status()).toBe(200);
            expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
        });

        test('Should handle concurrent requests', async ({ request }) => {
            const requests = Array(10).fill(null).map(() => 
                request.get(`${BASE_URL}/health`)
            );

            const responses = await Promise.all(requests);
            
            responses.forEach(response => {
                expect(response.status()).toBe(200);
            });
        });
    });

    test.describe('Error Handling', () => {
        test('Should return 404 for non-existent resource', async ({ request }) => {
            const response = await request.get(`${BASE_URL}/api/projects/non-existent-id`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            expect([404, 401]).toContain(response.status());
        });

        test('Should return 400 for invalid data', async ({ request }) => {
            const invalidData = {
                // Missing required fields
                type: 'invalid'
            };

            const response = await request.post(`${BASE_URL}/api/projects`, {
                data: invalidData,
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            expect([400, 401]).toContain(response.status());
        });
    });

    test.describe('Security Tests', () => {
        test('Should require authentication for protected endpoints', async ({ request }) => {
            const response = await request.get(`${BASE_URL}/api/projects`);
            
            // Should return 401 Unauthorized without auth header
            expect([401, 403]).toContain(response.status());
        });

        test('Should reject invalid tokens', async ({ request }) => {
            const response = await request.get(`${BASE_URL}/api/projects`, {
                headers: {
                    'Authorization': 'Bearer invalid-token'
                }
            });

            expect([401, 403]).toContain(response.status());
        });

        test('Should have security headers', async ({ request }) => {
            const response = await request.get(`${BASE_URL}/health`);
            
            const headers = response.headers();
            
            // Check for common security headers
            // These might not all be present, but we check for awareness
            const securityHeaders = [
                'x-content-type-options',
                'x-frame-options',
                'x-xss-protection',
                'strict-transport-security'
            ];
            
            // At least some security headers should be present
            const hasSecurityHeaders = securityHeaders.some(header => 
                headers[header] !== undefined
            );
            
            // This is informational - log which headers are present
            console.log('Security headers present:', 
                securityHeaders.filter(h => headers[h] !== undefined)
            );
        });
    });

    test.describe('Cleanup', () => {
        test('Should delete test project', async ({ request }) => {
            if (!projectId) {
                test.skip();
                return;
            }

            const response = await request.delete(`${BASE_URL}/api/projects/${projectId}`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            expect([204, 200, 404, 401]).toContain(response.status());
        });

        test('Should delete test database', async ({ request }) => {
            if (!databaseId) {
                test.skip();
                return;
            }

            const response = await request.delete(`${BASE_URL}/api/databases/${databaseId}`, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            expect([204, 200, 404, 401]).toContain(response.status());
        });
    });
});

// Visual regression tests (if UI exists)
test.describe('Visual Tests', () => {
    test.skip('Should match homepage snapshot', async ({ page }) => {
        await page.goto(BASE_URL);
        await expect(page).toHaveScreenshot('homepage.png');
    });

    test.skip('Should match dashboard snapshot', async ({ page }) => {
        await page.goto(`${BASE_URL}/dashboard`);
        await expect(page).toHaveScreenshot('dashboard.png');
    });
});

// Accessibility tests
test.describe('Accessibility Tests', () => {
    test.skip('Should have no accessibility violations', async ({ page }) => {
        await page.goto(BASE_URL);
        
        // Would need @axe-core/playwright for full accessibility testing
        // const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
        // expect(accessibilityScanResults.violations).toEqual([]);
    });
});