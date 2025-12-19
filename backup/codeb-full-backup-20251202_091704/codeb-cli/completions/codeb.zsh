#compdef codeb

# CodeB CLI v3.5 - Zsh 자동완성

_codeb() {
    local context state line
    typeset -A opt_args

    # 메인 명령어
    local -a commands
    commands=(
        'create:새 프로젝트 생성'
        'list:프로젝트 목록 보기'
        'delete:프로젝트 삭제'
        'status:프로젝트 상태 확인'
        'start:프로젝트 시작'
        'stop:프로젝트 중지'
        'restart:프로젝트 재시작'
        'deploy:코드 배포'
        'build:빌드 실행'
        'logs:로그 보기'
        'tail:실시간 로그 모니터링'
        'files:파일 구조 확인'
        'diagnose:종합 진단'
        'db:데이터베이스 관리'
        'env:환경 관리'
        'local:로컬 Podman 관리'
        'help:도움말 보기'
    )

    # 템플릿
    local -a templates
    templates=(
        'nextjs:Next.js 프로젝트'
        'remix:Remix 프로젝트'
        'react:React 프로젝트'
        'vue:Vue 프로젝트'
        'nodejs:Node.js 프로젝트'
        'python:Python 프로젝트'
    )

    _arguments -C \
        '1: :->command' \
        '2: :->subcommand' \
        '3: :->third' \
        '*: :->args'

    case $state in
        command)
            _describe 'commands' commands
            ;;
        subcommand)
            case $line[1] in
                create)
                    _message '프로젝트 이름'
                    ;;
                env)
                    local -a env_commands
                    env_commands=(
                        'init:환경 초기화'
                        'switch:환경 전환'
                        'status:현재 환경 상태'
                        'list:환경 변수 목록'
                        'set:환경 변수 설정'
                        'validate:환경 검증'
                    )
                    _describe 'env commands' env_commands
                    ;;
                local)
                    local -a local_commands
                    local_commands=(
                        'init:로컬 개발 환경 초기화'
                        'start:Podman 컨테이너 시작'
                        'stop:Podman 컨테이너 중지'
                        'reset:컨테이너 초기화'
                        'status:컨테이너 상태 확인'
                    )
                    _describe 'local commands' local_commands
                    ;;
                db)
                    local -a db_commands
                    db_commands=(
                        'migrate:마이그레이션 실행'
                        'seed:시드 데이터 생성'
                        'backup:데이터베이스 백업'
                        'restore:데이터베이스 복원'
                        'tables:테이블 목록 조회'
                        'query:SQL 쿼리 실행'
                        'connect:데이터베이스 접속'
                    )
                    _describe 'db commands' db_commands
                    ;;
                list|help)
                    # 추가 인자 없음
                    ;;
                *)
                    _files -/
                    ;;
            esac
            ;;
        third)
            case $line[1] in
                create)
                    _describe 'templates' templates
                    ;;
                env)
                    case $line[2] in
                        init|switch)
                            local -a modes
                            modes=(
                                'local:로컬 개발 환경'
                                'server:서버 환경'
                            )
                            _describe 'modes' modes
                            ;;
                    esac
                    ;;
                build)
                    local -a build_types
                    build_types=(
                        'build:프로덕션 빌드'
                        'dev:개발 모드'
                        'start:시작'
                    )
                    _describe 'build types' build_types
                    ;;
                logs|tail)
                    local -a log_types
                    log_types=(
                        'app:애플리케이션 로그'
                        'build:빌드 로그'
                        'pm2:PM2 로그'
                    )
                    _describe 'log types' log_types
                    ;;
            esac
            ;;
        args)
            # 옵션 처리
            case $line[1] in
                create)
                    _arguments \
                        '--mode=[환경 모드]:mode:(local server)' \
                        '--with-db=[데이터베이스]:db:(postgresql mysql)' \
                        '--with-cache=[캐시]:cache:(redis memcached)' \
                        '--with-storage=[스토리지]:storage:(local s3 gcs)'
                    ;;
                deploy)
                    _arguments \
                        '--db-backup[데이터베이스 백업]' \
                        '--force[강제 배포]'
                    ;;
            esac
            ;;
    esac
}

_codeb "$@"