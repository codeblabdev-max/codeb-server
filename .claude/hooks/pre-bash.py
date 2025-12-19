#!/usr/bin/env python3
"""
CodeB Protection Hooks - Enhanced Bash Command Validator

Claude Code의 Bash 명령을 Protection Daemon과 연동하여 검증
Daemon 미실행 시 Safe Mode로 위험 명령 차단

Features:
- Protection Daemon 연동 (Unix Socket)
- 금지 명령 패턴 차단
- SSH 화이트리스트 검증
- 프로덕션 컨테이너 보호
- 우회 시도 탐지
- 감사 로그
"""

import sys
import json
import re
import os
import socket
from pathlib import Path
from datetime import datetime, timedelta

# ============================================================================
# 설정
# ============================================================================

CONFIG = {
    # Protection Daemon 소켓
    "socket_path": os.environ.get("CODEB_SOCKET_PATH", "/var/run/codeb/protection.sock"),

    # 소켓 타임아웃 (초)
    "socket_timeout": 3,

    # SSOT 캐시 (로컬)
    "ssot_cache_path": Path.home() / ".codeb" / "ssot-cache.json",

    # 캐시 TTL (분)
    "cache_ttl_minutes": 30,

    # 기본 허용 서버 (Safe Mode용)
    "default_allowed_ips": [
        "141.164.60.51",    # CodeB Infra
        "158.247.203.55",   # Videopick App
        "141.164.42.213",   # Streaming
        "64.176.226.119",   # Storage
        "141.164.37.63",    # Backup
    ],

    "default_allowed_hostnames": [
        "codeb-infra",
        "localhost",
        "127.0.0.1",
    ],

    # 감사 로그 경로
    "audit_log_path": Path.home() / ".codeb" / "hook-audit.log",
}

# ============================================================================
# 절대 금지 명령 패턴 (로컬 검증용 - Daemon 없어도 차단)
# ============================================================================

FORBIDDEN_PATTERNS = [
    # 컨테이너 강제 삭제
    (r"podman\s+rm\s+(-f|--force)", "직접 컨테이너 삭제 금지. 사용: we workflow stop <project>"),
    (r"docker\s+rm\s+(-f|--force)", "직접 컨테이너 삭제 금지. 사용: we workflow stop <project>"),

    # 볼륨 삭제
    (r"podman\s+volume\s+rm", "직접 볼륨 삭제 금지. 사용: we workflow cleanup <project>"),
    (r"docker\s+volume\s+rm", "직접 볼륨 삭제 금지. 사용: we workflow cleanup <project>"),

    # 네트워크 삭제
    (r"podman\s+network\s+rm", "직접 네트워크 삭제 금지"),
    (r"docker\s+network\s+rm", "직접 네트워크 삭제 금지"),

    # 시스템 전체 정리
    (r"podman\s+system\s+prune", "시스템 전체 정리 금지"),
    (r"podman\s+volume\s+prune", "모든 볼륨 삭제 금지"),
    (r"podman\s+network\s+prune", "모든 네트워크 삭제 금지"),
    (r"podman\s+container\s+prune", "모든 컨테이너 삭제 금지"),
    (r"podman\s+image\s+prune\s+-a", "모든 이미지 삭제 금지"),
    (r"docker\s+system\s+prune", "시스템 전체 정리 금지"),
    (r"docker\s+volume\s+prune", "모든 볼륨 삭제 금지"),

    # 컨테이너 강제 종료
    (r"podman\s+kill", "컨테이너 강제 종료 금지. 사용: we workflow stop <project>"),
    (r"docker\s+kill", "컨테이너 강제 종료 금지. 사용: we workflow stop <project>"),

    # docker-compose down -v
    (r"docker-compose\s+down\s+.*-v", "볼륨 포함 삭제 금지. 사용: we workflow stop <project>"),
    (r"podman-compose\s+down\s+.*-v", "볼륨 포함 삭제 금지. 사용: we workflow stop <project>"),

    # CodeB 폴더 삭제
    (r"rm\s+(-rf|-fr|--recursive)\s+.*(/opt/codeb|codeb)", "CodeB 폴더 직접 삭제 금지"),
    (r"rm\s+(-rf|-fr|--recursive)\s+.*/var/lib/containers", "컨테이너 데이터 삭제 금지"),
    (r"rm\s+(-rf|-fr|--recursive)\s+.*/home/codeb", "CodeB 홈 폴더 삭제 금지"),

    # 서비스 중지 (보호 데몬 포함)
    (r"systemctl\s+(stop|disable)\s+codeb-protection", "보호 데몬 중지 금지"),
    (r"systemctl\s+(stop|disable)\s+podman", "Podman 서비스 중지 금지"),

    # 프로세스 강제 종료
    (r"pkill\s+.*podman", "Podman 프로세스 종료 금지"),
    (r"pkill\s+.*codeb", "CodeB 프로세스 종료 금지"),
    (r"pkill\s+-9", "프로세스 강제 종료 금지"),
    (r"kill\s+-9", "프로세스 강제 종료 금지"),

    # 위험한 SSH 명령 (원격 삭제)
    (r"ssh\s+.*rm\s+-rf", "원격 삭제 명령 금지"),
    (r"ssh\s+.*podman\s+rm\s+-f", "원격 컨테이너 삭제 금지"),
]

# ============================================================================
# 프로덕션 보호 패턴
# ============================================================================

PRODUCTION_PATTERNS = [
    r"-production$",
    r"-prod$",
    r"-prd$",
    r"^prod-",
    r"^production-",
]

# ============================================================================
# 항상 허용 패턴
# ============================================================================

ALLOWED_PATTERNS = [
    r"^we\s+",           # we CLI
    r"^podman\s+ps",
    r"^podman\s+logs",
    r"^podman\s+inspect",
    r"^podman\s+images",
    r"^podman\s+volume\s+ls",
    r"^podman\s+network\s+ls",
    r"^podman\s+stats",
    r"^docker\s+ps",
    r"^docker\s+logs",
    r"^docker\s+inspect",
    r"^ls\b",
    r"^cat\b",
    r"^grep\b",
    r"^find\b",
    r"^curl\b",
    r"^wget\b",
    r"^git\s+",
    r"^npm\s+",
    r"^node\s+",
]

# ============================================================================
# 우회 시도 탐지 패턴
# ============================================================================

BYPASS_PATTERNS = [
    # base64 인코딩 시도
    (r"base64\s+-d.*\|.*bash", "Base64 인코딩 우회 시도 감지"),
    (r"echo\s+.*\|\s*base64\s+-d", "Base64 인코딩 우회 시도 감지"),

    # eval 사용
    (r"eval\s+.*podman", "eval을 통한 우회 시도 감지"),
    (r"eval\s+.*docker", "eval을 통한 우회 시도 감지"),
    (r"eval\s+.*rm\s+-rf", "eval을 통한 삭제 시도 감지"),

    # 환경변수 조작
    (r"export\s+CODEB_SOCKET", "보호 소켓 경로 변경 시도 감지"),
    (r"unset\s+CODEB", "보호 환경변수 삭제 시도 감지"),

    # 소켓 파일 조작
    (r"rm\s+.*protection\.sock", "보호 소켓 파일 삭제 시도 감지"),
    (r"chmod\s+.*protection\.sock", "보호 소켓 권한 변경 시도 감지"),
    (r"mv\s+.*protection\.sock", "보호 소켓 이동 시도 감지"),

    # systemd 서비스 조작
    (r"systemctl\s+mask\s+codeb", "보호 서비스 마스킹 시도 감지"),

    # /dev/null 리다이렉트로 출력 숨김
    (r"podman\s+rm.*>/dev/null", "출력 숨김을 통한 삭제 시도 감지"),

    # 백그라운드 실행으로 숨김
    (r"nohup.*podman\s+rm", "백그라운드 삭제 시도 감지"),
]

# ============================================================================
# Protection Daemon 클라이언트
# ============================================================================

class ProtectionClient:
    def __init__(self, socket_path):
        self.socket_path = socket_path

    def is_available(self):
        """데몬 사용 가능 여부 확인"""
        return os.path.exists(self.socket_path)

    def validate(self, command, context=None):
        """명령 검증 요청"""
        if not self.is_available():
            return None  # Daemon 미실행

        try:
            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            sock.settimeout(CONFIG["socket_timeout"])
            sock.connect(self.socket_path)

            request = json.dumps({
                "action": "validate",
                "command": command,
                "context": context or {},
                "clientId": f"claude-hook-{os.getpid()}",
            }) + "\n"

            sock.sendall(request.encode())

            response = b""
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                response += chunk
                if b"\n" in response:
                    break

            sock.close()

            return json.loads(response.decode().strip())

        except (socket.error, json.JSONDecodeError, Exception):
            return None  # 연결 실패

# ============================================================================
# JSON 응답 헬퍼
# ============================================================================

def deny(reason):
    """명령 거부"""
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason
        }
    }
    print(json.dumps(output))
    audit_log("DENIED", reason)
    sys.exit(0)

def allow():
    """명령 허용"""
    sys.exit(0)

def ask(reason):
    """사용자 확인 요청"""
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": reason
        }
    }
    print(json.dumps(output))
    sys.exit(0)

# ============================================================================
# 감사 로그
# ============================================================================

def audit_log(action, message, command=""):
    """감사 로그 기록"""
    try:
        log_path = CONFIG["audit_log_path"]
        log_path.parent.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().isoformat()
        log_entry = f"[{timestamp}] {action}: {message}"
        if command:
            log_entry += f" | Command: {command[:100]}"
        log_entry += "\n"

        with open(log_path, "a") as f:
            f.write(log_entry)

    except Exception:
        pass  # 로그 실패 무시

# ============================================================================
# SSOT 캐시
# ============================================================================

def load_ssot_cache():
    """SSOT 캐시 로드"""
    try:
        cache_path = CONFIG["ssot_cache_path"]
        if not cache_path.exists():
            return None

        with open(cache_path, "r") as f:
            cache = json.load(f)

        # 만료 체크
        cached_at = cache.get("cachedAt", "")
        if cached_at:
            try:
                from datetime import timezone
                cached_time = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                if now - cached_time > timedelta(minutes=CONFIG["cache_ttl_minutes"]):
                    return None
            except Exception:
                pass

        return cache
    except Exception:
        return None

def get_allowed_servers():
    """허용된 서버 목록"""
    cache = load_ssot_cache()

    if cache and "servers" in cache:
        return (
            cache["servers"].get("ips", CONFIG["default_allowed_ips"]),
            cache["servers"].get("hostnames", CONFIG["default_allowed_hostnames"])
        )

    return CONFIG["default_allowed_ips"], CONFIG["default_allowed_hostnames"]

# ============================================================================
# 검증 함수
# ============================================================================

def check_bypass_attempts(command):
    """우회 시도 탐지"""
    for pattern, message in BYPASS_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            audit_log("BYPASS_ATTEMPT", message, command)
            return True, f"🚨 보안 우회 시도 감지: {message}"
    return False, None

def check_allowed_patterns(command):
    """항상 허용 패턴 체크"""
    for pattern in ALLOWED_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            return True
    return False

def check_forbidden_patterns(command):
    """금지 패턴 체크 (로컬)"""
    command_lower = command.lower()

    for pattern, message in FORBIDDEN_PATTERNS:
        if re.search(pattern, command_lower):
            return True, message

    return False, None

def check_production_protection(command):
    """프로덕션 컨테이너 보호 체크"""
    # 컨테이너 조작 명령 감지
    match = re.search(
        r"(?:podman|docker)\s+(?:rm|stop|kill|restart)\s+(?:-[^\s]+\s+)*(\S+)",
        command,
        re.IGNORECASE
    )

    if match:
        container_name = match.group(1)

        for pattern in PRODUCTION_PATTERNS:
            if re.search(pattern, container_name):
                return True, f"🔒 프로덕션 컨테이너 '{container_name}'는 보호됩니다."

    return False, None

def check_ssh_target(command):
    """SSH 대상 검증"""
    allowed_ips, allowed_hostnames = get_allowed_servers()

    # SSH 명령 패턴
    ssh_patterns = [
        r"ssh\s+(?:-[^\s]+\s+)*(?:\w+@)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})",
        r"scp\s+.*?(?:\w+@)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})",
        r"rsync\s+.*?(?:\w+@)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})",
    ]

    for pattern in ssh_patterns:
        match = re.search(pattern, command)
        if match:
            ip = match.group(1)
            if ip not in allowed_ips:
                return True, f"허용되지 않은 서버 IP: {ip}\n허용된 서버: {', '.join(allowed_ips)}"

    return False, None

def check_project_isolation(command):
    """프로젝트 격리 검증"""
    current_project = os.environ.get("CODEB_PROJECT", "")
    if not current_project:
        return False, None

    # 컨테이너 조작 명령
    match = re.search(
        r"(?:podman|docker)\s+(?:rm|stop|restart)\s+(\S+)",
        command
    )

    if match:
        container_name = match.group(1)
        # 다른 프로젝트 컨테이너 조작 방지
        if current_project not in container_name and "codeb" in container_name.lower():
            return True, f"다른 프로젝트({container_name})의 컨테이너 조작 금지"

    return False, None

# ============================================================================
# 메인
# ============================================================================

def main():
    # stdin에서 hook input 읽기
    try:
        input_data = sys.stdin.read()
        if input_data.strip():
            hook_input = json.loads(input_data)
        else:
            hook_input = {}
    except json.JSONDecodeError:
        hook_input = {}

    # Bash 도구의 command 파라미터 추출
    tool_input = hook_input.get("tool_input", {})
    command = tool_input.get("command", "")

    if not command:
        allow()

    # 1. 우회 시도 탐지 (최우선)
    is_bypass, bypass_reason = check_bypass_attempts(command)
    if is_bypass:
        deny(f"🚨 {bypass_reason}")

    # 2. 항상 허용 패턴 체크
    if check_allowed_patterns(command):
        # we CLI는 내부적으로 추가 검증됨
        allow()

    # 3. Protection Daemon 연동
    client = ProtectionClient(CONFIG["socket_path"])

    if client.is_available():
        # Daemon에 검증 요청
        context = {
            "projectName": os.environ.get("CODEB_PROJECT"),
            "source": "claude-hook",
        }

        result = client.validate(command, context)

        if result:
            if not result.get("allowed", True):
                reason = result.get("reason", "명령이 차단되었습니다.")
                suggestion = result.get("suggestion", "")

                message = f"🛑 {reason}"
                if suggestion:
                    message += f"\n💡 권장: {suggestion}"

                deny(message)

            # 경고가 있으면 확인 요청
            if result.get("warnings"):
                warnings = "\n".join(f"⚠️ {w}" for w in result["warnings"])
                ask(f"다음 경고가 있습니다:\n{warnings}\n\n계속하시겠습니까?")

            allow()

    # 4. Daemon 미실행 - Safe Mode (로컬 검증)

    # 4.1 금지 패턴 체크
    is_forbidden, forbidden_reason = check_forbidden_patterns(command)
    if is_forbidden:
        deny(f"🚫 {forbidden_reason}")

    # 4.2 프로덕션 보호 체크
    is_prod, prod_reason = check_production_protection(command)
    if is_prod:
        deny(prod_reason)

    # 4.3 SSH 대상 검증
    if re.search(r"^(ssh|scp|rsync)\s+", command):
        is_blocked, ssh_reason = check_ssh_target(command)
        if is_blocked:
            deny(f"🌐 {ssh_reason}")

    # 4.4 프로젝트 격리 체크
    is_isolated, isolation_reason = check_project_isolation(command)
    if is_isolated:
        deny(f"🔐 {isolation_reason}")

    # 5. 기본 허용
    allow()

if __name__ == "__main__":
    main()
