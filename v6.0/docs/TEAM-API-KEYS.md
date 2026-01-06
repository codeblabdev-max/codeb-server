# CodeB Team API Keys

> 생성일: 2026-01-07
> 팀: codeb
> 총 인원: 10명 (Admin 1 + Developer 9)

---

## API Key 목록

| # | 이름 | 역할 | Key ID | API Key |
|---|------|------|--------|---------|
| 1 | Admin Owner | owner | `key_c681fa120b253f9a` | `codeb_codeb_owner_5032ab85f36a64930f7cdea1ee941801` |
| 2 | Developer 1 | member | `key_69f98acd9cb38d71` | `codeb_codeb_member_9d7660fec3656818d677db2292b35a47` |
| 3 | Developer 2 | member | `key_c10e3533de6a623c` | `codeb_codeb_member_f4a054f5727777aa5e4677f0972a7d4a` |
| 4 | Developer 3 | member | `key_aef7d71e6c44f50c` | `codeb_codeb_member_ea0cbad95e0c0a25adb8981dc848070d` |
| 5 | Developer 4 | member | `key_95dcdeaaebc3eaa9` | `codeb_codeb_member_c86f8aefff0613162bd9a70e9c404388` |
| 6 | Developer 5 | member | `key_c493e456b36f6372` | `codeb_codeb_member_6a5d43bf0c8a2ecd9da679825f50bb44` |
| 7 | Developer 6 | member | `key_8eecca7107c208fe` | `codeb_codeb_member_9f01760264c3f2ffd239b8c12f765971` |
| 8 | Developer 7 | member | `key_6d9ed429762a23fd` | `codeb_codeb_member_d4ceca8117e4579dc9bb4f15afffd4a3` |
| 9 | Developer 8 | member | `key_55d395aa7e3590d7` | `codeb_codeb_member_62f2f5c8ac1ad7214f7880d9ac537eb2` |
| 10 | Developer 9 | member | `key_efddfbeb126d1924` | `codeb_codeb_member_6aca1604a81354af65733da484252fda` |

---

## 팀원 배포 설정 방법

```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
export CODEB_API_KEY="여기에_본인_API_Key_입력"

# 저장 후 적용
source ~/.zshrc

# 테스트
/we:health
```

---

## 권한 설명

| 역할 | 배포 | Promote | Rollback | ENV 설정 | 팀 관리 |
|------|:----:|:-------:|:--------:|:--------:|:-------:|
| **owner** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **member** | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## Database Insert SQL

서버 DB에 아래 SQL을 실행하여 API Key를 등록하세요:

```sql
-- API Keys 테이블이 없으면 생성
CREATE TABLE IF NOT EXISTS api_keys (
  key_id VARCHAR(32) PRIMARY KEY,
  team_id VARCHAR(64) NOT NULL,
  key_hash VARCHAR(64) NOT NULL,
  role VARCHAR(16) NOT NULL,
  name VARCHAR(128) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Admin Owner
INSERT INTO api_keys (key_id, team_id, key_hash, role, name, is_active) VALUES
('key_c681fa120b253f9a', 'codeb', '생성시_출력된_해시값', 'owner', 'Admin Owner', true);

-- Developer 1
INSERT INTO api_keys (key_id, team_id, key_hash, role, name, is_active) VALUES
('key_69f98acd9cb38d71', 'codeb', '생성시_출력된_해시값', 'member', 'Developer 1', true);

-- Developer 2
INSERT INTO api_keys (key_id, team_id, key_hash, role, name, is_active) VALUES
('key_c10e3533de6a623c', 'codeb', '생성시_출력된_해시값', 'member', 'Developer 2', true);

-- Developer 3
INSERT INTO api_keys (key_id, team_id, key_hash, role, name, is_active) VALUES
('key_aef7d71e6c44f50c', 'codeb', '생성시_출력된_해시값', 'member', 'Developer 3', true);

-- Developer 4
INSERT INTO api_keys (key_id, team_id, key_hash, role, name, is_active) VALUES
('key_95dcdeaaebc3eaa9', 'codeb', '생성시_출력된_해시값', 'member', 'Developer 4', true);

-- Developer 5
INSERT INTO api_keys (key_id, team_id, key_hash, role, name, is_active) VALUES
('key_c493e456b36f6372', 'codeb', '생성시_출력된_해시값', 'member', 'Developer 5', true);

-- Developer 6
INSERT INTO api_keys (key_id, team_id, key_hash, role, name, is_active) VALUES
('key_8eecca7107c208fe', 'codeb', '생성시_출력된_해시값', 'member', 'Developer 6', true);

-- Developer 7
INSERT INTO api_keys (key_id, team_id, key_hash, role, name, is_active) VALUES
('key_6d9ed429762a23fd', 'codeb', '생성시_출력된_해시값', 'member', 'Developer 7', true);

-- Developer 8
INSERT INTO api_keys (key_id, team_id, key_hash, role, name, is_active) VALUES
('key_55d395aa7e3590d7', 'codeb', '생성시_출력된_해시값', 'member', 'Developer 8', true);

-- Developer 9
INSERT INTO api_keys (key_id, team_id, key_hash, role, name, is_active) VALUES
('key_efddfbeb126d1924', 'codeb', '생성시_출력된_해시값', 'member', 'Developer 9', true);
```

---

## 보안 주의사항

1. **API Key는 절대 Git에 커밋하지 마세요**
2. **API Key는 본인만 사용하세요**
3. **유출 시 즉시 Admin에게 보고하세요**
4. **새 Key 발급 후 기존 Key는 폐기됩니다**

---

*이 문서는 관리자용입니다. 팀원에게는 본인 Key만 전달하세요.*
