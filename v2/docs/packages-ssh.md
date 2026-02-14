# @codeb/ssh

> SSH 클라이언트 + 커넥션 풀 - 원격 서버 명령 실행

## 역할

4개 서버(App, Streaming, Storage, Backup)에 SSH로 접속하여
Docker 명령, 파일 조작, 시스템 명령을 원격 실행한다.

## 디렉토리 구조

```
packages/ssh/src/
├── pool.ts     ← SSHConnectionPool (싱글톤, 호스트별 최대 5개)
├── client.ts   ← SSHClientWrapper (명령 실행, 파일 전송)
└── index.ts    ← 팩토리 함수 + 프로세스 정리
```

## Exports

### Factory Functions

| 함수 | 설명 |
|------|------|
| `getSSHClient(host?)` | 특정 호스트 SSH 클라이언트 생성 |
| `getSSHClientForServer(role)` | 서버 역할로 클라이언트 생성 (`'app'`, `'storage'` 등) |
| `withSSH(host, fn)` | 자동 연결/해제 래퍼 |
| `execCommand(role, cmd, opts?)` | 서버 역할 기반 단일 명령 실행 |

### Classes

#### `SSHConnectionPool` (싱글톤)

| 메서드 | 설명 |
|--------|------|
| `getInstance()` | 싱글톤 인스턴스 |
| `acquire(host)` | 연결 획득 (풀에서 재사용 또는 새 생성) |
| `release(host, conn)` | 연결 반환 |
| `destroy()` | 모든 연결 종료 |

- 호스트별 최대 5개 연결
- 유휴 연결 자동 정리 (30초)

#### `SSHClientWrapper`

| 메서드 | 설명 |
|--------|------|
| `connect()` | SSH 연결 수립 |
| `disconnect()` | 연결 해제 |
| `exec(cmd, opts?)` | 명령 실행 → `SSHResult` |
| `uploadFile(local, remote)` | 파일 업로드 (SFTP) |
| `downloadFile(remote, local)` | 파일 다운로드 (SFTP) |

- 경로 검증 (directory traversal 방지)
- 타임아웃 지원 (기본 30초)

### Lifecycle

프로세스 종료 시 자동 정리:
- `beforeExit` → pool.destroy()
- `SIGINT` / `SIGTERM` → pool.destroy() + exit

## 의존성

- `ssh2` - SSH2 프로토콜
- `@codeb/shared` - `SERVERS` 상수, `SSHResult` 타입
