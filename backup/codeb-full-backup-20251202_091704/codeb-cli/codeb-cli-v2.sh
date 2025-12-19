#!/bin/bash

# CodeB CLI v2.1 - 모듈화된 프로젝트 관리 도구
# 메인 진입점

VERSION="2.1.0"
CLI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 라이브러리 로드
source "$CLI_ROOT/lib/colors.sh"
source "$CLI_ROOT/lib/config.sh"
source "$CLI_ROOT/lib/utils.sh"
source "$CLI_ROOT/lib/api.sh"

# 명령어 모듈 로드
source "$CLI_ROOT/commands/project.sh"
source "$CLI_ROOT/commands/control.sh"
source "$CLI_ROOT/commands/deploy.sh"
source "$CLI_ROOT/commands/logs.sh"
source "$CLI_ROOT/commands/database.sh"
source "$CLI_ROOT/commands/diagnose.sh"

# 도움말
show_help() {
    echo -e "${BOLD}${CYAN}CodeB CLI v$VERSION - 모듈화된 프로젝트 관리${NC}"
    echo ""
    echo "사용법: $0 <명령> [옵션]"
    echo ""
    echo -e "${BOLD}프로젝트 관리:${NC}"
    echo "  list                        프로젝트 목록 보기"
    echo "  create <이름> [템플릿]       프로젝트 생성"
    echo "  delete <이름>               프로젝트 삭제"
    echo "  status <이름>               프로젝트 상태 확인"
    echo ""
    echo -e "${BOLD}프로젝트 제어:${NC}"
    echo "  start <이름>                프로젝트 시작"
    echo "  stop <이름>                 프로젝트 중지"
    echo "  restart <이름>              프로젝트 재시작"
    echo ""
    echo -e "${BOLD}배포 & 빌드:${NC}"
    echo "  deploy <이름> <git-url> [브랜치] [--db-backup <URL>]  코드 배포"
    echo "  build <이름> [build|dev|start]   빌드 실행"
    echo ""
    echo -e "${BOLD}모니터링:${NC}"
    echo "  logs <이름> [app|build|pm2] [라인수]  로그 보기"
    echo "  tail <이름> [app|pm2]       실시간 로그 모니터링"
    echo "  files <이름> [경로]         파일 구조 확인"
    echo "  diagnose <이름>             종합 진단"
    echo ""
    echo -e "${BOLD}데이터베이스:${NC}"
    echo "  db backup <이름>            데이터베이스 백업"
    echo "  db restore <이름> <파일>     데이터베이스 복원"
    echo "  db tables <이름>            테이블 목록 조회"
    echo "  db query <이름> '<SQL>'     SQL 쿼리 실행"
    echo ""
    echo -e "${BOLD}템플릿:${NC} nodejs, python, php, go, static"
    echo -e "${BOLD}API 서버:${NC} $API_BASE"
    echo ""
}

# 메인 로직
main() {
    # 종속성 확인
    check_dependencies
    
    local command=$1
    shift
    
    case $command in
        "list"|"ls")
            cmd_project_list "$@"
            ;;
        "create")
            cmd_project_create "$@"
            ;;
        "delete"|"remove"|"rm")
            cmd_project_delete "$@"
            ;;
        "status"|"stat")
            cmd_project_status "$@"
            ;;
        "start")
            cmd_control_start "$@"
            ;;
        "stop")
            cmd_control_stop "$@"
            ;;
        "restart")
            cmd_control_restart "$@"
            ;;
        "deploy")
            cmd_deploy_code "$@"
            ;;
        "build")
            cmd_deploy_build "$@"
            ;;
        "logs")
            cmd_logs_show "$@"
            ;;
        "tail")
            cmd_logs_tail "$@"
            ;;
        "files")
            cmd_logs_files "$@"
            ;;
        "diagnose"|"diag")
            cmd_diagnose_project "$@"
            ;;
        "db")
            cmd_database "$@"
            ;;
        "help"|"--help"|"-h"|"")
            show_help
            ;;
        *)
            log_error "알 수 없는 명령: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 스크립트 실행
main "$@"