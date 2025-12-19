# CodeB Deploy System - 문제 해결 가이드

## 목차
1. [진단 명령어](#진단-명령어)
2. [MCP 서버 문제](#mcp-서버-문제)
3. [배포 문제](#배포-문제)
4. [컨테이너 문제](#컨테이너-문제)
5. [네트워크 및 포트 문제](#네트워크-및-포트-문제)
6. [모니터링 문제](#모니터링-문제)
7. [알림 문제](#알림-문제)
8. [보안 스캔 문제](#보안-스캔-문제)
9. [GitHub Actions 문제](#github-actions-문제)

---

## 진단 명령어

### MCP를 통한 진단

```bash
# Claude Code에서
"서버 상태 분석해줘"
"myapp staging 헬스체크 해줘"
"포트 할당 현황 보여줘"
"모니터링 상태 확인해줘"
```

### 서버 직접 접속 진단

```bash
# 시스템 상태
htop                          # CPU/메모리 실시간 모니터링
df -h                         # 디스크 사용량
free -h                       # 메모리 사용량

# 컨테이너 상태
podman ps -a                  # 모든 컨테이너
podman logs <container>       # 컨테이너 로그

# 서비스 상태
systemctl status actions-runner
systemctl status prometheus
systemctl status grafana-server
systemctl status alertmanager

# 네트워크 상태
ss -tlnp                      # 열린 포트
curl localhost:9090/-/healthy # Prometheus 상태
```

---

## MCP 서버 문제

### 문제: MCP 서버가 인식되지 않음

**증상**: Claude Code에서 도구 호출 시 "Unknown tool" 에러

**해결 방법**:

1. **빌드 확인**
   ```bash
   cd /path/to/codeb-deploy-system/mcp-server
   npm run build
   ls dist/index.js  # 파일 존재 확인
   ```

2. **.mcp.json 확인**
   ```json
   {
     "mcpServers": {
       "codeb-deploy": {
         "command": "node",
         "args": ["/absolute/path/to/dist/index.js"],  // 절대 경로
         "env": {
           "CODEB_SERVER_HOST": "YOUR_SERVER_IP"
         }
       }
     }
   }
   ```

3. **Claude Code 재시작**

### 문제: SSH 연결 실패

**증상**: "Connection refused" 또는 "Permission denied"

**해결 방법**:

1. **SSH 키 권한 확인**
   ```bash
   chmod 600 ~/.ssh/id_rsa
   chmod 644 ~/.ssh/id_rsa.pub
   ```

2. **연결 테스트**
   ```bash
   ssh -i ~/.ssh/id_rsa -v root@YOUR_SERVER_IP
   ```

3. **서버 SSH 설정 확인**
   ```bash
   # 서버에서
   cat /etc/ssh/sshd_config | grep -E "(PermitRootLogin|PubkeyAuthentication)"
   ```

4. **방화벽 확인**
   ```bash
   # 서버에서
   ufw status
   ufw allow 22/tcp
   ```

### 문제: 환경 변수 인식 안됨

**증상**: "SLACK_WEBHOOK_URL is not defined"

**해결 방법**:

1. **.mcp.json에 환경 변수 추가**
   ```json
   {
     "mcpServers": {
       "codeb-deploy": {
         "env": {
           "CODEB_SERVER_HOST": "...",
           "SLACK_WEBHOOK_URL": "https://hooks.slack.com/..."
         }
       }
     }
   }
   ```

2. **시스템 환경 변수로 설정**
   ```bash
   export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
   ```

---

## 배포 문제

### 문제: 배포 실패 - 이미지 Pull 실패

**증상**: "Error: Image not found"

**해결 방법**:

1. **레지스트리 상태 확인**
   ```bash
   curl http://localhost:5000/v2/_catalog
   curl http://localhost:5000/v2/myapp/tags/list
   ```

2. **이미지 존재 확인**
   ```bash
   podman images | grep myapp
   ```

3. **이미지 직접 Push**
   ```bash
   podman tag myapp:latest localhost:5000/myapp:latest
   podman push localhost:5000/myapp:latest
   ```

### 문제: 배포 실패 - 포트 충돌

**증상**: "Port 3001 is already in use"

**해결 방법**:

1. **포트 사용 현황 확인**
   ```bash
   ss -tlnp | grep 3001
   ```

2. **MCP로 포트 현황 조회**
   ```bash
   # Claude Code에서
   "포트 할당 현황 보여줘"
   ```

3. **기존 컨테이너 정리**
   ```bash
   podman stop <container_using_port>
   podman rm <container_using_port>
   ```

### 문제: 배포 실패 - 헬스체크 실패

**증상**: "Healthcheck failed after 3 retries"

**해결 방법**:

1. **컨테이너 로그 확인**
   ```bash
   podman logs myapp-staging
   ```

2. **헬스체크 엔드포인트 직접 테스트**
   ```bash
   curl -v http://localhost:3001/health
   ```

3. **컨테이너 내부 확인**
   ```bash
   podman exec -it myapp-staging sh
   # 내부에서
   curl localhost:3000/health
   ```

4. **헬스체크 타임아웃 늘리기**
   ```bash
   # Claude Code에서
   "myapp staging 헬스체크 해줘. 타임아웃 60초로"
   ```

### 문제: Blue-Green 배포 - 트래픽 전환 실패

**증상**: 새 버전으로 트래픽이 전환되지 않음

**해결 방법**:

1. **Caddy 설정 확인**
   ```bash
   cat /etc/caddy/sites/myapp.caddy
   ```

2. **Caddy 리로드**
   ```bash
   systemctl reload caddy
   ```

3. **Green 컨테이너 상태 확인**
   ```bash
   podman ps | grep green
   curl localhost:4002/health  # Green 포트
   ```

### 문제: Canary 배포 - 트래픽 비율 안맞음

**증상**: 설정한 비율과 실제 트래픽 분배가 다름

**해결 방법**:

1. **Caddy 설정 확인**
   ```bash
   cat /etc/caddy/sites/myapp.caddy
   # weighted_random 설정 확인
   ```

2. **Prometheus 메트릭 확인**
   ```bash
   # 버전별 트래픽 분포
   curl 'http://localhost:9090/api/v1/query?query=rate(http_requests_total[5m])'
   ```

---

## 컨테이너 문제

### 문제: 컨테이너 시작 실패

**증상**: "Container exited with code 1"

**해결 방법**:

1. **로그 확인**
   ```bash
   podman logs myapp-staging
   ```

2. **환경 변수 확인**
   ```bash
   podman inspect myapp-staging | jq '.[0].Config.Env'
   ```

3. **이미지 직접 테스트**
   ```bash
   podman run -it --rm localhost:5000/myapp:latest sh
   ```

### 문제: 컨테이너 메모리 부족

**증상**: "OOMKilled"

**해결 방법**:

1. **메모리 제한 확인**
   ```bash
   podman inspect myapp-staging | jq '.[0].HostConfig.Memory'
   ```

2. **메모리 제한 늘리기**
   ```bash
   podman run -d --memory=2g ...
   ```

3. **앱 메모리 프로파일링**
   - Node.js: `--max-old-space-size=1536`
   - JVM: `-Xmx1536m`

### 문제: 컨테이너 재시작 반복

**증상**: 컨테이너가 계속 재시작됨

**해결 방법**:

1. **재시작 횟수 확인**
   ```bash
   podman ps -a --format "{{.Names}} {{.Status}}"
   ```

2. **마지막 종료 원인 확인**
   ```bash
   podman inspect myapp-staging | jq '.[0].State'
   ```

3. **재시작 정책 수정**
   ```bash
   podman update --restart=on-failure:3 myapp-staging
   ```

---

## 네트워크 및 포트 문제

### 문제: 외부에서 접근 불가

**증상**: 외부에서 서비스에 접근할 수 없음

**해결 방법**:

1. **방화벽 확인**
   ```bash
   ufw status
   ufw allow 3001/tcp  # 필요한 포트 허용
   ```

2. **Caddy 리버스 프록시 확인**
   ```bash
   cat /etc/caddy/Caddyfile
   systemctl status caddy
   ```

3. **DNS 확인**
   ```bash
   dig myapp.codeb.dev
   ```

### 문제: 레지스트리 접근 불가

**증상**: "connection refused" to localhost:5000

**해결 방법**:

1. **레지스트리 컨테이너 확인**
   ```bash
   podman ps | grep registry
   ```

2. **레지스트리 재시작**
   ```bash
   systemctl restart codeb-registry
   ```

3. **레지스트리 로그 확인**
   ```bash
   podman logs codeb-registry
   ```

---

## 모니터링 문제

### 문제: Prometheus 타겟 다운

**증상**: Prometheus UI에서 타겟이 DOWN 상태

**해결 방법**:

1. **타겟 상태 확인**
   ```bash
   curl http://localhost:9090/api/v1/targets
   ```

2. **앱 메트릭 엔드포인트 확인**
   ```bash
   curl http://localhost:3001/metrics
   ```

3. **타겟 설정 확인**
   ```bash
   cat /etc/prometheus/targets/apps.json
   ```

4. **Prometheus 리로드**
   ```bash
   curl -X POST http://localhost:9090/-/reload
   ```

### 문제: Grafana 대시보드 데이터 없음

**증상**: 대시보드에 "No Data" 표시

**해결 방법**:

1. **데이터소스 연결 확인**
   - Grafana → Configuration → Data Sources → Prometheus → Test

2. **쿼리 직접 테스트**
   - Explore → Prometheus → 쿼리 입력

3. **시간 범위 확인**
   - 대시보드 우측 상단 시간 선택기 확인

### 문제: Alertmanager 알림 미전송

**증상**: 알림이 설정되었지만 전송되지 않음

**해결 방법**:

1. **알림 상태 확인**
   ```bash
   curl http://localhost:9093/api/v2/alerts
   ```

2. **Alertmanager 설정 확인**
   ```bash
   cat /etc/alertmanager/alertmanager.yml
   ```

3. **수신자 설정 테스트**
   ```bash
   # 테스트 알림 전송
   curl -X POST http://localhost:9093/api/v2/alerts \
     -H "Content-Type: application/json" \
     -d '[{"labels":{"alertname":"test"},"annotations":{"summary":"Test alert"}}]'
   ```

---

## 알림 문제

### 문제: Slack 알림 실패

**증상**: "Slack notification failed"

**해결 방법**:

1. **Webhook URL 확인**
   ```bash
   curl -X POST $SLACK_WEBHOOK_URL \
     -H "Content-Type: application/json" \
     -d '{"text": "Test message"}'
   ```

2. **채널 권한 확인**
   - Slack App이 해당 채널에 접근 권한이 있는지 확인

3. **환경 변수 확인**
   ```bash
   echo $SLACK_WEBHOOK_URL
   ```

### 문제: PagerDuty 알림 실패

**증상**: "PagerDuty notification failed"

**해결 방법**:

1. **API 테스트**
   ```bash
   curl -X POST https://events.pagerduty.com/v2/enqueue \
     -H "Content-Type: application/json" \
     -d '{
       "routing_key": "'$PAGERDUTY_ROUTING_KEY'",
       "event_action": "trigger",
       "payload": {
         "summary": "Test alert",
         "severity": "info",
         "source": "codeb-deploy"
       }
     }'
   ```

2. **Routing Key 확인**
   - PagerDuty → Services → Integration 설정

---

## 보안 스캔 문제

### 문제: Trivy 스캔 실패

**증상**: "Trivy scan failed"

**해결 방법**:

1. **Trivy 설치 확인**
   ```bash
   trivy --version
   ```

2. **이미지 접근 확인**
   ```bash
   podman pull localhost:5000/myapp:latest
   ```

3. **캐시 정리**
   ```bash
   trivy image --clear-cache
   ```

### 문제: gitleaks 스캔 실패

**증상**: "gitleaks scan failed"

**해결 방법**:

1. **gitleaks 설치 확인**
   ```bash
   gitleaks version
   ```

2. **Git 저장소 확인**
   ```bash
   git status
   ```

3. **수동 스캔 테스트**
   ```bash
   gitleaks detect --source=. --verbose
   ```

---

## GitHub Actions 문제

### 문제: Runner 오프라인

**증상**: GitHub에서 Runner가 오프라인으로 표시

**해결 방법**:

1. **서비스 상태 확인**
   ```bash
   systemctl status actions-runner
   journalctl -u actions-runner -f
   ```

2. **서비스 재시작**
   ```bash
   systemctl restart actions-runner
   ```

3. **토큰 재발급** (만료된 경우)
   - GitHub → Settings → Actions → Runners → New self-hosted runner
   - 새 토큰으로 재설정

### 문제: 워크플로우 실패 - 권한 오류

**증상**: "Permission denied" in workflow

**해결 방법**:

1. **파일 권한 확인**
   ```bash
   ls -la /home/codeb/actions-runner/_work/
   ```

2. **사용자 확인**
   ```bash
   ps aux | grep actions-runner
   ```

3. **권한 수정**
   ```bash
   chown -R codeb:codeb /home/codeb/actions-runner/_work/
   ```

### 문제: 워크플로우 실패 - 디스크 부족

**증상**: "No space left on device"

**해결 방법**:

1. **디스크 확인**
   ```bash
   df -h
   du -sh /home/codeb/actions-runner/_work/*
   ```

2. **오래된 워크 디렉토리 정리**
   ```bash
   rm -rf /home/codeb/actions-runner/_work/OLD_REPO
   ```

3. **Podman 정리**
   ```bash
   podman system prune -af
   podman volume prune -f
   ```

---

## 긴급 복구 절차

### 서비스 완전 중단 시

```bash
# 1. 현재 상태 파악
systemctl status actions-runner prometheus grafana-server caddy

# 2. 핵심 서비스 재시작
systemctl restart caddy
systemctl restart actions-runner

# 3. 앱 컨테이너 확인 및 재시작
podman ps -a
podman start myapp-production

# 4. 헬스체크
curl http://localhost:4001/health
```

### 긴급 롤백

```bash
# Claude Code에서
"myapp production 긴급 롤백해줘"

# 또는 수동으로
podman stop myapp-production
podman rename myapp-production myapp-production-failed
podman rename myapp-production-backup myapp-production
podman start myapp-production
```

---

## 로그 수집

문제 보고 시 다음 로그를 수집하세요:

```bash
# 시스템 로그
journalctl --since "1 hour ago" > system.log

# 서비스 로그
journalctl -u actions-runner --since "1 hour ago" > runner.log
journalctl -u prometheus --since "1 hour ago" > prometheus.log

# 앱 로그
podman logs myapp-staging > app-staging.log
podman logs myapp-production > app-production.log

# 상태 정보
podman ps -a > containers.txt
ss -tlnp > ports.txt
df -h > disk.txt
free -h > memory.txt
```

---

## 지원 요청

문제 해결이 안 될 경우:

1. **로그 수집**: 위 섹션 참조
2. **환경 정보 정리**: OS 버전, Podman 버전, Node.js 버전
3. **재현 단계 문서화**: 문제 발생 전 수행한 작업
4. **GitHub Issue 생성**: 상세 정보 포함
