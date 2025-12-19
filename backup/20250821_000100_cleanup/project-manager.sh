#!/bin/bash

# CodeB 프로젝트 관리 도구
# 실시간 모니터링 및 관리 기능

SERVER_IP="141.164.60.51"
SERVER_USER="root"
PROJECT_BASE="/var/lib/codeb/projects"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 헤더 출력
show_header() {
    clear
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║          CodeB Project Manager - Real-time Monitor          ║${NC}"
    echo -e "${CYAN}║                Server: ${SERVER_IP}                    ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# 프로젝트 목록 조회
list_projects() {
    show_header
    echo -e "${YELLOW}📂 프로젝트 목록:${NC}"
    echo "────────────────────────────────────────────────────────────────"
    
    ssh $SERVER_USER@$SERVER_IP "
        for dir in $PROJECT_BASE/*/; do
            if [ -d \"\$dir\" ]; then
                project_name=\$(basename \"\$dir\")
                echo -n \"  [\$project_name]\"
                
                # Pod 상태 확인
                pod_status=\$(podman pod ps --filter name=project-\$project_name --format '{{.Status}}' 2>/dev/null)
                if [ -n \"\$pod_status\" ]; then
                    echo -n \" - Pod: \$pod_status\"
                fi
                
                # 컨테이너 수 확인
                container_count=\$(podman ps -a --filter pod=project-\$project_name --format '{{.Names}}' 2>/dev/null | wc -l)
                echo -n \" - Containers: \$container_count\"
                
                # 포트 확인
                if [ -f \"\$dir/config/port\" ]; then
                    port=\$(cat \"\$dir/config/port\")
                    echo -n \" - Port: \$port\"
                fi
                
                echo \"\"
            fi
        done
    "
    echo "────────────────────────────────────────────────────────────────"
}

# 프로젝트 상세 정보
project_detail() {
    local project_name=$1
    show_header
    echo -e "${YELLOW}📊 프로젝트 상세: $project_name${NC}"
    echo "────────────────────────────────────────────────────────────────"
    
    ssh $SERVER_USER@$SERVER_IP "
        PROJECT_DIR=$PROJECT_BASE/$project_name
        
        if [ ! -d \"\$PROJECT_DIR\" ]; then
            echo '❌ 프로젝트를 찾을 수 없습니다.'
            exit 1
        fi
        
        echo '📁 디렉토리 구조:'
        tree -L 2 \$PROJECT_DIR 2>/dev/null || ls -la \$PROJECT_DIR
        
        echo ''
        echo '🐳 Pod 상태:'
        podman pod inspect project-$project_name 2>/dev/null | grep -E 'Name|State|Created' || echo 'Pod 없음'
        
        echo ''
        echo '📦 컨테이너 목록:'
        podman ps -a --filter pod=project-$project_name --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
        
        echo ''
        echo '💾 디스크 사용량:'
        du -sh \$PROJECT_DIR
        
        echo ''
        echo '🔗 네트워크 정보:'
        podman port -a 2>/dev/null | grep $project_name || echo '포트 매핑 없음'
    "
    echo "────────────────────────────────────────────────────────────────"
}

# 새 프로젝트 생성
create_project() {
    local project_name=$1
    local template=${2:-"nodejs"}
    local enable_postgres=${3:-"true"}
    local enable_redis=${4:-"true"}
    
    show_header
    echo -e "${GREEN}🚀 새 프로젝트 생성: $project_name${NC}"
    echo "────────────────────────────────────────────────────────────────"
    
    ssh $SERVER_USER@$SERVER_IP "
        cd /var/lib/codeb/templates
        ./create-project-resources.sh $project_name $template $enable_postgres $enable_redis
    "
    
    echo -e "${GREEN}✅ 프로젝트 생성 완료!${NC}"
    echo "  URL: http://$SERVER_IP:$(get_next_port)"
    echo "  도메인: $project_name.codeb.one-q.xyz"
}

# 프로젝트 삭제
delete_project() {
    local project_name=$1
    
    show_header
    echo -e "${RED}🗑️  프로젝트 삭제: $project_name${NC}"
    echo "────────────────────────────────────────────────────────────────"
    
    read -p "정말로 삭제하시겠습니까? (y/N): " confirm
    if [ "$confirm" != "y" ]; then
        echo "취소되었습니다."
        return
    fi
    
    ssh $SERVER_USER@$SERVER_IP "
        # Pod 및 컨테이너 중지/삭제
        podman pod stop project-$project_name 2>/dev/null
        podman pod rm project-$project_name 2>/dev/null
        
        # 개별 컨테이너 삭제
        podman rm -f codeb-postgres-$project_name 2>/dev/null
        podman rm -f codeb-redis-$project_name 2>/dev/null
        podman rm -f codeb-app-$project_name 2>/dev/null
        
        # 볼륨 삭제
        podman volume rm codeb-postgres-$project_name-data 2>/dev/null
        podman volume rm codeb-redis-$project_name-data 2>/dev/null
        
        # 디렉토리 삭제
        rm -rf $PROJECT_BASE/$project_name
        
        echo '✅ 프로젝트 삭제 완료'
    "
}

# 프로젝트 시작/중지
control_project() {
    local action=$1
    local project_name=$2
    
    show_header
    echo -e "${BLUE}⚙️  프로젝트 $action: $project_name${NC}"
    echo "────────────────────────────────────────────────────────────────"
    
    ssh $SERVER_USER@$SERVER_IP "
        podman pod $action project-$project_name 2>/dev/null || echo 'Pod를 찾을 수 없습니다.'
        
        # PM2 프로세스도 제어
        if [ '$action' = 'start' ]; then
            pm2 start $project_name 2>/dev/null || true
        elif [ '$action' = 'stop' ]; then
            pm2 stop $project_name 2>/dev/null || true
        fi
        
        echo '✅ 완료'
    "
}

# 실시간 모니터링
monitor_realtime() {
    while true; do
        show_header
        echo -e "${YELLOW}📊 실시간 모니터링 (5초마다 갱신, Ctrl+C로 종료)${NC}"
        echo "────────────────────────────────────────────────────────────────"
        
        ssh $SERVER_USER@$SERVER_IP "
            echo -e '\n${GREEN}[Podman Pods]${NC}'
            podman pod ps --format 'table {{.Name}}\t{{.Status}}\t{{.Created}}'
            
            echo -e '\n${GREEN}[실행 중인 컨테이너]${NC}'
            podman ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | head -10
            
            echo -e '\n${GREEN}[PM2 프로세스]${NC}'
            pm2 list --no-color | grep -E 'online|stopped|errored' | head -5
            
            echo -e '\n${GREEN}[리소스 사용량]${NC}'
            echo -n 'CPU: '
            top -bn1 | grep 'Cpu(s)' | awk '{print \$2}' | cut -d'%' -f1
            echo -n 'Memory: '
            free -h | grep Mem | awk '{print \$3 \"/\" \$2}'
            echo -n 'Disk: '
            df -h /var/lib/codeb | tail -1 | awk '{print \$3 \"/\" \$2 \" (\" \$5 \")\"}'
        "
        
        sleep 5
    done
}

# 다음 사용 가능한 포트 찾기
get_next_port() {
    ssh $SERVER_USER@$SERVER_IP "
        for port in {4000..4100}; do
            if ! netstat -tlnp 2>/dev/null | grep -q \":\$port \"; then
                echo \$port
                break
            fi
        done
    "
}

# 메인 메뉴
main_menu() {
    while true; do
        show_header
        echo -e "${YELLOW}📋 메인 메뉴${NC}"
        echo "────────────────────────────────────────────────────────────────"
        echo "  1) 프로젝트 목록"
        echo "  2) 프로젝트 상세 정보"
        echo "  3) 새 프로젝트 생성"
        echo "  4) 프로젝트 삭제"
        echo "  5) 프로젝트 시작"
        echo "  6) 프로젝트 중지"
        echo "  7) 프로젝트 재시작"
        echo "  8) 실시간 모니터링"
        echo "  9) 로그 보기"
        echo "  0) 종료"
        echo "────────────────────────────────────────────────────────────────"
        echo -n "선택: "
        read choice
        
        case $choice in
            1)
                list_projects
                read -p "계속하려면 Enter를 누르세요..."
                ;;
            2)
                read -p "프로젝트 이름: " project_name
                project_detail "$project_name"
                read -p "계속하려면 Enter를 누르세요..."
                ;;
            3)
                read -p "프로젝트 이름: " project_name
                read -p "템플릿 (nodejs/python/php) [nodejs]: " template
                template=${template:-nodejs}
                read -p "PostgreSQL 사용? (y/n) [y]: " use_postgres
                use_postgres=${use_postgres:-y}
                read -p "Redis 사용? (y/n) [y]: " use_redis
                use_redis=${use_redis:-y}
                
                postgres_flag="false"
                redis_flag="false"
                [ "$use_postgres" = "y" ] && postgres_flag="true"
                [ "$use_redis" = "y" ] && redis_flag="true"
                
                create_project "$project_name" "$template" "$postgres_flag" "$redis_flag"
                read -p "계속하려면 Enter를 누르세요..."
                ;;
            4)
                read -p "삭제할 프로젝트 이름: " project_name
                delete_project "$project_name"
                read -p "계속하려면 Enter를 누르세요..."
                ;;
            5)
                read -p "시작할 프로젝트 이름: " project_name
                control_project "start" "$project_name"
                read -p "계속하려면 Enter를 누르세요..."
                ;;
            6)
                read -p "중지할 프로젝트 이름: " project_name
                control_project "stop" "$project_name"
                read -p "계속하려면 Enter를 누르세요..."
                ;;
            7)
                read -p "재시작할 프로젝트 이름: " project_name
                control_project "restart" "$project_name"
                read -p "계속하려면 Enter를 누르세요..."
                ;;
            8)
                monitor_realtime
                ;;
            9)
                read -p "프로젝트 이름: " project_name
                ssh $SERVER_USER@$SERVER_IP "pm2 logs $project_name --lines 50"
                read -p "계속하려면 Enter를 누르세요..."
                ;;
            0)
                echo "종료합니다."
                exit 0
                ;;
            *)
                echo "잘못된 선택입니다."
                sleep 1
                ;;
        esac
    done
}

# 인자 처리
case "${1:-}" in
    list)
        list_projects
        ;;
    detail)
        project_detail "$2"
        ;;
    create)
        create_project "$2" "${3:-nodejs}" "${4:-true}" "${5:-true}"
        ;;
    delete)
        delete_project "$2"
        ;;
    start)
        control_project "start" "$2"
        ;;
    stop)
        control_project "stop" "$2"
        ;;
    restart)
        control_project "restart" "$2"
        ;;
    monitor)
        monitor_realtime
        ;;
    *)
        main_menu
        ;;
esac