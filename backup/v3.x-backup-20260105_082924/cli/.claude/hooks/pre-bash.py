#!/usr/bin/env python3
"""
CodeB Deployment Hooks - Bash Command Validator
JSON 출력 방식으로 Claude Code와 통신

허용된 서버/명령어는 SSOT (서버)에서 관리
로컬 캐시: ~/.codeb/ssot-cache.json
"""

import sys
import json
import re
import os
from pathlib import Path
from datetime import datetime, timedelta

# ============================================================================
# 설정
# ============================================================================

# 로컬 SSOT 캐시 경로
SSOT_CACHE_PATH = Path.home() / '.codeb' / 'ssot-cache.json'

# 캐시 만료 시간 (분)
CACHE_TTL_MINUTES = 30

# 기본 허용 서버 (캐시 없을 때 폴백)
DEFAULT_ALLOWED_IPS = [
    "141.164.60.51",    # CodeB Infra
    "158.247.203.55",   # Videopick App
    "141.164.42.213",   # Videopick Streaming
    "64.176.226.119",   # Videopick Storage
    "141.164.37.63",    # Videopick Backup
]

DEFAULT_ALLOWED_HOSTNAMES = [
    "codeb-infra",
    "localhost",
    "127.0.0.1",
]

# ============================================================================
# SSOT 캐시 로드
# ============================================================================

def load_ssot_cache():
    """SSOT 캐시 로드 (만료 체크 포함)"""
    try:
        if not SSOT_CACHE_PATH.exists():
            return None

        with open(SSOT_CACHE_PATH, 'r') as f:
            cache = json.load(f)

        # 만료 체크
        cached_at = cache.get('cachedAt', '')
        if cached_at:
            cached_time = datetime.fromisoformat(cached_at.replace('Z', '+00:00'))
            if datetime.now(cached_time.tzinfo) - cached_time > timedelta(minutes=CACHE_TTL_MINUTES):
                return None  # 캐시 만료

        return cache
    except Exception:
        return None

def get_allowed_servers():
    """허용된 서버 목록 가져오기 (SSOT 캐시 우선)"""
    cache = load_ssot_cache()

    if cache and 'servers' in cache:
        return (
            cache['servers'].get('ips', DEFAULT_ALLOWED_IPS),
            cache['servers'].get('hostnames', DEFAULT_ALLOWED_HOSTNAMES)
        )

    return DEFAULT_ALLOWED_IPS, DEFAULT_ALLOWED_HOSTNAMES

# ============================================================================
# 검증 규칙
# ============================================================================

# 절대 금지 명령어 패턴
FORBIDDEN_PATTERNS = [
    # 컨테이너 강제 삭제
    (r'podman\s+rm\s+(-f|--force)', "직접 컨테이너 삭제 금지. 사용: we workflow stop <project>"),
    (r'docker\s+rm\s+(-f|--force)', "직접 컨테이너 삭제 금지. 사용: we workflow stop <project>"),

    # 볼륨 삭제
    (r'podman\s+volume\s+rm', "직접 볼륨 삭제 금지. 사용: we workflow cleanup <project>"),
    (r'docker\s+volume\s+rm', "직접 볼륨 삭제 금지. 사용: we workflow cleanup <project>"),

    # docker-compose down -v
    (r'docker-compose\s+down\s+.*-v', "볼륨 포함 삭제 금지. 사용: we workflow stop <project>"),
    (r'podman-compose\s+down\s+.*-v', "볼륨 포함 삭제 금지. 사용: we workflow stop <project>"),

    # 프로젝트 폴더 삭제
    (r'rm\s+(-rf|-fr|--recursive)\s+.*(/opt/codeb|codeb)', "CodeB 폴더 직접 삭제 금지"),

    # systemctl stop (서비스 중지)
    (r'systemctl\s+stop\s+.*codeb', "서비스 직접 중지 금지. 사용: we workflow stop <project>"),

    # 위험한 prune 명령
    (r'podman\s+(system|volume)\s+prune\s+(-a|--all)', "전체 정리 금지. 프로젝트별로 정리하세요."),
    (r'docker\s+(system|volume)\s+prune\s+(-a|--all)', "전체 정리 금지. 프로젝트별로 정리하세요."),
]

# 허용 패턴 (조회 명령) - 항상 허용
ALLOWED_PATTERNS = [
    r'^we\s+',           # we CLI 명령
    r'podman\s+ps',
    r'podman\s+logs',
    r'podman\s+inspect',
    r'podman\s+images',
    r'podman\s+volume\s+ls',
    r'podman\s+network\s+ls',
    r'docker\s+ps',
    r'docker\s+logs',
    r'docker\s+inspect',
]

# ============================================================================
# JSON 응답 헬퍼
# ============================================================================

def deny(reason: str):
    """명령 거부 (JSON 출력)"""
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason
        }
    }
    print(json.dumps(output))
    sys.exit(0)

def allow():
    """명령 허용"""
    sys.exit(0)

def ask(reason: str):
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
# 검증 함수
# ============================================================================

def check_ssh_target(command: str):
    """SSH 접속 대상 서버 검증"""
    allowed_ips, allowed_hostnames = get_allowed_servers()

    # SSH/SCP/RSYNC 명령어 패턴
    ssh_patterns = [
        r'ssh\s+(?:-[^\s]+\s+)*(?:(\w+)@)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})',
        r'ssh\s+(?:-[^\s]+\s+)*(?:(\w+)@)?([\w\-\.]+)\s',
        r'scp\s+.*?(?:(\w+)@)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})',
        r'rsync\s+.*?(?:(\w+)@)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})',
    ]

    for pattern in ssh_patterns:
        match = re.search(pattern, command)
        if match:
            target = match.group(2)

            # IP 주소 검증
            if re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', target):
                if target not in allowed_ips:
                    deny(f"허용되지 않은 서버 IP: {target}\n\n허용된 IP:\n" +
                         "\n".join(f"  - {ip}" for ip in allowed_ips) +
                         "\n\n서버 목록 업데이트: we ssot sync")
            # 호스트명 검증
            elif target not in allowed_hostnames:
                if not any(h in target for h in allowed_hostnames):
                    deny(f"허용되지 않은 서버: {target}\n\n허용된 호스트: {', '.join(allowed_hostnames)}")

def check_forbidden_commands(command: str):
    """금지 명령어 패턴 체크"""
    command_lower = command.lower()

    for pattern, message in FORBIDDEN_PATTERNS:
        if re.search(pattern, command_lower):
            deny(f"🚫 {message}")

def check_allowed_commands(command: str) -> bool:
    """허용 명령어 패턴 체크 (허용되면 True)"""
    for pattern in ALLOWED_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            return True
    return False

def check_project_isolation(command: str):
    """프로젝트 격리 검증"""
    current_project = os.environ.get('CODEB_PROJECT', '')
    if not current_project:
        return

    container_ops = ['rm', 'stop', 'restart', 'kill']
    for op in container_ops:
        pattern = rf'(podman|docker)\s+{op}\s+(\S+)'
        match = re.search(pattern, command)
        if match:
            container_name = match.group(2)
            if current_project not in container_name and 'codeb' in container_name.lower():
                deny(f"다른 프로젝트({container_name})의 컨테이너 조작 금지\n\n현재 프로젝트: {current_project}")

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
    tool_input = hook_input.get('tool_input', {})
    command = tool_input.get('command', '')

    if not command:
        allow()

    # 1. 허용 패턴 먼저 체크 (we CLI, 조회 명령)
    if check_allowed_commands(command):
        allow()

    # 2. SSH 대상 서버 검증
    check_ssh_target(command)

    # 3. 금지 명령어 체크
    check_forbidden_commands(command)

    # 4. 프로젝트 격리 체크
    check_project_isolation(command)

    # 기본: 허용
    allow()

if __name__ == "__main__":
    main()
