#!/bin/bash

# CodeB CLI v2.1 - 색상 및 로깅 모듈

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# 로깅 함수
log_info() { 
    echo -e "${BLUE}ℹ️ $1${NC}" 
}

log_success() { 
    echo -e "${GREEN}✅ $1${NC}" 
}

log_error() { 
    echo -e "${RED}❌ $1${NC}" 
}

log_warning() { 
    echo -e "${YELLOW}⚠️ $1${NC}" 
}

log_header() { 
    echo -e "${BOLD}${CYAN}🚀 $1${NC}" 
}