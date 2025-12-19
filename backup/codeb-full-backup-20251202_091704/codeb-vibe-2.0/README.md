# 🚀 CodeB Vibe 2.0 - Multi-Agent System

## 📌 Overview

CodeB Vibe는 Claude Code의 Task Tool을 활용한 차세대 Multi-Agent 시스템입니다.
메인 에이전트와 7개 동시 서브 에이전트가 협력하여 프로젝트를 효율적으로 분석하고 최적화합니다.

## 🏗️ Architecture

```
Vibe Master (메인 에이전트)
├── 4-Stage Ping-Pong Protocol
├── Context Management (200K Token Optimization)
├── MCP Contest Continuity Integration
└── 7 Vibe Specialists (병렬 서브 에이전트)
    ├── Frontend Specialist
    ├── Backend Specialist  
    ├── Security Specialist
    ├── Performance Specialist
    ├── Quality Specialist
    ├── DevOps Specialist
    └── Architecture Specialist
```

## 🔄 4-Stage Ping-Pong Protocol

1. **Strategy Phase**: 프로젝트 목표 및 전략 수립
2. **Specification Phase**: 상세 기술 사양 정의  
3. **Validation Phase**: 사양 검증 및 최적화
4. **Execution Phase**: 7개 서브 에이전트 병렬 실행

## 🎯 Key Features

### Context Efficiency
- **Token Optimization**: 200K 제한 대응 전략
- **MD File Storage**: 인간 읽기 가능한 사양 저장
- **JSON Context**: MCP를 통한 구조화된 데이터 영속화
- **Selective Loading**: 필요시에만 컨텍스트 로드

### Sub-Agent Coordination
- **7 Parallel Agents**: 동시 실행으로 성능 극대화
- **Domain Specialization**: 각 영역별 전문화
- **Result Aggregation**: 통합된 결과 도출
- **Context Sharing**: 에이전트간 정보 공유

### MCP Integration
- **Contest Continuity**: 기존 MCP 서버 연동
- **Context Persistence**: 세션간 상태 유지
- **Pattern Recognition**: 코드 패턴 학습 및 재사용

## 📦 Structure

```
codeb-vibe-2.0/
├── vibe-master/           # 메인 에이전트 시스템
│   ├── ping-pong.js      # 4-Stage 프로토콜
│   ├── context-manager.js # 컨텍스트 관리
│   └── agent-coordinator.js # 서브 에이전트 조율
├── vibe-specialists/      # 7개 서브 에이전트
│   ├── frontend.js
│   ├── backend.js
│   ├── security.js
│   ├── performance.js
│   ├── quality.js
│   ├── devops.js
│   └── architecture.js
├── definitions/           # MD 기반 사양 저장
│   ├── project-specs/
│   ├── patterns/
│   └── templates/
└── integration/          # MCP 연동
    ├── mcp-bridge.js     # MCP 브릿지
    └── context-sync.js   # 컨텍스트 동기화
```

## 🔧 Usage

### New Project
```bash
/cb vibe new --name "project-name" --framework nextjs
```

### Existing Project Optimization  
```bash
/cb vibe optimize --analyze-depth deep --specialists 7
```

### Context Management
```bash
/cb vibe context --save checkpoint-name
/cb vibe context --load checkpoint-name
```

## 📊 Performance Targets

- **Context Efficiency**: 60% 토큰 절약
- **Parallel Processing**: 7배 속도 향상
- **Pattern Reuse**: 80% 코드 재사용률
- **Error Reduction**: 90% 중복 제거

---

© 2024 CodeB Vibe - Multi-Agent Development System