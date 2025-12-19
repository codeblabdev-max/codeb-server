#!/bin/bash

# CodeB CLI v3.5 - Bash 자동완성

_codeb_completions() {
    local cur prev opts
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    # 메인 명령어
    local commands="create list delete status start stop restart deploy build logs tail files diagnose db env local help"
    
    # 템플릿
    local templates="nextjs remix react vue nodejs python"
    
    # 환경 명령어
    local env_commands="init switch status list set validate"
    
    # 로컬 명령어  
    local local_commands="init start stop reset status"
    
    # DB 명령어
    local db_commands="migrate seed backup restore tables query connect"

    case "${COMP_CWORD}" in
        1)
            # 첫 번째 인자: 메인 명령어
            COMPREPLY=( $(compgen -W "${commands}" -- ${cur}) )
            return 0
            ;;
        2)
            # 두 번째 인자: 하위 명령어 또는 프로젝트 이름
            case "${prev}" in
                create)
                    # 프로젝트 이름 제안 (디렉토리 이름)
                    COMPREPLY=( $(compgen -d -- ${cur}) )
                    return 0
                    ;;
                env)
                    COMPREPLY=( $(compgen -W "${env_commands}" -- ${cur}) )
                    return 0
                    ;;
                local)
                    COMPREPLY=( $(compgen -W "${local_commands}" -- ${cur}) )
                    return 0
                    ;;
                db)
                    COMPREPLY=( $(compgen -W "${db_commands}" -- ${cur}) )
                    return 0
                    ;;
                list|help)
                    # 추가 인자 없음
                    return 0
                    ;;
                *)
                    # 프로젝트 이름 (기존 디렉토리에서 선택)
                    COMPREPLY=( $(compgen -d -- ${cur}) )
                    return 0
                    ;;
            esac
            ;;
        3)
            # 세 번째 인자
            case "${COMP_WORDS[1]}" in
                create)
                    # 템플릿 선택
                    COMPREPLY=( $(compgen -W "${templates}" -- ${cur}) )
                    return 0
                    ;;
                env)
                    case "${prev}" in
                        init|switch)
                            COMPREPLY=( $(compgen -W "local server" -- ${cur}) )
                            return 0
                            ;;
                    esac
                    ;;
                deploy)
                    # Git URL 제안은 어려우므로 패스
                    return 0
                    ;;
                build)
                    COMPREPLY=( $(compgen -W "build dev start" -- ${cur}) )
                    return 0
                    ;;
                logs|tail)
                    COMPREPLY=( $(compgen -W "app build pm2" -- ${cur}) )
                    return 0
                    ;;
            esac
            ;;
        *)
            # 옵션 플래그
            if [[ ${cur} == --* ]]; then
                case "${COMP_WORDS[1]}" in
                    create)
                        local opts="--mode= --with-db= --with-cache= --with-storage="
                        COMPREPLY=( $(compgen -W "${opts}" -- ${cur}) )
                        ;;
                    deploy)
                        local opts="--db-backup --force"
                        COMPREPLY=( $(compgen -W "${opts}" -- ${cur}) )
                        ;;
                esac
            elif [[ ${prev} == --mode ]]; then
                COMPREPLY=( $(compgen -W "local server" -- ${cur}) )
            elif [[ ${prev} == --with-db ]]; then
                COMPREPLY=( $(compgen -W "postgresql mysql" -- ${cur}) )
            elif [[ ${prev} == --with-cache ]]; then
                COMPREPLY=( $(compgen -W "redis memcached" -- ${cur}) )
            elif [[ ${prev} == --with-storage ]]; then
                COMPREPLY=( $(compgen -W "local s3 gcs" -- ${cur}) )
            fi
            ;;
    esac
}

complete -F _codeb_completions codeb