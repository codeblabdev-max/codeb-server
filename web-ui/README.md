# CodeB Dashboard

> Beautiful web dashboard for managing your deployment infrastructure across 4 Vultr servers

![Next.js](https://img.shields.io/badge/Next.js-16.0.10-black?logo=next.js)
![React](https://img.shields.io/badge/React-19.2.1-61DAFB?logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-38B2AC?logo=tailwind-css)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)

## Features

### 8 Complete Pages

1. **Dashboard (/)** - Overview of servers, projects, and deployments
2. **Projects (/projects)** - Manage and deploy projects
3. **Servers (/servers)** - Monitor 4 servers with real-time metrics
4. **Deployments (/deployments)** - View deployment history
5. **Domains (/domains)** - Manage domains and SSL certificates
6. **Environment Variables (/env)** - Secure env management
7. **Real-time Monitoring (/monitoring)** - Live metrics
8. **Settings (/settings)** - Configure API keys, users, notifications

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Visit http://localhost:3000

## Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | Next.js | 16.0.10 |
| UI Library | React | 19.2.1 |
| Styling | Tailwind CSS | v4 |
| State | @tanstack/react-query | 5.90.12 |
| HTTP | axios | 1.13.2 |
| Icons | lucide-react | 0.561.0 |

## API Integration

- **SSOT Registry**: http://localhost:3102
- **MCP Agent**: http://localhost:3101 (each server)

## Documentation

- [Frontend UI Design](../docs/frontend-ui.md) - Complete design documentation
- [Quick Start Guide](../docs/QUICK_START.md) - Getting started guide
- [Dashboard Complete](../docs/DASHBOARD_COMPLETE.md) - Full completion report

---

**Built with ❤️ by CodeB Team**
