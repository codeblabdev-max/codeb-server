# 🎯 CodeB Master MCP Rules & Architecture

## 🏗️ Core Architecture Principles

### 1. Project Knowledge Bank
CodeB Master MCP는 프로젝트의 모든 지식을 중앙 관리하는 메모리 뱅크 역할을 수행합니다.

```yaml
knowledge_categories:
  project_structure:
    - directory_layout
    - module_dependencies
    - file_relationships
    - naming_conventions
  
  database_schema:
    - table_definitions
    - relationships
    - indexes
    - constraints
    - migration_history
  
  api_contracts:
    - endpoint_specifications
    - request_response_formats
    - authentication_rules
    - rate_limiting
  
  business_rules:
    - domain_logic
    - validation_rules
    - calculation_formulas
    - workflow_processes
  
  coding_standards:
    - style_guides
    - best_practices
    - anti_patterns
    - review_checklist
```

### 2. Schema Management Rules

#### Database Schema Governance
```typescript
interface SchemaRule {
  tableName: {
    pattern: "snake_case";
    prefix?: "tbl_" | "view_" | "proc_";
    maxLength: 30;
  };
  
  columnName: {
    pattern: "snake_case";
    standardPrefixes: {
      id: "id_";
      foreign: "fk_";
      boolean: "is_" | "has_" | "can_";
      date: "created_at" | "updated_at" | "deleted_at";
      count: "count_" | "total_";
    };
  };
  
  constraints: {
    primaryKey: "pk_{table_name}";
    foreignKey: "fk_{table}_{reference}";
    unique: "uq_{table}_{columns}";
    check: "ck_{table}_{rule}";
    index: "idx_{table}_{columns}";
  };
}
```

#### API Schema Standards
```typescript
interface APISchemaRule {
  endpoints: {
    pattern: "/{version}/{resource}/{action?}";
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"];
    versioning: "v1" | "v2" | "v3";
  };
  
  requestBody: {
    format: "camelCase";
    validation: "required";
    maxSize: "10MB";
  };
  
  response: {
    structure: {
      success: boolean;
      data?: any;
      error?: {
        code: string;
        message: string;
        details?: any;
      };
      meta?: {
        timestamp: string;
        version: string;
        pagination?: object;
      };
    };
  };
}
```

### 3. Context Management Protocol

#### Token Optimization Rules
```yaml
token_management:
  capture_rules:
    - essential_only: true
    - compression: enabled
    - deduplication: automatic
    - max_context_size: 50000
  
  priority_levels:
    critical: # Always maintain
      - current_task_context
      - active_file_changes
      - error_states
    
    high: # Maintain if space
      - recent_decisions
      - test_results
      - performance_metrics
    
    medium: # Compress/summarize
      - historical_changes
      - documentation
      - comments
    
    low: # Drop if needed
      - formatting_details
      - whitespace
      - redundant_imports
```

#### State Persistence Rules
```javascript
const statePersistenceRules = {
  saveFrequency: "on_significant_change",
  
  significantChanges: [
    "schema_modification",
    "api_contract_change",
    "architecture_decision",
    "test_completion",
    "error_resolution"
  ],
  
  snapshotStructure: {
    timestamp: Date.now(),
    sessionId: "uuid",
    projectState: {
      files: "modified_only",
      tests: "results_summary",
      errors: "full_context",
      decisions: "rationale_included"
    }
  }
};
```

### 4. Agent Coordination Rules

#### Task Delegation Protocol
```yaml
delegation_rules:
  master_orchestrator:
    responsibilities:
      - requirement_analysis
      - task_decomposition
      - agent_assignment
      - result_integration
      - quality_validation
    
    cannot_delegate:
      - final_decisions
      - architecture_choices
      - security_validations
  
  specialist_agents:
    must_report:
      - task_completion
      - blocking_issues
      - quality_metrics
      - resource_usage
    
    autonomous_decisions:
      - implementation_details
      - tool_selection
      - optimization_techniques
```

#### Communication Protocol
```typescript
interface AgentCommunication {
  messageFormat: {
    from: AgentID;
    to: AgentID | "broadcast";
    type: "request" | "response" | "status" | "error";
    priority: "critical" | "high" | "normal" | "low";
    payload: {
      task?: TaskSpecification;
      result?: TaskResult;
      status?: StatusUpdate;
      error?: ErrorReport;
    };
    timestamp: number;
    correlationId: string;
  };
  
  responseTime: {
    critical: "< 1s";
    high: "< 5s";
    normal: "< 30s";
    low: "< 2min";
  };
}
```

### 5. Quality Assurance Rules

#### Code Quality Standards
```yaml
quality_gates:
  pre_commit:
    - syntax_validation
    - type_checking
    - linting
    - formatting
  
  pre_merge:
    - unit_tests: "coverage > 80%"
    - integration_tests: "all passing"
    - security_scan: "no critical issues"
    - performance_test: "no regression"
  
  pre_deploy:
    - e2e_tests: "all critical paths"
    - load_testing: "meets SLA"
    - rollback_plan: "verified"
    - monitoring: "configured"
```

#### Documentation Standards
```yaml
documentation_requirements:
  code_level:
    - functions: "JSDoc/TSDoc required"
    - complex_logic: "inline comments"
    - api_endpoints: "OpenAPI spec"
    - database_schema: "migration comments"
  
  project_level:
    - README: "setup & usage"
    - ARCHITECTURE: "system design"
    - API_DOCS: "endpoint reference"
    - CONTRIBUTING: "dev guidelines"
```

### 6. Error Handling & Recovery

#### Error Classification
```typescript
enum ErrorSeverity {
  CRITICAL = "system_failure",
  HIGH = "feature_broken",
  MEDIUM = "degraded_performance",
  LOW = "cosmetic_issue"
}

interface ErrorHandlingRule {
  severity: ErrorSeverity;
  response: {
    immediate_action: string;
    notification: boolean;
    rollback: boolean;
    logging_level: "error" | "warn" | "info";
  };
  recovery: {
    automatic: boolean;
    strategy: "retry" | "fallback" | "manual";
    max_attempts: number;
  };
}
```

### 7. Performance Optimization Rules

#### Resource Management
```yaml
resource_limits:
  memory:
    per_agent: "512MB"
    total_system: "4GB"
    cache_size: "1GB"
  
  cpu:
    per_agent: "25%"
    parallel_agents: 4
    priority_boost: "critical_tasks"
  
  token_usage:
    per_request: "50K"
    per_session: "150K"
    emergency_reserve: "50K"
```

#### Optimization Strategies
```javascript
const optimizationRules = {
  caching: {
    strategy: "LRU",
    ttl: 3600,
    invalidation: "on_change"
  },
  
  batching: {
    enabled: true,
    maxBatchSize: 10,
    maxWaitTime: 1000
  },
  
  compression: {
    algorithm: "gzip",
    threshold: 1024,
    level: 6
  }
};
```

## 🔄 Integration with Claude.md

이 규칙들은 CLAUDE.md의 다음 섹션과 통합됩니다:

1. **COMMANDS.md**: CodeB 전용 명령어 추가
2. **FLAGS.md**: CodeB 최적화 플래그
3. **PRINCIPLES.md**: CodeB 아키텍처 원칙
4. **MCP.md**: CodeB Master MCP 서버 정의
5. **AGENTS.md**: 7-Agent 시스템 명세

## 📝 Usage Examples

### 프로젝트 초기화
```bash
# CodeB Master MCP로 프로젝트 지식 초기화
mcp-codeb init --project-path . --scan-depth full

# 스키마 규칙 적용
mcp-codeb schema validate --type database --fix

# 컨텍스트 캡처
mcp-codeb context capture --name "initial-setup"
```

### 개발 중 활용
```bash
# 스키마 변경 전 검증
mcp-codeb schema check-impact --change "add_column"

# API 계약 검증
mcp-codeb api validate-contract --spec openapi.yaml

# 에이전트 작업 조율
mcp-codeb agent coordinate --task "implement-feature" --parallel
```

### 품질 관리
```bash
# 품질 게이트 실행
mcp-codeb quality run-gates --stage pre-commit

# 성능 분석
mcp-codeb performance analyze --focus "api-endpoints"

# 문서화 검증
mcp-codeb docs validate --level project
```

## 🚀 Best Practices

1. **항상 컨텍스트 우선**: 작업 시작 전 컨텍스트 로드
2. **점진적 상태 저장**: 중요 변경사항마다 저장
3. **병렬 작업 활용**: 독립적 작업은 동시 실행
4. **품질 게이트 준수**: 모든 단계에서 검증
5. **토큰 효율성**: 압축과 캐싱 적극 활용

---

© 2024 CodeB Master MCP - Intelligent Project Memory Bank