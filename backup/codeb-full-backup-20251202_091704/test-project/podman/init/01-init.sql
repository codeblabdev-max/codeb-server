-- CodeB 개발 환경 초기화 SQL
-- 프로젝트: test-project

-- 확장 기능 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 기본 스키마 생성
CREATE SCHEMA IF NOT EXISTS app;

-- 샘플 테이블 (필요에 따라 수정)
CREATE TABLE IF NOT EXISTS app.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX idx_projects_name ON app.projects(name);
CREATE INDEX idx_projects_created_at ON app.projects(created_at);

-- 권한 설정
GRANT ALL ON SCHEMA app TO codeb;
GRANT ALL ON ALL TABLES IN SCHEMA app TO codeb;

-- 초기 데이터 (옵션)
INSERT INTO app.projects (name, description) VALUES
    ('test-project', 'CodeB v3.5 프로젝트')
ON CONFLICT DO NOTHING;
