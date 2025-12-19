# 재사용 가능한 프로젝트 개발 MCP 시스템 - 페이지 2

---
**네비게이션**: [◀ 페이지 1](./ai.md) | [목차](./ai-index.md) | [페이지 3 ▶](./ai-page-3.md)  
**현재 페이지**: 2/3 (401-800줄)
---

## 📝 프로젝트 문서 버전 관리 시스템

### 핵심 요구사항
AI.md와 같은 핵심 문서의 **모든 변경사항을 추적**하고 **언제든 롤백** 가능하도록 관리

### 🔄 변경 추적 시스템

#### 1. 로그 기록 구조
```json
{
  "changeLog": [
    {
      "timestamp": "2024-09-04T14:30:25Z",
      "action": "ADD",
      "section": "컨테스트 Context 영속화 시스템",
      "content": "## 🔄 컨테스트 Context 영속화 시스템...",
      "author": "claude",
      "reason": "바이브 코딩 컨테스트 최적화 기능 추가"
    },
    {
      "timestamp": "2024-09-04T14:25:10Z", 
      "action": "MODIFY",
      "section": "MCP 서버 구조",
      "before": "기존 내용...",
      "after": "수정된 내용...",
      "author": "claude",
      "reason": "사용자 피드백 반영"
    },
    {
      "timestamp": "2024-09-04T14:20:05Z",
      "action": "DELETE", 
      "section": "삭제된 섹션명",
      "deletedContent": "삭제된 내용...",
      "author": "claude",
      "reason": "중복 내용 제거"
    }
  ]
}
```

#### 2. MCP 도구 구현

##### `log_document_change` 도구
```typescript
interface LogDocumentChange {
  name: "log_document_change";
  description: "문서 변경사항 로그 기록";
  inputSchema: {
    filePath: string;
    action: "ADD" | "MODIFY" | "DELETE";
    section: string;
    content?: string;
    beforeContent?: string;
    afterContent?: string;
    reason: string;
  };
}
```

##### `rollback_document` 도구
```typescript
interface RollbackDocument {
  name: "rollback_document";
  description: "특정 시점으로 문서 롤백";
  inputSchema: {
    filePath: string;
    targetTimestamp: string;
    previewOnly?: boolean;
  };
}
```

##### `show_document_history` 도구
```typescript
interface ShowDocumentHistory {
  name: "show_document_history";
  description: "문서 변경 이력 조회";
  inputSchema: {
    filePath: string;
    fromDate?: string;
    toDate?: string;
    actionType?: "ADD" | "MODIFY" | "DELETE";
  };
}
```

### 📂 파일 구조
```
project/
├── ai.md                    # 메인 문서
├── .ai-versions/           # 버전 관리 폴더
│   ├── change-log.json     # 변경 이력
│   ├── snapshots/          # 전체 스냅샷
│   │   ├── 2024-09-04-14-30-25.md
│   │   ├── 2024-09-04-14-25-10.md
│   │   └── 2024-09-04-14-20-05.md
│   └── diffs/             # 변경 차이점
│       ├── diff-001.patch
│       ├── diff-002.patch
│       └── diff-003.patch
```

### 🛡️ 안전장치

#### 자동 백업 트리거
- 중요한 섹션 변경 시 자동 스냅샷 생성
- 일정 시간(예: 30분)마다 자동 백업
- 큰 변경사항(1000자 이상) 시 확인 요청

#### 롤백 안전성
```bash
# 롤백 전 미리보기
mcp-docs preview-rollback ai.md --to "2024-09-04T14:25:10Z"

# 안전한 롤백 (백업 후 실행)
mcp-docs rollback ai.md --to "2024-09-04T14:25:10Z" --backup

# 응급 복구 (최근 백업으로)
mcp-docs emergency-restore ai.md --last-known-good
```

### 💡 실사용 시나리오
1. **실수 복구**: 잘못된 수정 즉시 롤백
2. **변경 추적**: 언제 무엇이 바뀌었는지 명확히 파악  
3. **협업 지원**: 변경 이유와 맥락 공유
4. **실험 안전**: 새로운 아이디어 시도 후 필요시 복원

## 📄 문서 페이지 분할 관리 시스템

### 핵심 규칙
**500줄 이상** 되면 자동으로 다음 페이지를 생성하여 문서 관리의 효율성 보장

### 🗂️ 페이지 분할 구조
```
project/
├── ai.md              # 메인 문서 (1-500줄)
├── ai-page-2.md       # 2페이지 (501-1000줄)  
├── ai-page-3.md       # 3페이지 (1001-1500줄)
├── ai-index.md        # 전체 목차 및 네비게이션
└── .ai-versions/      # 각 페이지별 버전 관리
    ├── ai-page-1/
    ├── ai-page-2/
    └── ai-page-3/
```

### 🔄 자동 분할 시스템

#### `check_document_length` 도구
```typescript
interface CheckDocumentLength {
  name: "check_document_length";
  description: "문서 길이 체크 및 분할 필요성 판단";
  inputSchema: {
    filePath: string;
    maxLines: number; // 기본값: 500
  };
}
```

#### `split_document_page` 도구  
```typescript
interface SplitDocumentPage {
  name: "split_document_page";
  description: "문서를 새 페이지로 분할";
  inputSchema: {
    filePath: string;
    splitAt: number; // 분할할 줄 번호
    newPageName: string; // ai-page-2.md
  };
}
```

#### `update_navigation_index` 도구
```typescript  
interface UpdateNavigationIndex {
  name: "update_navigation_index";
  description: "페이지 네비게이션 인덱스 업데이트";
  inputSchema: {
    pages: Array<{
      fileName: string;
      title: string; 
      lineRange: string; // "1-500"
      lastModified: string;
    }>;
  };
}
```

### 📋 ai-index.md 구조 예시
```markdown
# AI.md 문서 인덱스

## 📖 페이지 목록
- [페이지 1: 기본 설정](./ai.md) (1-500줄) - 2024-09-04 업데이트
- [페이지 2: 고급 기능](./ai-page-2.md) (501-1000줄) - 2024-09-04 업데이트  
- [페이지 3: 확장 기능](./ai-page-3.md) (1001-1500줄) - 2024-09-04 업데이트

## 🔍 빠른 검색
- [MCP 서버 구조](#페이지-1) 
- [컨테스트 Context 시스템](#페이지-2)
- [버전 관리 시스템](#페이지-3)

## 📊 통계
- 총 페이지: 3개
- 총 줄 수: 1,500줄
- 마지막 업데이트: 2024-09-04T15:30:25Z
```

### 🚨 자동 트리거
```bash
# 500줄 초과 시 자동 실행
if (document.lines > 500) {
  createNewPage();
  updateIndex();
  notifyUser("문서가 분할되었습니다.");
}
```

### 🔗 페이지 간 연결
각 페이지 하단에 자동 네비게이션 추가:
```markdown
---
**네비게이션**: [◀ 이전](./ai.md) | [목차](./ai-index.md) | [다음 ▶](./ai-page-3.md)
**현재 페이지**: 2/3 (501-1000줄)
```

---
**네비게이션**: [◀ 페이지 1](./ai.md) | [목차](./ai-index.md) | [페이지 3 ▶](./ai-page-3.md)  
**현재 페이지**: 2/3 (401-800줄)
---