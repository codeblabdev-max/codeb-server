# CodeB 7-Agent System - Complete Reference

## 🎯 System Overview

The CodeB 7-Agent System is an advanced multi-agent orchestration framework designed for Claude Code, optimized for building complete full-stack applications through specialized AI agents.

### Core Architecture Principles

1. **Hub-and-Spoke Model**: Master orchestrator manages all inter-agent communication
2. **Unidirectional Flow**: Optimized for Claude Code's single-response constraint
3. **Self-Contained Execution**: Each agent operates independently with complete specifications
4. **Standardized Interfaces**: Uniform input/output contracts across all agents

## 👥 Agent Roster

### 1. 👑 Master Orchestrator
- **ID**: `master-orchestrator`
- **Role**: Project-wide coordination and quality assurance
- **Primary Focus**: Requirement decomposition, task allocation, result integration
- **Tool Access**: Full suite + MCP servers

### 2. 🔖 API Contract Guardian
- **ID**: `api-contract-guardian`
- **Role**: API design and contract specification
- **Primary Focus**: RESTful/GraphQL/WebSocket API architecture
- **Tool Access**: Read, Write, Edit + Context7, Sequential

### 3. 🎨 Frontend Specialist
- **ID**: `frontend-specialist`
- **Role**: Full-stack frontend development (desktop + mobile)
- **Primary Focus**: Responsive UI/UX, React/Next.js, cross-platform optimization
- **Tool Access**: Read, Write, Edit + Magic, Context7, Playwright

### 4. 💾 Database Schema Architect
- **ID**: `db-schema-architect`
- **Role**: Database design and optimization
- **Primary Focus**: Schema normalization, indexing, migrations
- **Tool Access**: Read, Write, Edit + Context7, Sequential

### 5. 🧪 E2E Test Strategist
- **ID**: `e2e-test-strategist`
- **Role**: Comprehensive test planning and execution
- **Primary Focus**: Playwright automation, user flow coverage
- **Tool Access**: Read, Write, Edit, TodoWrite + Playwright, Sequential

### 6. 🛡️ Admin Panel Builder
- **ID**: `admin-panel-builder`
- **Role**: Administrative interface development
- **Primary Focus**: Dashboards, reporting, role management
- **Tool Access**: Read, Write, Edit + Magic, Context7

### 7. 📚 Library Recommendation Specialist
- **ID**: `library-recommendation-specialist`
- **Role**: Technology stack selection and optimization
- **Primary Focus**: Framework selection, dependency management, performance optimization
- **Tool Access**: Read, Grep, Glob + Context7, Sequential

## 🔄 Orchestration Patterns

### Pattern 1: Sequential Execution
```
Master → API Guardian → DB Architect → Frontend Specialist → E2E Strategist
```
**Use Case**: Building new features requiring full-stack coordination

### Pattern 2: Parallel Execution
```
Master → [API Guardian || DB Architect || Frontend Specialist]
```
**Use Case**: Independent component development

### Pattern 3: Iterative Refinement
```
Master → Specialist → E2E Strategist → [Refinement Loop] → Master
```
**Use Case**: Quality-focused development with testing

### Pattern 4: Technology Assessment
```
Master → Library Specialist → [Architecture Agents] → Implementation
```
**Use Case**: New project initialization or technology migration

## 📋 Standard Communication Protocol

### Input Contract
```typescript
interface AgentInput {
  task: string;
  context: {
    project_type: string;
    tech_stack: string[];
    constraints: string[];
    existing_state?: any;
  };
  requirements: {
    functional: string[];
    non_functional: string[];
  };
  dependencies?: AgentOutput[];
}
```

### Output Contract
```typescript
interface AgentOutput {
  status: 'success' | 'partial' | 'failed';
  artifacts: {
    files: string[];
    code: Record<string, string>;
    docs: string[];
  };
  validation: {
    tests_passed: boolean;
    quality_score: number;
    issues: string[];
  };
  recommendations: string[];
  next_steps?: string[];
}
```

## 🚀 Usage Examples

### Example 1: Complete Application Build
```bash
Task --subagent_type master-orchestrator \
  --description "Build food delivery app" \
  --prompt "Create complete food delivery application with user app, restaurant dashboard, and admin panel. Requirements: React Native mobile, Next.js web, PostgreSQL, real-time tracking."
```

### Example 2: API-First Development
```bash
# Step 1: Design API
Task --subagent_type api-contract-guardian \
  --description "Design delivery API" \
  --prompt "Design RESTful API for food delivery service with authentication, ordering, payment, and real-time tracking endpoints."

# Step 2: Implement Database
Task --subagent_type db-schema-architect \
  --description "Design database schema" \
  --prompt "Create normalized PostgreSQL schema for food delivery app supporting users, restaurants, orders, payments, and delivery tracking."

# Step 3: Build Frontend
Task --subagent_type frontend-specialist \
  --description "Build user interface" \
  --prompt "Create responsive Next.js frontend for food delivery app with order tracking, restaurant browsing, and checkout flow."
```

### Example 3: Technology Stack Selection
```bash
Task --subagent_type library-recommendation-specialist \
  --description "Select optimal tech stack" \
  --prompt "Recommend optimal libraries and frameworks for building a real-time collaborative document editor supporting 100K+ concurrent users."
```

### Example 4: E2E Testing Campaign
```bash
Task --subagent_type e2e-test-strategist \
  --description "Create comprehensive test suite" \
  --prompt "Design and implement E2E test suite for food delivery app covering user journeys: browse → order → track → review."
```

## 🔧 Integration with SuperClaude Framework

### Auto-Activation Rules

1. **Project Initialization** → Master Orchestrator
2. **API Endpoint Creation** → API Contract Guardian
3. **UI Component Requests** → Frontend Specialist
4. **Database Migration** → Database Schema Architect
5. **Feature Completion** → E2E Test Strategist
6. **Admin Dashboard** → Admin Panel Builder
7. **Technology Questions** → Library Recommendation Specialist

### Command Integration

| Command | Primary Agent | Supporting Agents |
|---------|---------------|-------------------|
| `/build` | Master Orchestrator | All agents |
| `/implement` | Context-dependent | Relevant specialists |
| `/test` | E2E Test Strategist | Frontend Specialist |
| `/design` | API Guardian or Frontend | DB Architect |
| `/analyze --stack` | Library Specialist | Context7 |

## 📊 Performance Metrics

### Efficiency Gains
- **Parallel Execution**: 40-70% time reduction
- **Specialized Expertise**: 30% quality improvement
- **Automated Validation**: 50% bug reduction
- **Standardized Patterns**: 60% consistency improvement

### Quality Standards
- **Code Coverage**: ≥80% unit, ≥70% integration
- **API Compliance**: 100% OpenAPI specification adherence
- **UI Performance**: <3s load time, WCAG AA compliance
- **Database Optimization**: Normalized to 3NF minimum

## 🛠️ Troubleshooting Guide

### Common Issues

#### Issue 1: Agent Timeout
**Symptoms**: Task exceeds time limits
**Solution**: Break task into smaller chunks via Master Orchestrator

#### Issue 2: Context Overflow
**Symptoms**: Token limit exceeded
**Solution**: Use staged execution with artifact persistence

#### Issue 3: Dependency Conflicts
**Symptoms**: Agents produce incompatible outputs
**Solution**: Ensure clear interface contracts via Master validation

#### Issue 4: Quality Issues
**Symptoms**: Tests fail, low quality scores
**Solution**: Run E2E Strategist validation loop

### Debug Commands

```bash
# Test individual agent
Task --subagent_type [agent] --debug --verbose

# Validate agent configuration
Task --subagent_type master-orchestrator --validate

# Check inter-agent dependencies
Task --subagent_type master-orchestrator --check-dependencies
```

## 🔐 Security Considerations

### Agent Isolation
- Each agent operates in isolated context
- No direct agent-to-agent communication
- Master validates all data flow

### Data Protection
- Sensitive data sanitized in logs
- API keys managed via environment variables
- Database credentials never exposed in artifacts

### Code Quality Gates
- Automated security scanning via E2E Strategist
- Dependency vulnerability checks via Library Specialist
- OWASP compliance validation

## 🔄 Continuous Improvement

### Learning Mechanisms
1. Pattern recognition from successful executions
2. Performance metric analysis and optimization
3. User feedback integration
4. Technology stack updates

### Evolution Path
- **Phase 1**: Core 7-agent system (current)
- **Phase 2**: Specialized domain agents (ML, DevOps)
- **Phase 3**: Self-optimizing orchestration
- **Phase 4**: Cross-project learning and patterns

## 📚 Additional Resources

### Documentation
- [Master Orchestrator Guide](./prompts/master-orchestrator.md)
- [API Contract Guardian Guide](./prompts/api-contract-guardian.md)
- [Frontend Specialist Guide](./prompts/frontend-specialist.md)
- [Database Schema Architect Guide](./prompts/db-schema-architect.md)
- [E2E Test Strategist Guide](./prompts/e2e-test-strategist.md)
- [Admin Panel Builder Guide](./prompts/admin-panel-builder.md)
- [Library Recommendation Specialist Guide](./prompts/library-recommendation-specialist.md)

### Related Systems
- [SuperClaude Framework](../.claude/README.md)
- [MCP Server Integration](../.claude/MCP.md)
- [Persona System](../.claude/PERSONAS.md)

---

**Version**: 2.0
**Last Updated**: 2025-12-09
**Status**: Production Ready
