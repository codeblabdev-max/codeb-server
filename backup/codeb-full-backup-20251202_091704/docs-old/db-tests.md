# 데이터베이스 테스트 항목

## 🎯 개요
Context가 유지된 상태에서 자동으로 기록되는 데이터베이스 테스트 항목들

## 📋 현재 등록된 DB 테스트

### ✅ 완료된 테스트
- 없음 (신규 프로젝트)

### 📝 테스트 대기 목록
- 테이블/스키마 생성 시 자동 추가됩니다

## 🤖 자동 기록 예시

### 예시: users 테이블 생성 시
```markdown
## 테스트 항목 - users 테이블
**생성 시점**: 2024-09-04T15:45:00Z  
**Context 정보**:
- 테이블명: users
- 컬럼: id, email, password, name, created_at, updated_at
- 인덱스: email (UNIQUE), name
- 관계: sessions (1:N), roles (N:M)

### 테스트 케이스
#### 스키마 테스트
- [ ] 테이블 생성 확인
- [ ] 필수 컬럼 존재 확인 (id, email, password, created_at)
- [ ] 컬럼 타입 검증 (id: UUID, email: VARCHAR, created_at: TIMESTAMP)
- [ ] 제약조건 확인 (email UNIQUE, password NOT NULL)
- [ ] 인덱스 생성 확인 (email 유니크 인덱스)

#### CRUD 쿼리 테스트
- [ ] INSERT: 새 사용자 생성
- [ ] SELECT: 이메일로 사용자 조회
- [ ] SELECT: ID로 사용자 조회  
- [ ] UPDATE: 사용자 정보 수정
- [ ] DELETE: 사용자 삭제 (soft delete 확인)

#### 관계 테스트
- [ ] users → sessions 관계 (1:N)
- [ ] users → roles 관계 (N:M)
- [ ] 외래키 제약조건 확인
- [ ] 관계 데이터 조회 성능
```

### 예시: orders 테이블 및 관계 생성 시
```markdown
## 테스트 항목 - orders 테이블 (이커머스)
**생성 시점**: 2024-09-04T15:50:00Z
**Context 정보**:
- 테이블명: orders, order_items
- 관계: users (N:1), products (N:M through order_items)
- 비즈니스 로직: 주문 상태 관리, 재고 차감

### 테스트 케이스
#### 스키마 테스트
- [ ] orders 테이블 생성
- [ ] order_items 중간 테이블 생성
- [ ] 상태 필드 (ENUM: pending, confirmed, shipped, delivered)

#### 비즈니스 로직 테스트
- [ ] 주문 생성 시 재고 차감
- [ ] 주문 취소 시 재고 복구
- [ ] 주문 상태 변경 로직
- [ ] 결제 상태와 주문 상태 연동

#### 성능 테스트
- [ ] 대용량 주문 데이터 조회
- [ ] 복합 인덱스 성능 확인
- [ ] 통계 쿼리 성능 (매출, 인기 상품)
```

## 🔄 업데이트 규칙

### 자동 추가 조건
1. **새 테이블 생성**: CREATE TABLE 문 실행 시
2. **스키마 변경**: ALTER TABLE, CREATE INDEX 실행 시
3. **마이그레이션 추가**: 데이터베이스 마이그레이션 파일 생성 시
4. **ORM 모델 추가**: Prisma, Sequelize, TypeORM 모델 정의 시

### 기록 정보
- **테이블 구조**: 컬럼, 타입, 제약조건, 인덱스
- **관계 정의**: 외래키, 연결 테이블, 관계 타입
- **비즈니스 로직**: 트리거, 프로시저, 제약조건
- **성능 고려**: 인덱스 전략, 파티셔닝, 샤딩

## 📊 통계
- **총 DB 테스트**: 0개 (신규 프로젝트)
- **테이블 테스트**: 0개
- **관계 테스트**: 0개
- **성능 테스트**: 0개

---
**네비게이션**: [← API 테스트](./api-tests.md) | [통합 테스트 →](./integration-tests.md)  
**자동 업데이트**: MCP 시스템이 DB 변경과 동시에 업데이트  
**마지막 업데이트**: 2024-09-04T15:50:00Z