# 서버 구성 상세 보고서

## 📊 서버 개요

### 서버 1: 141.164.60.51 (Vultr - Coolify 서버)
- **호스트명**: vultr
- **OS**: Ubuntu 22.04.5 LTS (Jammy)
- **커널**: Linux 5.15.0-142-generic
- **아키텍처**: x86_64
- **주요 역할**: Docker 기반 애플리케이션 호스팅, Coolify PaaS 플랫폼

### 서버 2: 158.247.233.83 (Vultr - CyberPanel 서버)
- **호스트명**: vultr  
- **OS**: Ubuntu 22.04.5 LTS (Jammy)
- **커널**: Linux 5.15.0-126-generic
- **아키텍처**: x86_64
- **주요 역할**: 웹 호스팅, 이메일 서버, DNS 서버

---

## 🖥️ 서버 1 (141.164.60.51) - Coolify 서버

### 설치된 주요 소프트웨어

#### 시스템 패키지
- **Docker CE**: 28.3.2 (Container Engine)
- **Docker Compose Plugin**: 2.38.2
- **Docker Buildx Plugin**: 0.25.0
- **Git**: 1.2.34.1
- **Nginx**: 1.18.0 (모듈 포함)
- **Python**: 3.10.6
- **PostgreSQL**: 15 (시스템 서비스)
- **Redis**: 7.x (시스템 서비스)
- **PowerDNS**: 4.7.5 (권한 있는 DNS 서버)

#### 실행 중인 시스템 서비스
- `docker.service` - Docker 데몬
- `postgresql@15-main.service` - PostgreSQL 15 데이터베이스
- `redis-server.service` - Redis 캐시 서버
- `pdns.service` - PowerDNS 권한 있는 DNS 서버

#### DNS 서비스 (PowerDNS)
- **버전**: 4.7.5 (서버 2보다 최신 버전)
- **백엔드**: PostgreSQL (gpgsql)
- **포트**: 53 (DNS), 8081 (웹 인터페이스/API)
- **API**: 활성화됨 (API 키 구성)
- **관리 도메인**:
  - one-q.kr (현재 레코드 없음)
  - one-q.xyz (현재 레코드 없음)
- **특징**: Coolify와 통합 가능한 API 기반 DNS 관리

### Docker 컨테이너 구성

#### Coolify 플랫폼 (핵심 서비스)
- **coolify**: Coolify 메인 애플리케이션 (v4.0.0-beta.420.6)
- **coolify-proxy**: Traefik v3.1 리버스 프록시 (포트 80, 443, 8080)
- **coolify-db**: PostgreSQL 15 (Coolify 데이터베이스)
- **coolify-redis**: Redis 7 (Coolify 캐시)
- **coolify-realtime**: WebSocket 서버 (포트 6001-6002)
- **coolify-sentinel**: 모니터링 서비스

#### 배포된 애플리케이션

##### PostgreSQL 데이터베이스 (총 7개)
- `lw004gwocok84w4o0o08cc00` - PostgreSQL 17
- `f8g0kswkokkgogcs00sos40g` - PostgreSQL 17  
- `nog4gwo0c0koks4wg4scwsco` - PostgreSQL 16
- `m00wk0gg0kck804084wwwow0` - PostgreSQL 17 (포트 5434 노출)
- `f0okg4880wo844g08k0csok4` - PostgreSQL 17
- `mco08g444s00gkkw0wso40sk` - PostgreSQL 17
- `revu-platform-postgres` - PostgreSQL 15 (포트 5433 노출)

##### Redis 인스턴스 (총 3개)
- `agsck4skoos4ss08gwckcs08` - Redis 7.2
- `bssgk8sogo8cgs4c4o0gkwkw` - Redis 7.2
- `revu-platform-redis` - Redis 7

##### Next.js 애플리케이션 (총 3개)
- `wsscs444wc0oococows8wo8g` - 운영 중 (4일)
- `wcs0go00wsocssgwk0o8848c` - 운영 중 (4일)
- `nkkc88c8k8008k0ssws4g848` - 운영 중 (4일)
- `eko44k8kwgwgk4w8cscksk88` - 재시작 중 (문제 발생)

##### Appwrite 플랫폼 (완전한 BaaS 스택)
- **메인 서비스**: appwrite v1.7.4
- **워커 서비스**: audits, builds, certificates, databases, deletes, functions, mails, messaging, migrations, stats, webhooks
- **스케줄러**: executions, functions, messages
- **실시간 서비스**: realtime, browser
- **데이터베이스**: MariaDB 10.11
- **캐시**: Redis 7.2.4
- **UI**: Console 6.0.13, Assistant 0.4.0
- **런타임**: OpenRuntimes Executor 0.7.14

### 네트워크 포트
- **53**: DNS (PowerDNS)
- **80, 443**: HTTP/HTTPS (Traefik 프록시)
- **8000**: Coolify 관리 패널
- **8080**: Traefik 대시보드
- **8081**: PowerDNS 웹 인터페이스/API
- **5433, 5434**: PostgreSQL 외부 접속
- **6001-6002**: WebSocket 연결

---

## 🖥️ 서버 2 (158.247.233.83) - CyberPanel 서버

### 설치된 주요 소프트웨어

#### 시스템 패키지
- **Git**: 1.2.34.1
- **Python**: 3.10.12
- **MySQL Client**: 8.0.42
- **Redis**: 시스템 서비스
- **Apache2 Utils**: 2.4.52

#### 웹 호스팅 스택 (CyberPanel)
- **OpenLiteSpeed/LiteSpeed**: 웹 서버 (포트 80, 443, 7080)
- **CyberPanel**: 웹 호스팅 컨트롤 패널 (포트 8090)
- **MySQL/MariaDB**: 데이터베이스 서버 (포트 3306, localhost)
- **Redis**: 캐시 서버 (포트 6379, localhost)
- **PHP**: 웹 애플리케이션 런타임

#### 이메일 서비스
- **Postfix**: SMTP 서버
- **Dovecot**: IMAP/POP3 서버
- **OpenDKIM**: 이메일 인증
- **Pure-FTPd MySQL**: FTP 서버

#### DNS 서비스
- **PowerDNS**: 권한 있는 DNS 서버 v4.5.3
  - **포트**: 53 (DNS), 8081 (웹 인터페이스)
  - **백엔드**: MySQL (gmysql)
  - **관리 도메인**: 
    - ntcap.kr (14개 레코드)
    - one-q.kr (9개 레코드)  
    - videopick.one-q.xyz (6개 레코드)
  - **데이터베이스**: cyberpanel DB 사용

### 실행 중인 서비스
- `dovecot.service` - 이메일 서버 (IMAP/POP3)
- `opendkim.service` - 이메일 DKIM 서명
- `pdns.service` - PowerDNS 서버
- `postfix@-.service` - 이메일 전송 (SMTP)
- `pure-ftpd-mysql.service` - FTP 서버
- `redis-server.service` - Redis 캐시

### 네트워크 포트
- **53**: DNS (TCP/UDP)
- **80**: HTTP
- **443**: HTTPS
- **3306**: MySQL (localhost only)
- **6379**: Redis (localhost only)
- **7080**: OpenLiteSpeed 관리자
- **8081**: 추가 웹 서비스
- **8090**: CyberPanel 관리 패널

---

## 🔐 보안 구성

### 서버 1 (141.164.60.51)
- Docker 컨테이너 격리
- Traefik 리버스 프록시를 통한 SSL/TLS
- PostgreSQL과 Redis는 Docker 네트워크 내부 통신
- 외부 노출 포트 최소화

### 서버 2 (158.247.233.83)
- MySQL과 Redis는 localhost 전용
- 이메일 인증 (OpenDKIM)
- DNS 서버 운영
- CyberPanel 관리 패널 (8090)

---

## 📈 리소스 사용 현황

### 서버 1 - Docker 컨테이너 & DNS 통계
- **총 컨테이너**: 44개
- **PostgreSQL 인스턴스**: 7개
- **Redis 인스턴스**: 3개
- **애플리케이션**: Next.js 앱 4개, Appwrite 완전 스택 1세트
- **프록시/로드밸런서**: Traefik
- **DNS**: PowerDNS 4.7.5 (PostgreSQL 백엔드, API 활성화)

### 서버 2 - 웹 호스팅 & DNS
- **웹 서버**: OpenLiteSpeed/LiteSpeed
- **데이터베이스**: MySQL/MariaDB
- **이메일**: 완전한 이메일 스택 (송수신, 인증)
- **DNS**: PowerDNS 권한 서버 v4.5.3
  - 3개 도메인 관리 중 (ntcap.kr, one-q.kr, videopick.one-q.xyz)
  - MySQL 백엔드 사용
  - 웹 인터페이스 포트 8081
- **캐시**: Redis

---

## 🎯 용도별 구분

### 서버 1 (141.164.60.51) - 애플리케이션 서버
- **주 용도**: Docker 기반 애플리케이션 호스팅
- **관리 도구**: Coolify PaaS
- **적합한 워크로드**: 
  - 컨테이너화된 애플리케이션
  - 마이크로서비스
  - CI/CD 파이프라인
  - 개발/스테이징 환경

### 서버 2 (158.247.233.83) - 웹 호스팅 서버
- **주 용도**: 전통적인 웹 호스팅
- **관리 도구**: CyberPanel
- **적합한 워크로드**:
  - WordPress, PHP 웹사이트
  - 이메일 호스팅
  - DNS 호스팅
  - 공유 호스팅 환경

---

## 💡 권장사항

1. **서버 1**: 
   - 재시작 중인 컨테이너 (`eko44k8kwgwgk4w8cscksk88`) 상태 확인 필요
   - Docker 컨테이너 수가 많으므로 리소스 모니터링 권장
   - 정기적인 Docker 이미지 정리 권장
   - PowerDNS 도메인 레코드 구성 필요 (one-q.kr, one-q.xyz)
   - PowerDNS API 보안 강화 (API 키 접근 제한)

2. **서버 2**:
   - CyberPanel 업데이트 상태 확인
   - 이메일 서버 보안 설정 검토
   - PowerDNS 보안 강화 권장:
     - 웹 인터페이스(8081) 접근 제한 설정
     - DNSSEC 구성 검토
     - DNS 쿼리 로깅 활성화

3. **공통**:
   - 정기적인 시스템 업데이트
   - 백업 전략 수립
   - 모니터링 시스템 구축