#!/usr/bin/env node

/**
 * CodeB API Documentation Generator
 * Wave 3: Automated API Documentation System
 * 
 * OpenAPI/Swagger 기반 자동 문서화 시스템
 */

const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

class CodeBApiDocGenerator {
    constructor() {
        this.openApiSpec = {
            openapi: '3.0.3',
            info: {
                title: 'CodeB Unified API',
                description: 'Comprehensive API for CodeB platform - Managing projects, deployments, and infrastructure',
                version: '3.6.0',
                contact: {
                    name: 'CodeB Team',
                    email: 'api@codeb.io',
                    url: 'https://codeb.io'
                },
                license: {
                    name: 'MIT',
                    url: 'https://opensource.org/licenses/MIT'
                }
            },
            servers: [
                {
                    url: 'http://localhost:3000',
                    description: 'Development server'
                },
                {
                    url: 'https://staging.codeb.io',
                    description: 'Staging server'
                },
                {
                    url: 'https://api.codeb.io',
                    description: 'Production server'
                }
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT'
                    },
                    apiKey: {
                        type: 'apiKey',
                        in: 'header',
                        name: 'X-API-Key'
                    }
                },
                schemas: this.defineSchemas(),
                responses: this.defineResponses(),
                parameters: this.defineParameters()
            },
            paths: this.definePaths(),
            tags: this.defineTags()
        };
    }

    defineSchemas() {
        return {
            Project: {
                type: 'object',
                required: ['name', 'type'],
                properties: {
                    id: {
                        type: 'string',
                        format: 'uuid',
                        description: 'Unique project identifier'
                    },
                    name: {
                        type: 'string',
                        minLength: 3,
                        maxLength: 100,
                        description: 'Project name'
                    },
                    type: {
                        type: 'string',
                        enum: ['nodejs', 'python', 'go', 'rust', 'java', 'dotnet'],
                        description: 'Project technology stack'
                    },
                    description: {
                        type: 'string',
                        maxLength: 500,
                        description: 'Project description'
                    },
                    gitUrl: {
                        type: 'string',
                        format: 'uri',
                        description: 'Git repository URL'
                    },
                    status: {
                        type: 'string',
                        enum: ['active', 'inactive', 'deploying', 'error'],
                        description: 'Current project status'
                    },
                    createdAt: {
                        type: 'string',
                        format: 'date-time'
                    },
                    updatedAt: {
                        type: 'string',
                        format: 'date-time'
                    }
                }
            },
            Application: {
                type: 'object',
                required: ['projectId', 'name', 'type'],
                properties: {
                    id: {
                        type: 'string',
                        format: 'uuid'
                    },
                    projectId: {
                        type: 'string',
                        format: 'uuid'
                    },
                    name: {
                        type: 'string',
                        minLength: 3,
                        maxLength: 100
                    },
                    type: {
                        type: 'string',
                        enum: ['web', 'api', 'worker', 'cron']
                    },
                    domain: {
                        type: 'string',
                        format: 'hostname'
                    },
                    port: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 65535
                    },
                    environment: {
                        type: 'object',
                        additionalProperties: {
                            type: 'string'
                        }
                    },
                    resources: {
                        type: 'object',
                        properties: {
                            cpu: {
                                type: 'string',
                                pattern: '^[0-9]+m?$'
                            },
                            memory: {
                                type: 'string',
                                pattern: '^[0-9]+(Mi|Gi)$'
                            },
                            storage: {
                                type: 'string',
                                pattern: '^[0-9]+(Gi|Ti)$'
                            }
                        }
                    },
                    status: {
                        type: 'string',
                        enum: ['running', 'stopped', 'deploying', 'error']
                    }
                }
            },
            Database: {
                type: 'object',
                required: ['name', 'type'],
                properties: {
                    id: {
                        type: 'string',
                        format: 'uuid'
                    },
                    name: {
                        type: 'string',
                        minLength: 3,
                        maxLength: 50
                    },
                    type: {
                        type: 'string',
                        enum: ['postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch']
                    },
                    version: {
                        type: 'string'
                    },
                    size: {
                        type: 'string',
                        enum: ['small', 'medium', 'large', 'xlarge']
                    },
                    connectionString: {
                        type: 'string',
                        format: 'uri'
                    },
                    backups: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                timestamp: { type: 'string', format: 'date-time' },
                                size: { type: 'string' }
                            }
                        }
                    }
                }
            },
            Deployment: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        format: 'uuid'
                    },
                    applicationId: {
                        type: 'string',
                        format: 'uuid'
                    },
                    version: {
                        type: 'string'
                    },
                    commitHash: {
                        type: 'string',
                        pattern: '^[a-f0-9]{40}$'
                    },
                    status: {
                        type: 'string',
                        enum: ['pending', 'building', 'deploying', 'success', 'failed', 'cancelled']
                    },
                    logs: {
                        type: 'string'
                    },
                    startedAt: {
                        type: 'string',
                        format: 'date-time'
                    },
                    completedAt: {
                        type: 'string',
                        format: 'date-time'
                    }
                }
            },
            Metrics: {
                type: 'object',
                properties: {
                    cpu: {
                        type: 'object',
                        properties: {
                            usage: { type: 'number' },
                            limit: { type: 'number' },
                            unit: { type: 'string', default: 'cores' }
                        }
                    },
                    memory: {
                        type: 'object',
                        properties: {
                            usage: { type: 'number' },
                            limit: { type: 'number' },
                            unit: { type: 'string', default: 'MB' }
                        }
                    },
                    network: {
                        type: 'object',
                        properties: {
                            ingress: { type: 'number' },
                            egress: { type: 'number' },
                            unit: { type: 'string', default: 'MB/s' }
                        }
                    },
                    requests: {
                        type: 'object',
                        properties: {
                            total: { type: 'integer' },
                            success: { type: 'integer' },
                            error: { type: 'integer' },
                            latency: { type: 'number' }
                        }
                    }
                }
            },
            Error: {
                type: 'object',
                properties: {
                    error: {
                        type: 'string'
                    },
                    message: {
                        type: 'string'
                    },
                    statusCode: {
                        type: 'integer'
                    },
                    timestamp: {
                        type: 'string',
                        format: 'date-time'
                    }
                }
            }
        };
    }

    defineResponses() {
        return {
            NotFound: {
                description: 'Resource not found',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/Error'
                        }
                    }
                }
            },
            Unauthorized: {
                description: 'Authentication required',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/Error'
                        }
                    }
                }
            },
            ValidationError: {
                description: 'Validation error',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/Error'
                        }
                    }
                }
            },
            ServerError: {
                description: 'Internal server error',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/Error'
                        }
                    }
                }
            }
        };
    }

    defineParameters() {
        return {
            projectId: {
                name: 'projectId',
                in: 'path',
                required: true,
                schema: {
                    type: 'string',
                    format: 'uuid'
                },
                description: 'Project ID'
            },
            applicationId: {
                name: 'applicationId',
                in: 'path',
                required: true,
                schema: {
                    type: 'string',
                    format: 'uuid'
                },
                description: 'Application ID'
            },
            databaseId: {
                name: 'databaseId',
                in: 'path',
                required: true,
                schema: {
                    type: 'string',
                    format: 'uuid'
                },
                description: 'Database ID'
            },
            limit: {
                name: 'limit',
                in: 'query',
                schema: {
                    type: 'integer',
                    default: 20,
                    minimum: 1,
                    maximum: 100
                },
                description: 'Number of items to return'
            },
            offset: {
                name: 'offset',
                in: 'query',
                schema: {
                    type: 'integer',
                    default: 0,
                    minimum: 0
                },
                description: 'Number of items to skip'
            }
        };
    }

    definePaths() {
        return {
            '/health': {
                get: {
                    tags: ['System'],
                    summary: 'Health check',
                    description: 'Check if the API is running and healthy',
                    responses: {
                        '200': {
                            description: 'API is healthy',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            status: { type: 'string', example: 'healthy' },
                                            timestamp: { type: 'string', format: 'date-time' },
                                            version: { type: 'string' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            '/api/projects': {
                get: {
                    tags: ['Projects'],
                    summary: 'List all projects',
                    description: 'Retrieve a list of all projects',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { $ref: '#/components/parameters/limit' },
                        { $ref: '#/components/parameters/offset' }
                    ],
                    responses: {
                        '200': {
                            description: 'List of projects',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'array',
                                        items: {
                                            $ref: '#/components/schemas/Project'
                                        }
                                    }
                                }
                            }
                        },
                        '401': { $ref: '#/components/responses/Unauthorized' }
                    }
                },
                post: {
                    tags: ['Projects'],
                    summary: 'Create a new project',
                    description: 'Create a new project with the specified configuration',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/Project'
                                }
                            }
                        }
                    },
                    responses: {
                        '201': {
                            description: 'Project created successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Project'
                                    }
                                }
                            }
                        },
                        '400': { $ref: '#/components/responses/ValidationError' },
                        '401': { $ref: '#/components/responses/Unauthorized' }
                    }
                }
            },
            '/api/projects/{projectId}': {
                get: {
                    tags: ['Projects'],
                    summary: 'Get project by ID',
                    description: 'Retrieve detailed information about a specific project',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { $ref: '#/components/parameters/projectId' }
                    ],
                    responses: {
                        '200': {
                            description: 'Project details',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Project'
                                    }
                                }
                            }
                        },
                        '401': { $ref: '#/components/responses/Unauthorized' },
                        '404': { $ref: '#/components/responses/NotFound' }
                    }
                },
                put: {
                    tags: ['Projects'],
                    summary: 'Update project',
                    description: 'Update an existing project configuration',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { $ref: '#/components/parameters/projectId' }
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/Project'
                                }
                            }
                        }
                    },
                    responses: {
                        '200': {
                            description: 'Project updated successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Project'
                                    }
                                }
                            }
                        },
                        '400': { $ref: '#/components/responses/ValidationError' },
                        '401': { $ref: '#/components/responses/Unauthorized' },
                        '404': { $ref: '#/components/responses/NotFound' }
                    }
                },
                delete: {
                    tags: ['Projects'],
                    summary: 'Delete project',
                    description: 'Delete a project and all its resources',
                    security: [{ bearerAuth: [] }],
                    parameters: [
                        { $ref: '#/components/parameters/projectId' }
                    ],
                    responses: {
                        '204': {
                            description: 'Project deleted successfully'
                        },
                        '401': { $ref: '#/components/responses/Unauthorized' },
                        '404': { $ref: '#/components/responses/NotFound' }
                    }
                }
            },
            '/api/applications/deploy': {
                post: {
                    tags: ['Applications'],
                    summary: 'Deploy application',
                    description: 'Deploy a new version of an application',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['projectId', 'gitUrl', 'branch'],
                                    properties: {
                                        projectId: {
                                            type: 'string',
                                            format: 'uuid'
                                        },
                                        gitUrl: {
                                            type: 'string',
                                            format: 'uri'
                                        },
                                        branch: {
                                            type: 'string',
                                            default: 'main'
                                        },
                                        environment: {
                                            type: 'object',
                                            additionalProperties: {
                                                type: 'string'
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        '202': {
                            description: 'Deployment started',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Deployment'
                                    }
                                }
                            }
                        },
                        '400': { $ref: '#/components/responses/ValidationError' },
                        '401': { $ref: '#/components/responses/Unauthorized' }
                    }
                }
            },
            '/api/databases': {
                get: {
                    tags: ['Databases'],
                    summary: 'List all databases',
                    description: 'Retrieve a list of all databases',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': {
                            description: 'List of databases',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'array',
                                        items: {
                                            $ref: '#/components/schemas/Database'
                                        }
                                    }
                                }
                            }
                        },
                        '401': { $ref: '#/components/responses/Unauthorized' }
                    }
                },
                post: {
                    tags: ['Databases'],
                    summary: 'Create database',
                    description: 'Create a new database instance',
                    security: [{ bearerAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/Database'
                                }
                            }
                        }
                    },
                    responses: {
                        '201': {
                            description: 'Database created successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Database'
                                    }
                                }
                            }
                        },
                        '400': { $ref: '#/components/responses/ValidationError' },
                        '401': { $ref: '#/components/responses/Unauthorized' }
                    }
                }
            },
            '/api/metrics': {
                get: {
                    tags: ['Monitoring'],
                    summary: 'Get system metrics',
                    description: 'Retrieve current system metrics and performance data',
                    security: [{ bearerAuth: [] }],
                    responses: {
                        '200': {
                            description: 'System metrics',
                            content: {
                                'application/json': {
                                    schema: {
                                        $ref: '#/components/schemas/Metrics'
                                    }
                                }
                            }
                        },
                        '401': { $ref: '#/components/responses/Unauthorized' }
                    }
                }
            }
        };
    }

    defineTags() {
        return [
            {
                name: 'System',
                description: 'System health and status endpoints'
            },
            {
                name: 'Projects',
                description: 'Project management operations'
            },
            {
                name: 'Applications',
                description: 'Application deployment and management'
            },
            {
                name: 'Databases',
                description: 'Database provisioning and management'
            },
            {
                name: 'Monitoring',
                description: 'Metrics and monitoring endpoints'
            }
        ];
    }

    async generateDocumentation() {
        console.log('📚 Generating API documentation...');
        
        // Save OpenAPI spec to file
        const specPath = path.join(__dirname, '..', 'docs', 'openapi.json');
        await fs.mkdir(path.dirname(specPath), { recursive: true });
        await fs.writeFile(specPath, JSON.stringify(this.openApiSpec, null, 2));
        console.log(`✅ OpenAPI spec saved to: ${specPath}`);
        
        // Generate Markdown documentation
        const markdown = this.generateMarkdown();
        const mdPath = path.join(__dirname, '..', 'docs', 'API_REFERENCE.md');
        await fs.writeFile(mdPath, markdown);
        console.log(`✅ Markdown documentation saved to: ${mdPath}`);
        
        // Generate Postman collection
        const postmanCollection = this.generatePostmanCollection();
        const postmanPath = path.join(__dirname, '..', 'docs', 'codeb-api.postman_collection.json');
        await fs.writeFile(postmanPath, JSON.stringify(postmanCollection, null, 2));
        console.log(`✅ Postman collection saved to: ${postmanPath}`);
        
        return {
            openApiSpec: specPath,
            markdown: mdPath,
            postmanCollection: postmanPath
        };
    }

    generateMarkdown() {
        let markdown = `# CodeB API Reference\n\n`;
        markdown += `Version: ${this.openApiSpec.info.version}\n\n`;
        markdown += `${this.openApiSpec.info.description}\n\n`;
        
        markdown += `## Base URLs\n\n`;
        this.openApiSpec.servers.forEach(server => {
            markdown += `- **${server.description}**: ${server.url}\n`;
        });
        
        markdown += `\n## Authentication\n\n`;
        markdown += `This API uses JWT Bearer tokens for authentication. Include the token in the Authorization header:\n\n`;
        markdown += `\`\`\`\nAuthorization: Bearer <your-token>\n\`\`\`\n\n`;
        
        markdown += `## Endpoints\n\n`;
        
        Object.entries(this.openApiSpec.paths).forEach(([path, methods]) => {
            Object.entries(methods).forEach(([method, spec]) => {
                markdown += `### ${method.toUpperCase()} ${path}\n\n`;
                markdown += `**${spec.summary}**\n\n`;
                markdown += `${spec.description}\n\n`;
                
                if (spec.parameters && spec.parameters.length > 0) {
                    markdown += `**Parameters:**\n\n`;
                    spec.parameters.forEach(param => {
                        const p = param.$ref ? this.resolveRef(param.$ref) : param;
                        markdown += `- \`${p.name}\` (${p.in}): ${p.description || ''}\n`;
                    });
                    markdown += '\n';
                }
                
                if (spec.requestBody) {
                    markdown += `**Request Body:**\n\n`;
                    markdown += `\`\`\`json\n`;
                    markdown += `// Content-Type: application/json\n`;
                    markdown += `${JSON.stringify(this.getExampleFromSchema(spec.requestBody.content['application/json'].schema), null, 2)}\n`;
                    markdown += `\`\`\`\n\n`;
                }
                
                markdown += `**Responses:**\n\n`;
                Object.entries(spec.responses).forEach(([code, response]) => {
                    markdown += `- \`${code}\`: ${response.description || ''}\n`;
                });
                markdown += '\n---\n\n';
            });
        });
        
        return markdown;
    }

    generatePostmanCollection() {
        const collection = {
            info: {
                name: 'CodeB API',
                description: this.openApiSpec.info.description,
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
            },
            item: [],
            variable: [
                {
                    key: 'baseUrl',
                    value: 'http://localhost:3000',
                    type: 'string'
                },
                {
                    key: 'token',
                    value: '',
                    type: 'string'
                }
            ]
        };
        
        // Group endpoints by tags
        const groups = {};
        
        Object.entries(this.openApiSpec.paths).forEach(([path, methods]) => {
            Object.entries(methods).forEach(([method, spec]) => {
                const tag = spec.tags ? spec.tags[0] : 'Other';
                
                if (!groups[tag]) {
                    groups[tag] = {
                        name: tag,
                        item: []
                    };
                }
                
                const request = {
                    name: spec.summary,
                    request: {
                        method: method.toUpperCase(),
                        header: [],
                        url: {
                            raw: `{{baseUrl}}${path}`,
                            host: ['{{baseUrl}}'],
                            path: path.split('/').filter(p => p)
                        }
                    }
                };
                
                if (spec.security) {
                    request.request.header.push({
                        key: 'Authorization',
                        value: 'Bearer {{token}}',
                        type: 'text'
                    });
                }
                
                if (spec.requestBody) {
                    request.request.body = {
                        mode: 'raw',
                        raw: JSON.stringify(this.getExampleFromSchema(spec.requestBody.content['application/json'].schema), null, 2),
                        options: {
                            raw: {
                                language: 'json'
                            }
                        }
                    };
                    request.request.header.push({
                        key: 'Content-Type',
                        value: 'application/json',
                        type: 'text'
                    });
                }
                
                groups[tag].item.push(request);
            });
        });
        
        collection.item = Object.values(groups);
        
        return collection;
    }

    getExampleFromSchema(schema) {
        if (schema.$ref) {
            const refPath = schema.$ref.split('/');
            const schemaName = refPath[refPath.length - 1];
            schema = this.openApiSpec.components.schemas[schemaName];
        }
        
        if (schema.type === 'object') {
            const example = {};
            if (schema.properties) {
                Object.entries(schema.properties).forEach(([key, prop]) => {
                    example[key] = this.getExampleValue(prop);
                });
            }
            return example;
        } else if (schema.type === 'array') {
            return [this.getExampleFromSchema(schema.items)];
        } else {
            return this.getExampleValue(schema);
        }
    }

    getExampleValue(prop) {
        if (prop.example) return prop.example;
        if (prop.default) return prop.default;
        
        switch (prop.type) {
            case 'string':
                if (prop.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
                if (prop.format === 'date-time') return '2024-01-01T00:00:00Z';
                if (prop.format === 'uri') return 'https://example.com';
                if (prop.format === 'hostname') return 'example.com';
                if (prop.enum) return prop.enum[0];
                return 'string';
            case 'integer':
            case 'number':
                return prop.minimum || 0;
            case 'boolean':
                return true;
            case 'object':
                return {};
            case 'array':
                return [];
            default:
                return null;
        }
    }

    resolveRef(ref) {
        const parts = ref.split('/');
        let current = this.openApiSpec;
        
        for (let i = 1; i < parts.length; i++) {
            current = current[parts[i]];
        }
        
        return current;
    }

    async startDocumentationServer(port = 3001) {
        const app = express();
        
        // Serve Swagger UI
        app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(this.openApiSpec, {
            customCss: '.swagger-ui .topbar { display: none }',
            customSiteTitle: 'CodeB API Documentation'
        }));
        
        // Serve OpenAPI spec
        app.get('/openapi.json', (req, res) => {
            res.json(this.openApiSpec);
        });
        
        // Redirect root to docs
        app.get('/', (req, res) => {
            res.redirect('/api-docs');
        });
        
        app.listen(port, () => {
            console.log(`📚 API Documentation server running at http://localhost:${port}/api-docs`);
            console.log(`📄 OpenAPI spec available at http://localhost:${port}/openapi.json`);
        });
    }
}

// Run the documentation generator
if (require.main === module) {
    const generator = new CodeBApiDocGenerator();
    
    generator.generateDocumentation()
        .then((paths) => {
            console.log('\n✅ API documentation generated successfully!');
            console.log('\nGenerated files:');
            Object.entries(paths).forEach(([type, path]) => {
                console.log(`  - ${type}: ${path}`);
            });
            
            // Optionally start documentation server
            if (process.argv.includes('--serve')) {
                const port = process.argv[process.argv.indexOf('--serve') + 1] || 3001;
                generator.startDocumentationServer(port);
            } else {
                console.log('\n💡 Tip: Run with --serve flag to start documentation server');
                console.log('   node scripts/api-documentation.js --serve 3001');
            }
        })
        .catch((error) => {
            console.error('❌ Error generating documentation:', error);
            process.exit(1);
        });
}

module.exports = CodeBApiDocGenerator;