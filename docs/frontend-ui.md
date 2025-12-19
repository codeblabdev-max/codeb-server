# CodeB Dashboard - Frontend UI 통합 설계서

> Next.js 15 + React 19 + Tailwind CSS + shadcn/ui
> 모바일 우선 반응형 디자인으로 모든 디바이스에서 완벽한 경험 제공

## 1. 프로젝트 개요

### 기술 스택
```typescript
{
  framework: "Next.js 15 (App Router)",
  ui: "React 19",
  styling: "Tailwind CSS v4",
  state: "@tanstack/react-query",
  http: "axios",
  icons: "lucide-react",
  dateUtils: "date-fns"
}
```

### API 엔드포인트
- **SSOT Registry**: http://localhost:3102
  - GET /servers - 4개 서버 목록
  - GET /projects - 전체 프로젝트 목록
  - POST /sync - 서버 데이터 동기화

- **MCP Agent** (각 서버): http://localhost:3101
  - GET /health - 서버 헬스체크
  - GET /containers - 컨테이너 목록
  - GET /stats - 리소스 사용량
  - POST /deploy - 배포 실행

---

## 2. 페이지 구조 및 라우팅

```
/                           - 메인 대시보드
/projects                   - 프로젝트 목록
/projects/new               - 프로젝트 생성
/projects/[id]              - 프로젝트 상세
/projects/[id]/edit         - 프로젝트 편집
/servers                    - 서버 모니터링
/servers/[id]               - 서버 상세
/deployments                - 배포 이력
/deployments/[id]           - 배포 상세
/deployments/new            - 새 배포
/domains                    - 도메인 관리
/domains/new                - 도메인 추가
/env                        - 환경변수 관리
/env/[projectId]            - 프로젝트별 환경변수
/monitoring                 - 실시간 모니터링
/settings                   - 설정
/settings/api-keys          - API 키 관리
/settings/users             - 사용자 관리
/settings/notifications     - 알림 설정
```

---

## 3. 페이지별 상세 설계

### 3.1 메인 대시보드 (/)

**목표**: 전체 시스템 상태를 한눈에 파악

#### 레이아웃
```
+--------------------------------------------------+
| Header: Dashboard - Overview                     |
+--------------------------------------------------+
| [Stats Grid - 4개]                               |
| Total Projects | Active Domains | Containers | Deploys|
+--------------------------------------------------+
| [Recent Projects Table]      | [Server Health]  |
|                              |                  |
+--------------------------------------------------+
| [Recent Deployments]         | [Quick Actions]  |
+--------------------------------------------------+
```

#### 컴포넌트
- **StatsCard**: 4개 메트릭 카드
  - Total Projects (프로젝트 수)
  - Active Domains (활성 도메인)
  - Running Containers (실행 중 컨테이너)
  - Deployments Today (오늘 배포)

- **RecentProjectsTable**: 최근 프로젝트 4개
  - 프로젝트명, 타입, 환경, 상태, 도메인
  - 상태별 색상 배지

- **ServerHealthCard**: 4서버 통합 헬스
  - Disk, Memory, CPU 사용률 (프로그레스바)
  - 마지막 업데이트 시간

- **RecentDeploymentsTimeline**: 최근 배포 5개
  - 시간순 타임라인
  - 성공/실패 상태 표시

- **QuickActions**: 빠른 실행 버튼
  - New Project, Deploy, Add Domain

#### API 연동
```typescript
// Dashboard Data Hook
export function useDashboardData() {
  // SSOT Registry에서 통합 데이터 가져오기
  const { data: stats } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const [projects, servers, deployments] = await Promise.all([
        axios.get('http://localhost:3102/projects'),
        axios.get('http://localhost:3102/servers'),
        axios.get('http://localhost:3102/deployments/recent'),
      ]);

      return {
        totalProjects: projects.data.length,
        activeDomains: projects.data.filter(p => p.domain).length,
        runningContainers: servers.data.reduce((acc, s) =>
          acc + s.containers.filter(c => c.status === 'running').length, 0
        ),
        deploymentsToday: deployments.data.filter(d =>
          isToday(new Date(d.created_at))
        ).length,
      };
    },
    refetchInterval: 30000, // 30초마다 갱신
  });

  return stats;
}
```

---

### 3.2 프로젝트 관리 (/projects)

**목표**: 모든 프로젝트를 관리하고 새 프로젝트 생성

#### 레이아웃
```
+--------------------------------------------------+
| Header: Projects                    [+ New]      |
+--------------------------------------------------+
| [Search Bar] [Filter: Type] [Filter: Server]    |
+--------------------------------------------------+
| [Project Cards Grid - 반응형]                     |
| +-------------+ +-------------+ +-------------+  |
| | Project 1   | | Project 2   | | Project 3   |  |
| | Next.js     | | Node.js     | | Static      |  |
| | Running     | | Stopped     | | Deploying   |  |
| +-------------+ +-------------+ +-------------+  |
+--------------------------------------------------+
```

#### 컴포넌트
- **ProjectCard**: 프로젝트 카드
  ```tsx
  interface ProjectCardProps {
    name: string;
    type: 'nextjs' | 'nodejs' | 'python' | 'static';
    status: 'running' | 'stopped' | 'deploying' | 'failed';
    environment: 'production' | 'staging' | 'development';
    domain?: string;
    server: string;
    lastDeploy: Date;
    containerCount: number;
  }
  ```
  - 타입 아이콘 + 상태 배지
  - 도메인 링크 (있으면)
  - Quick Actions: View, Deploy, Settings, Delete

- **ProjectFilters**: 필터 바
  - Type (Next.js, Node.js, Python, Static)
  - Server (4개 서버)
  - Status (Running, Stopped, All)
  - Environment (Production, Staging, Development)

- **CreateProjectModal**: 프로젝트 생성 모달
  - Step 1: 기본 정보 (이름, 타입)
  - Step 2: Git 설정 (리포지토리 URL)
  - Step 3: 환경 변수
  - Step 4: 도메인 설정
  - Step 5: 서버 선택

#### API 연동
```typescript
// Projects List Hook
export function useProjects(filters?: ProjectFilters) {
  return useQuery({
    queryKey: ['projects', filters],
    queryFn: async () => {
      const { data } = await axios.get('http://localhost:3102/projects', {
        params: filters,
      });
      return data;
    },
  });
}

// Create Project Mutation
export function useCreateProject() {
  return useMutation({
    mutationFn: async (project: CreateProjectInput) => {
      const { data } = await axios.post('http://localhost:3102/projects', project);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
```

---

### 3.3 프로젝트 상세 (/projects/[id])

**목표**: 프로젝트의 모든 정보와 관리 기능 제공

#### 레이아�out
```
+--------------------------------------------------+
| Header: project-name                             |
| [Running] production | videopick.one-q.xyz       |
+--------------------------------------------------+
| [Tabs Navigation]                                |
| Overview | Containers | Env Vars | Deployments | Logs |
+--------------------------------------------------+
| Tab Content Area                                 |
+--------------------------------------------------+
```

#### 탭별 내용

**Overview 탭**
- Project Info Card
  - Name, Type, Repository URL
  - Created at, Last Deploy
  - Server location
- Deployment Info
  - Current version/commit
  - Build time
  - Auto-deploy status (on/off)
- Resource Usage
  - Container count
  - Memory usage
  - CPU usage
- Quick Actions
  - Deploy Now
  - Restart
  - View Logs
  - Stop/Start

**Containers 탭**
- Container List Table
  - Name, Image, Status, Uptime
  - Ports, Health
  - Actions: Logs, Restart, Stop

**Env Vars 탭**
- Environment Variables Manager
  - Add/Edit/Delete 변수
  - Secure 변수 (비밀번호 등)
  - 변수 적용 즉시/배포 시

**Deployments 탭**
- Deployment History
  - 시간순 배포 이력
  - Commit hash, Message
  - Deploy time, Duration
  - Status (success/failed)
  - Rollback button

**Logs 탭**
- Real-time Logs Viewer
  - Container 선택
  - 실시간 스트리밍
  - 로그 레벨 필터
  - 다운로드 버튼

---

### 3.4 서버 모니터링 (/servers)

**목표**: 4개 서버의 실시간 상태 모니터링

#### 레이아웃
```
+--------------------------------------------------+
| Header: Servers                                  |
+--------------------------------------------------+
| [4개 서버 카드 Grid]                              |
| +-----------+ +-----------+ +-----------+ +-----------+
| | Server 1  | | Server 2  | | Server 3  | | Server 4  |
| | Videopick | | Streaming | | Storage   | | Backup    |
| | App       | |           | |           | |           |
| | Online    | | Online    | | Online    | | Online    |
| | CPU: 45%  | | CPU: 32%  | | CPU: 12%  | | CPU: 8%   |
| | MEM: 62%  | | MEM: 48%  | | MEM: 78%  | | MEM: 23%  |
| | 12 cont.  | | 8 cont.   | | 4 cont.   | | 2 cont.   |
| +-----------+ +-----------+ +-----------+ +-----------+
+--------------------------------------------------+
| [통합 컨테이너 목록 테이블]                         |
+--------------------------------------------------+
```

#### 컴포넌트
- **ServerCard**: 서버 상태 카드
  ```tsx
  interface ServerCardProps {
    id: string;
    name: string;
    ip: string;
    status: 'online' | 'offline' | 'degraded';
    cpu: number;
    memory: number;
    disk: number;
    containerCount: number;
    uptime: number;
  }
  ```
  - 실시간 CPU/Memory/Disk 게이지
  - 컨테이너 수
  - Uptime 표시
  - Quick Actions: SSH, Restart, Settings

- **AllContainersTable**: 통합 컨테이너 목록
  - 서버별 필터
  - 상태별 필터
  - 컨테이너명, 이미지, 상태, 서버
  - Actions: Logs, Restart, Stop

#### API 연동
```typescript
// Servers with Real-time Stats
export function useServers() {
  return useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const { data } = await axios.get('http://localhost:3102/servers');

      // 각 서버의 실시간 stats 가져오기
      const serversWithStats = await Promise.all(
        data.map(async (server) => {
          try {
            const stats = await axios.get(`http://${server.ip}:3101/stats`);
            return { ...server, stats: stats.data };
          } catch {
            return { ...server, stats: null };
          }
        })
      );

      return serversWithStats;
    },
    refetchInterval: 10000, // 10초마다 갱신
  });
}
```

---

### 3.5 서버 상세 (/servers/[id])

**목표**: 특정 서버의 상세 정보 및 관리

#### 레이아웃
```
+--------------------------------------------------+
| Header: 158.247.203.55 - Videopick App           |
| [Online] Uptime: 45d 12h 34m                     |
+--------------------------------------------------+
| [Tabs Navigation]                                |
| Overview | Containers | Projects | Resources | System |
+--------------------------------------------------+
| Tab Content Area                                 |
+--------------------------------------------------+
```

#### 탭별 내용

**Overview 탭**
- Server Info
  - IP, Location, Provider (Vultr)
  - Uptime, Load Average
- Resource Usage (실시간 차트)
  - CPU Usage (시계열 그래프)
  - Memory Usage (시계열 그래프)
  - Disk I/O (시계열 그래프)
  - Network Traffic (시계열 그래프)
- Quick Stats
  - Total Projects: 12
  - Running Containers: 24
  - Total Deployments: 156

**Containers 탭**
- Container List (상세)
  - Name, Image, Status, Created
  - CPU/Memory 사용량
  - Ports, Networks
  - Actions: Logs, Shell, Restart, Stop

**Projects 탭**
- 이 서버에 배포된 프로젝트 목록
- 프로젝트별 리소스 사용량

**Resources 탭**
- Detailed Resource Metrics
  - CPU: Core별 사용률
  - Memory: Used/Free/Cached
  - Disk: Partition별 사용량
  - Network: Interface별 트래픽

**System 탭**
- System Information
  - OS, Kernel Version
  - Podman Version
  - Caddy Version
  - Installed Packages
- System Logs
  - journalctl 최근 로그

---

### 3.6 배포 이력 (/deployments)

**목표**: 모든 배포 이력 조회 및 롤백

#### 레이아웃
```
+--------------------------------------------------+
| Header: Deployments                 [+ New]      |
+--------------------------------------------------+
| [Filter: Project] [Filter: Status] [Filter: Date]|
+--------------------------------------------------+
| [Deployments Timeline]                           |
| +----------------------------------------------+ |
| | Today                                        | |
| | 10:30 - videopick-web deployed to production | |
| |         ✓ Success (2m 34s)                   | |
| | 09:15 - api-gateway deployed to staging      | |
| |         ✗ Failed (Build error)               | |
| +----------------------------------------------+ |
| | Yesterday                                    | |
| | ...                                          | |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

#### 컴포넌트
- **DeploymentTimeline**: 시간순 타임라인
  - 날짜별 그룹핑
  - 프로젝트명, 환경, 시간
  - 상태 (Success/Failed/In Progress)
  - Duration
  - Commit hash + message

- **DeploymentCard**: 배포 카드
  ```tsx
  interface DeploymentCardProps {
    id: string;
    project: string;
    environment: string;
    status: 'success' | 'failed' | 'in_progress' | 'cancelled';
    triggeredBy: string;
    triggeredAt: Date;
    duration: number;
    commit: {
      hash: string;
      message: string;
      author: string;
    };
    logs?: string;
  }
  ```
  - Quick Actions: View Logs, Rollback (성공한 경우)

- **DeploymentFilters**: 필터링
  - Project
  - Status (All, Success, Failed)
  - Date Range
  - Triggered By (User, GitHub Actions, Auto)

#### API 연동
```typescript
// Deployments List
export function useDeployments(filters?: DeploymentFilters) {
  return useQuery({
    queryKey: ['deployments', filters],
    queryFn: async () => {
      const { data } = await axios.get('http://localhost:3102/deployments', {
        params: filters,
      });
      return data;
    },
  });
}

// Rollback Mutation
export function useRollback() {
  return useMutation({
    mutationFn: async ({ projectId, deploymentId }: RollbackInput) => {
      const { data } = await axios.post(
        `http://localhost:3102/projects/${projectId}/rollback`,
        { deploymentId }
      );
      return data;
    },
  });
}
```

---

### 3.7 배포 상세 (/deployments/[id])

**목표**: 배포의 모든 세부사항 확인

#### 레이아웃
```
+--------------------------------------------------+
| Header: Deployment #1234                         |
| [Success] videopick-web → production             |
+--------------------------------------------------+
| [Deployment Info Card]                           |
| Project: videopick-web                           |
| Environment: production                          |
| Triggered by: GitHub Actions                     |
| Triggered at: 2025-12-19 10:30:45               |
| Duration: 2m 34s                                 |
| Commit: abc1234 - "Fix login bug"               |
+--------------------------------------------------+
| [Build Logs - Real-time Stream]                 |
| > Building image...                              |
| > Step 1/5 : FROM node:20-alpine                |
| > ...                                            |
| > Successfully deployed!                         |
+--------------------------------------------------+
| [Actions]                                        |
| [Rollback] [Re-deploy] [Download Logs]          |
+--------------------------------------------------+
```

#### 컴포넌트
- **DeploymentInfoCard**: 배포 정보
- **BuildLogsViewer**: 빌드 로그 뷰어
  - 실시간 스트리밍 (진행 중인 경우)
  - 색상 구분 (Success/Error/Warning)
  - 검색 기능
  - 다운로드 버튼

---

### 3.8 도메인 관리 (/domains)

**목표**: 도메인 및 SSL 인증서 관리

#### 레이아웃
```
+--------------------------------------------------+
| Header: Domains                     [+ Add]      |
+--------------------------------------------------+
| [Domains Table]                                  |
| Domain                | Project      | SSL | Actions|
| videopick.one-q.xyz  | videopick-web| ✓   | [...]  |
| api.one-q.xyz        | api-gateway  | ✓   | [...]  |
| staging.one-q.xyz    | videopick-web| ⏳  | [...]  |
+--------------------------------------------------+
```

#### 컴포넌트
- **DomainsTable**: 도메인 목록 테이블
  - Domain name
  - Linked Project
  - SSL Status (Active, Pending, Expired)
  - SSL Expiry Date
  - Auto-renew toggle
  - Actions: Edit, Renew SSL, Delete

- **AddDomainModal**: 도메인 추가 모달
  - Domain name input
  - Project selection
  - SSL option (Auto Let's Encrypt)
  - DNS verification

- **SSLStatusBadge**: SSL 상태 배지
  - Active (초록)
  - Pending (노랑)
  - Expired (빨강)
  - None (회색)

#### API 연동
```typescript
// Domains List
export function useDomains() {
  return useQuery({
    queryKey: ['domains'],
    queryFn: async () => {
      const { data } = await axios.get('http://localhost:3102/domains');
      return data;
    },
  });
}

// Add Domain
export function useAddDomain() {
  return useMutation({
    mutationFn: async (domain: AddDomainInput) => {
      const { data } = await axios.post('http://localhost:3102/domains', domain);
      return data;
    },
  });
}

// Renew SSL
export function useRenewSSL() {
  return useMutation({
    mutationFn: async (domainId: string) => {
      const { data } = await axios.post(
        `http://localhost:3102/domains/${domainId}/renew-ssl`
      );
      return data;
    },
  });
}
```

---

### 3.9 환경변수 관리 (/env)

**목표**: 프로젝트별 환경변수 안전하게 관리

#### 레이아웃
```
+--------------------------------------------------+
| Header: Environment Variables                    |
+--------------------------------------------------+
| [Project Selector]                               |
| Select Project: [videopick-web ▼]                |
+--------------------------------------------------+
| [Environment Tabs]                               |
| [Production] [Staging] [Development]             |
+--------------------------------------------------+
| [Variables Table]                                |
| Key              | Value      | Secure | Actions |
| DATABASE_URL     | postgres://| ✓      | [Edit]  |
| NEXT_PUBLIC_API  | https://   |        | [Edit]  |
| SECRET_KEY       | ********   | ✓      | [Edit]  |
+--------------------------------------------------+
| [+ Add Variable]                                 |
+--------------------------------------------------+
```

#### 컴포넌트
- **ProjectSelector**: 프로젝트 선택 드롭다운
- **EnvironmentTabs**: 환경별 탭
- **VariablesTable**: 환경변수 테이블
  - Key/Value 표시
  - Secure flag (비밀 변수는 마스킹)
  - Actions: Edit, Delete
- **AddVariableModal**: 변수 추가 모달
  - Key input
  - Value input (Secure 변수는 password type)
  - Secure checkbox
  - Apply to environments (multi-select)

#### API 연동
```typescript
// Environment Variables
export function useEnvVars(projectId: string, environment: string) {
  return useQuery({
    queryKey: ['env', projectId, environment],
    queryFn: async () => {
      const { data } = await axios.get(
        `http://localhost:3102/projects/${projectId}/env/${environment}`
      );
      return data;
    },
  });
}

// Update Env Var
export function useUpdateEnvVar() {
  return useMutation({
    mutationFn: async ({
      projectId,
      environment,
      key,
      value,
      secure
    }: UpdateEnvVarInput) => {
      const { data } = await axios.put(
        `http://localhost:3102/projects/${projectId}/env/${environment}/${key}`,
        { value, secure }
      );
      return data;
    },
  });
}
```

---

### 3.10 실시간 모니터링 (/monitoring)

**목표**: 전체 시스템 실시간 모니터링 대시보드

#### 레이아웃
```
+--------------------------------------------------+
| Header: Real-time Monitoring                     |
+--------------------------------------------------+
| [4 Server Resource Charts - Live]                |
| +-------------+ +-------------+ +-------------+  |
| | Server 1    | | Server 2    | | Server 3    |  |
| | CPU Chart   | | CPU Chart   | | CPU Chart   |  |
| | MEM Chart   | | MEM Chart   | | MEM Chart   |  |
| +-------------+ +-------------+ +-------------+  |
+--------------------------------------------------+
| [Active Alerts]                                  |
| ⚠️ High CPU usage on Server 1 (85%)             |
| 🔴 Container 'api-gateway' failed healthcheck   |
+--------------------------------------------------+
| [Recent Events Log]                              |
| 10:45 - Container started: videopick-web        |
| 10:30 - Deployment completed: api-gateway       |
+--------------------------------------------------+
```

#### 컴포넌트
- **LiveResourceChart**: 실시간 리소스 차트
  - CPU, Memory, Disk 시계열 차트
  - 최근 1시간 데이터
  - WebSocket으로 실시간 업데이트

- **AlertsList**: 활성 알림 목록
  - Critical, Warning, Info 레벨
  - 자동 해제 조건
  - Acknowledge 버튼

- **EventsLog**: 최근 이벤트 로그
  - Container lifecycle events
  - Deployment events
  - System events

#### API 연동
```typescript
// Real-time Metrics (WebSocket)
export function useRealtimeMetrics() {
  const [metrics, setMetrics] = useState<MetricsData[]>([]);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3102/metrics/stream');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMetrics(prev => [...prev.slice(-60), data]); // 최근 60개
    };

    return () => ws.close();
  }, []);

  return metrics;
}
```

---

### 3.11 설정 (/settings)

**목표**: 시스템 설정 및 사용자 관리

#### 레이아웃
```
+--------------------------------------------------+
| Header: Settings                                 |
+--------------------------------------------------+
| [Settings Navigation - Tabs]                     |
| General | API Keys | Users | Notifications | System |
+--------------------------------------------------+
| Tab Content Area                                 |
+--------------------------------------------------+
```

#### 탭별 내용

**General 탭**
- Dashboard Settings
  - Default refresh interval
  - Time zone
  - Date format
- Deployment Settings
  - Auto-deploy on git push (toggle)
  - Build timeout (minutes)
  - Max concurrent deployments
- Domain Settings
  - Default domain suffix
  - Auto SSL (toggle)

**API Keys 탭**
- API Keys Management
  - List of API keys
  - Create new key
  - Revoke key
  - Permissions (read-only, read-write, admin)
- Webhook URLs
  - Deployment webhook
  - Monitoring webhook

**Users 탭**
- User Management
  - User list (name, email, role)
  - Add new user
  - Edit permissions
  - Deactivate user
- Roles
  - Admin (full access)
  - Developer (deploy only)
  - Viewer (read-only)

**Notifications 탭**
- Email Notifications
  - Deployment success/failure
  - Server alerts
  - SSL expiry warnings
- Slack Integration
  - Webhook URL
  - Channel selection
  - Event types
- Discord Integration
  - Webhook URL
  - Event types

**System 탭**
- System Information
  - CodeB version
  - Node.js version
  - Database info
- Maintenance Mode
  - Enable/Disable toggle
  - Maintenance message
- Backup Settings
  - Auto backup schedule
  - Backup retention

---

## 4. 공통 컴포넌트 라이브러리

### 4.1 Layout Components

```typescript
// Header Component
interface HeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function Header({ title, description, actions }: HeaderProps) {
  return (
    <div className="border-b border-gray-200 bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// PageContainer Component
export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      {children}
    </div>
  );
}

// ContentArea Component
export function ContentArea({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {children}
    </div>
  );
}
```

### 4.2 Data Display Components

```typescript
// Table Component
interface TableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
}

export function Table<T>({ columns, data, onRowClick }: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
            {columns.map(col => (
              <th key={col.key} className="px-6 py-3 font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={idx}
              onClick={() => onRowClick?.(row)}
              className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
            >
              {columns.map(col => (
                <td key={col.key} className="px-6 py-4">
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Stats Card Component
interface StatsCardProps {
  name: string;
  value: string | number;
  icon: LucideIcon;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export function StatsCard({ name, value, icon: Icon, change, trend }: StatsCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{name}</p>
            <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
            {change && (
              <p className={cn(
                "mt-1 text-xs",
                trend === 'up' && "text-green-600",
                trend === 'down' && "text-red-600",
                trend === 'neutral' && "text-gray-500"
              )}>
                {change}
              </p>
            )}
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">
            <Icon className="h-6 w-6 text-blue-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Progress Bar Component
interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red';
  showPercentage?: boolean;
}

export function ProgressBar({
  value,
  max,
  label,
  color = 'blue',
  showPercentage = true
}: ProgressBarProps) {
  const percentage = Math.round((value / max) * 100);

  const colorClasses = {
    blue: 'bg-blue-600',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };

  return (
    <div>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between text-sm mb-2">
          {label && <span className="text-gray-600">{label}</span>}
          {showPercentage && (
            <span className="font-medium">{percentage}%</span>
          )}
        </div>
      )}
      <div className="h-2 rounded-full bg-gray-200">
        <div
          className={cn("h-full rounded-full transition-all", colorClasses[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
```

### 4.3 Form Components

```typescript
// Input Component
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export function Input({ label, error, helper, className, ...props }: InputProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        className={cn(
          "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm",
          "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
          error && "border-red-500",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {helper && !error && <p className="text-xs text-gray-500">{helper}</p>}
    </div>
  );
}

// Select Component
interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
}

export function Select({ label, options, value, onChange, error }: SelectProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm",
          "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
          error && "border-red-500"
        )}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// Toggle Component
interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
}

export function Toggle({ enabled, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        enabled ? "bg-blue-600" : "bg-gray-200"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          enabled ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}
```

### 4.4 Feedback Components

```typescript
// Alert Component
interface AlertProps {
  variant: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  onClose?: () => void;
}

export function Alert({ variant, title, message, onClose }: AlertProps) {
  const styles = {
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-900',
      icon: Info,
    },
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-900',
      icon: CheckCircle,
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-900',
      icon: AlertTriangle,
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-900',
      icon: XCircle,
    },
  };

  const style = styles[variant];
  const Icon = style.icon;

  return (
    <div className={cn(
      "rounded-lg border p-4",
      style.bg,
      style.border
    )}>
      <div className="flex gap-3">
        <Icon className={cn("h-5 w-5 flex-shrink-0", style.text)} />
        <div className="flex-1">
          {title && (
            <h4 className={cn("font-medium", style.text)}>{title}</h4>
          )}
          <p className={cn("text-sm", style.text, title && "mt-1")}>
            {message}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className={cn("flex-shrink-0", style.text)}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// Loading Spinner Component
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className="flex items-center justify-center">
      <div className={cn(
        "animate-spin rounded-full border-2 border-gray-300 border-t-blue-600",
        sizes[size]
      )} />
    </div>
  );
}

// Empty State Component
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <Icon className="h-6 w-6 text-gray-400" />
        </div>
      )}
      <h3 className="text-lg font-medium text-gray-900">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
}
```

### 4.5 Modal Component

```typescript
// Modal Component
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md'
}: ModalProps) {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className={cn(
          "relative w-full transform rounded-xl bg-white shadow-xl transition-all",
          sizes[size]
        )}>
          {/* Header */}
          {(title || description) && (
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-start justify-between">
                <div>
                  {title && (
                    <h2 className="text-lg font-semibold text-gray-900">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="mt-1 text-sm text-gray-500">
                      {description}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="px-6 py-4">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="border-t border-gray-200 px-6 py-4">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 5. 반응형 디자인 전략

### 5.1 Breakpoints

```css
/* Tailwind CSS 기본 breakpoints 사용 */
sm: 640px   /* 모바일 landscape */
md: 768px   /* 태블릿 */
lg: 1024px  /* 노트북 */
xl: 1280px  /* 데스크톱 */
2xl: 1536px /* 대형 데스크톱 */
```

### 5.2 모바일 최적화

```typescript
// 모바일에서 테이블을 카드로 변환
export function ResponsiveTable({ data }: { data: any[] }) {
  return (
    <>
      {/* Desktop: Table */}
      <div className="hidden md:block">
        <Table data={data} />
      </div>

      {/* Mobile: Cards */}
      <div className="grid gap-4 md:hidden">
        {data.map(item => (
          <Card key={item.id}>
            <CardContent className="p-4">
              {/* Card content */}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

// 모바일에서 사이드바를 하단 네비게이션으로
export function MobileNav() {
  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white md:hidden">
      <nav className="flex justify-around py-2">
        {navigation.slice(0, 4).map(item => (
          <Link key={item.name} href={item.href}>
            <div className="flex flex-col items-center gap-1 px-3 py-2">
              <item.icon className="h-5 w-5" />
              <span className="text-xs">{item.name}</span>
            </div>
          </Link>
        ))}
      </nav>
    </div>
  );
}
```

### 5.3 터치 최적화

```typescript
// 터치 타겟 최소 44px
const touchTargetClass = "min-h-[44px] min-w-[44px]";

// 스와이프 제스처 지원
export function useSwipeGesture(onSwipe: (direction: 'left' | 'right') => void) {
  const [touchStart, setTouchStart] = useState(0);

  return {
    onTouchStart: (e: TouchEvent) => {
      setTouchStart(e.touches[0].clientX);
    },
    onTouchEnd: (e: TouchEvent) => {
      const touchEnd = e.changedTouches[0].clientX;
      const diff = touchStart - touchEnd;

      if (Math.abs(diff) > 50) {
        onSwipe(diff > 0 ? 'left' : 'right');
      }
    },
  };
}
```

---

## 6. 성능 최적화

### 6.1 코드 스플리팅

```typescript
// 라우트별 lazy loading
const ProjectsPage = lazy(() => import('./pages/projects'));
const ServersPage = lazy(() => import('./pages/servers'));
const DeploymentsPage = lazy(() => import('./pages/deployments'));

// 큰 컴포넌트 lazy loading
const LogsViewer = lazy(() => import('./components/logs-viewer'));
const ChartComponent = lazy(() => import('./components/charts'));
```

### 6.2 데이터 캐싱

```typescript
// React Query 설정
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30초
      cacheTime: 5 * 60 * 1000, // 5분
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Prefetching
export function usePrefetchProjectDetails() {
  const queryClient = useQueryClient();

  return (projectId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['project', projectId],
      queryFn: () => fetchProject(projectId),
    });
  };
}
```

### 6.3 이미지 최적화

```typescript
// Next.js Image 컴포넌트 사용
import Image from 'next/image';

export function ProjectLogo({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt="Project logo"
      width={40}
      height={40}
      className="rounded-lg"
      loading="lazy"
    />
  );
}
```

### 6.4 Virtual Scrolling

```typescript
// 큰 리스트에 가상 스크롤링 적용
import { useVirtualizer } from '@tanstack/react-virtual';

export function VirtualList({ items }: { items: any[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {/* Row content */}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 7. 실시간 기능

### 7.1 WebSocket 연결

```typescript
// WebSocket Hook
export function useWebSocket(url: string) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  useEffect(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => setStatus('connected');
    ws.onclose = () => setStatus('disconnected');
    ws.onmessage = (event) => setData(JSON.parse(event.data));

    return () => ws.close();
  }, [url]);

  return { data, status };
}

// 사용 예시
export function RealtimeLogs({ projectId }: { projectId: string }) {
  const { data: logs } = useWebSocket(`ws://localhost:3101/logs/${projectId}`);

  return (
    <div className="space-y-1">
      {logs?.map((log, idx) => (
        <div key={idx} className="font-mono text-xs">
          {log}
        </div>
      ))}
    </div>
  );
}
```

### 7.2 Server-Sent Events (SSE)

```typescript
// SSE Hook for deployment progress
export function useDeploymentProgress(deploymentId: string) {
  const [progress, setProgress] = useState<DeploymentProgress | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(
      `http://localhost:3102/deployments/${deploymentId}/stream`
    );

    eventSource.onmessage = (event) => {
      setProgress(JSON.parse(event.data));
    };

    return () => eventSource.close();
  }, [deploymentId]);

  return progress;
}
```

### 7.3 Polling

```typescript
// Polling with React Query
export function useServerStats(serverId: string) {
  return useQuery({
    queryKey: ['server-stats', serverId],
    queryFn: async () => {
      const { data } = await axios.get(`http://localhost:3101/stats`);
      return data;
    },
    refetchInterval: 5000, // 5초마다 폴링
    enabled: !!serverId,
  });
}
```

---

## 8. 에러 처리

### 8.1 Error Boundary

```typescript
// Global Error Boundary
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Something went wrong</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                {this.state.error?.message}
              </p>
              <Button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="mt-4"
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 8.2 API 에러 처리

```typescript
// Axios interceptor
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login
      window.location.href = '/login';
    } else if (error.response?.status === 500) {
      // Show error toast
      toast.error('Server error. Please try again later.');
    }
    return Promise.reject(error);
  }
);

// React Query error handler
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      onError: (error: any) => {
        if (error.response?.status !== 401) {
          toast.error(error.response?.data?.message || 'An error occurred');
        }
      },
    },
  },
});
```

---

## 9. 접근성 (Accessibility)

### 9.1 키보드 네비게이션

```typescript
// Focus management
export function useFocusTrap(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    element.addEventListener('keydown', handleTab);
    return () => element.removeEventListener('keydown', handleTab);
  }, [ref]);
}
```

### 9.2 ARIA 속성

```typescript
// Accessible button
export function AccessibleButton({
  children,
  onClick,
  loading,
  ...props
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      aria-busy={loading}
      aria-label={loading ? 'Loading...' : undefined}
      {...props}
    >
      {loading ? <LoadingSpinner /> : children}
    </button>
  );
}

// Accessible modal
export function AccessibleModal({ isOpen, onClose, title, children }: ModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-hidden={!isOpen}
    >
      <h2 id="modal-title">{title}</h2>
      {children}
    </div>
  );
}
```

---

## 10. 테스팅 전략

### 10.1 Unit Tests (Jest + React Testing Library)

```typescript
// Component test example
describe('StatusBadge', () => {
  it('renders running status correctly', () => {
    const { getByText } = render(<StatusBadge status="running" />);
    expect(getByText('Running')).toBeInTheDocument();
  });

  it('shows dot indicator', () => {
    const { container } = render(<StatusBadge status="running" showDot />);
    expect(container.querySelector('.bg-green-500')).toBeInTheDocument();
  });
});

// Hook test example
describe('useDashboardData', () => {
  it('fetches dashboard stats', async () => {
    const { result, waitFor } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveProperty('totalProjects');
    expect(result.current.data).toHaveProperty('activeDomains');
  });
});
```

### 10.2 Integration Tests

```typescript
// Page integration test
describe('Projects Page', () => {
  it('displays projects list', async () => {
    const { getByText, getAllByRole } = render(<ProjectsPage />);

    await waitFor(() => {
      expect(getByText('Projects')).toBeInTheDocument();
    });

    const projectCards = getAllByRole('article');
    expect(projectCards.length).toBeGreaterThan(0);
  });

  it('filters projects by type', async () => {
    const { getByLabelText, getAllByRole } = render(<ProjectsPage />);

    const filter = getByLabelText('Filter by type');
    fireEvent.change(filter, { target: { value: 'nextjs' } });

    await waitFor(() => {
      const projects = getAllByRole('article');
      projects.forEach(project => {
        expect(project).toHaveTextContent('Next.js');
      });
    });
  });
});
```

### 10.3 E2E Tests (Playwright)

```typescript
// E2E test example
test('deploy new project', async ({ page }) => {
  await page.goto('http://localhost:3000/projects');

  // Click new project button
  await page.click('text=New Project');

  // Fill form
  await page.fill('input[name="name"]', 'test-project');
  await page.selectOption('select[name="type"]', 'nextjs');
  await page.fill('input[name="repository"]', 'https://github.com/user/repo');

  // Submit
  await page.click('button[type="submit"]');

  // Wait for success message
  await page.waitForSelector('text=Project created successfully');

  // Verify project appears in list
  await expect(page.locator('text=test-project')).toBeVisible();
});
```

---

## 11. 성능 메트릭

### 11.1 Core Web Vitals 목표

```typescript
const performanceTargets = {
  // Largest Contentful Paint
  LCP: {
    good: '< 2.5s',
    needsImprovement: '2.5s - 4.0s',
    poor: '> 4.0s',
  },

  // First Input Delay
  FID: {
    good: '< 100ms',
    needsImprovement: '100ms - 300ms',
    poor: '> 300ms',
  },

  // Cumulative Layout Shift
  CLS: {
    good: '< 0.1',
    needsImprovement: '0.1 - 0.25',
    poor: '> 0.25',
  },

  // First Contentful Paint
  FCP: {
    good: '< 1.8s',
    needsImprovement: '1.8s - 3.0s',
    poor: '> 3.0s',
  },

  // Time to Interactive
  TTI: {
    good: '< 3.8s',
    needsImprovement: '3.8s - 7.3s',
    poor: '> 7.3s',
  },
};
```

### 11.2 번들 사이즈 목표

```typescript
const bundleSizeTargets = {
  // 초기 로드
  initialBundle: '< 200KB (gzipped)',

  // 페이지별
  perRoute: '< 50KB (gzipped)',

  // 전체 앱
  totalApp: '< 1MB (gzipped)',

  // 컴포넌트 라이브러리
  components: '< 100KB (gzipped)',
};
```

---

## 12. 배포 및 빌드

### 12.1 프로덕션 빌드

```bash
# 프로덕션 빌드
npm run build

# 빌드 분석
npm run build -- --analyze

# 프로덕션 서버 실행
npm run start
```

### 12.2 환경변수

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3102
NEXT_PUBLIC_WS_URL=ws://localhost:3102
NEXT_PUBLIC_MCP_URL=http://localhost:3101

# Production
NEXT_PUBLIC_API_URL=https://api.codeb.dev
NEXT_PUBLIC_WS_URL=wss://api.codeb.dev
```

### 12.3 Docker 배포

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]
```

---

## 13. 향후 개선 계획

### Phase 1: 핵심 기능 (현재)
- ✅ 대시보드
- ✅ 프로젝트 관리
- ✅ 서버 모니터링
- 🚧 배포 이력
- 🚧 도메인 관리

### Phase 2: 고급 기능
- 📋 실시간 로그 스트리밍
- 📋 고급 필터링 및 검색
- 📋 커스텀 대시보드
- 📋 알림 시스템

### Phase 3: 엔터프라이즈 기능
- 📋 멀티 테넌시
- 📋 RBAC (Role-Based Access Control)
- 📋 Audit Logs
- 📋 API Rate Limiting

### Phase 4: AI/ML 기능
- 📋 자동 리소스 스케일링 추천
- 📋 이상 탐지 (Anomaly Detection)
- 📋 성능 최적화 제안
- 📋 비용 최적화 분석

---

## 14. 개발 가이드라인

### 14.1 코드 스타일

```typescript
// ✅ Good
export function ProjectCard({ project }: ProjectCardProps) {
  const { mutate: deploy, isLoading } = useDeployProject();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{project.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <StatusBadge status={project.status} />
      </CardContent>
    </Card>
  );
}

// ❌ Bad
export function projectCard(props: any) {
  return <div className="card">
    <div className="card-header">
      <h3>{props.project.name}</h3>
    </div>
  </div>;
}
```

### 14.2 파일 구조

```
src/
├── app/                    # Next.js App Router pages
│   ├── (dashboard)/       # Dashboard layout group
│   │   ├── page.tsx       # Dashboard home
│   │   ├── projects/      # Projects section
│   │   ├── servers/       # Servers section
│   │   └── ...
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── components/            # Reusable components
│   ├── layout/           # Layout components
│   ├── ui/               # UI primitives
│   └── features/         # Feature-specific components
├── lib/                  # Utilities and helpers
│   ├── api/             # API client
│   ├── hooks/           # Custom hooks
│   └── utils.ts         # Utility functions
└── types/               # TypeScript types
```

### 14.3 커밋 컨벤션

```bash
# feat: 새로운 기능
git commit -m "feat: add project creation modal"

# fix: 버그 수정
git commit -m "fix: correct deployment status badge color"

# refactor: 리팩토링
git commit -m "refactor: extract server card component"

# style: 스타일 변경
git commit -m "style: improve mobile responsiveness"

# docs: 문서화
git commit -m "docs: update API integration guide"

# test: 테스트
git commit -m "test: add project card component tests"

# chore: 기타 변경
git commit -m "chore: update dependencies"
```

---

## 결론

이 설계서는 CodeB Dashboard를 완성도 100%로 만들기 위한 완전한 가이드입니다.

### 핵심 원칙
1. **모바일 우선**: 모든 페이지는 모바일에서 먼저 완벽하게 작동해야 합니다
2. **성능**: Core Web Vitals 목표를 달성해야 합니다
3. **사용자 경험**: 직관적이고 일관된 UX를 제공해야 합니다
4. **확장성**: 새로운 기능 추가가 쉬워야 합니다
5. **안정성**: 에러 처리와 로딩 상태 관리가 철저해야 합니다

### 다음 단계
1. 각 페이지별 컴포넌트 구현
2. API 연동 및 실시간 기능 추가
3. 테스트 작성
4. 성능 최적화
5. 프로덕션 배포

**"한 번의 설계로 모든 화면에서 완벽하게"** 🚀
