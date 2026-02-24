#!/usr/bin/env python3
"""
CodeB v7.0 - Bash Command Validator (Admin Mode)
Symlink-equivalent for v2/ monorepo subdirectory
"""

import sys
import json
import re
from pathlib import Path
from datetime import datetime

CONFIG = {
    "audit_log_path": Path.home() / ".codeb" / "hook-audit.log",
}

FORBIDDEN_PATTERNS = [
    (r"docker\s+(rm|remove)\s+.*postgres", "PostgreSQL container delete forbidden"),
    (r"docker\s+(rm|remove)\s+.*redis", "Redis container delete forbidden"),
    (r"docker\s+volume\s+(rm|remove)\s+.*postgres", "PostgreSQL volume delete forbidden"),
    (r"docker\s+volume\s+(rm|remove)\s+.*redis", "Redis volume delete forbidden"),
    (r"rm\s+(-rf|-fr).*postgres.*data", "PostgreSQL data delete forbidden"),
    (r"rm\s+(-rf|-fr).*redis.*data", "Redis data delete forbidden"),
    (r"DROP\s+DATABASE", "DROP DATABASE forbidden"),
    (r"dropdb\s+", "dropdb forbidden"),
    (r"FLUSHALL", "Redis FLUSHALL forbidden"),
    (r"FLUSHDB", "Redis FLUSHDB forbidden"),
    (r"rm\s+(-rf|-fr)\s+/\s*$", "Root delete forbidden"),
    (r"rm\s+(-rf|-fr)\s+/var/lib/docker\s*$", "Docker data delete forbidden"),
    (r"docker\s+system\s+prune\s+(-a|--all)\s+(-f|--force)", "Docker full prune forbidden"),
    (r"docker\s+volume\s+prune\s+(-a|--all)\s+(-f|--force)", "Volume full prune forbidden"),
    (r"mkfs\.", "Filesystem format forbidden"),
    (r"dd\s+if=.*of=/dev/", "Direct disk write forbidden"),
]

def deny(reason):
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
    sys.exit(0)

def main():
    try:
        input_data = sys.stdin.read()
        if input_data.strip():
            hook_input = json.loads(input_data)
        else:
            hook_input = {}
    except json.JSONDecodeError:
        hook_input = {}

    tool_input = hook_input.get("tool_input", {})
    command = tool_input.get("command", "")

    if not command:
        allow()

    for pattern, message in FORBIDDEN_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            deny(message)

    allow()

if __name__ == "__main__":
    main()
