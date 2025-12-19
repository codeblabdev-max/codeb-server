# Manual Setup Instructions for video-platform

Since SSH access is not available, please run these commands on the server:

## 1. Connect to the server
```bash
ssh root@141.164.60.51
```

## 2. Install dependencies
```bash
podman exec video-platform-app sh -c "cd /app && npm install"
```

## 3. Setup Prisma (if schema exists)
```bash
# Check if Prisma schema exists
podman exec video-platform-app sh -c "ls -la /app/prisma/"

# If schema.prisma exists, run:
podman exec video-platform-app sh -c "cd /app && npx prisma generate"
podman exec video-platform-app sh -c "cd /app && npx prisma db push"
```

## 4. Build the application
```bash
podman exec video-platform-app sh -c "cd /app && npm run build"
```

## 5. Start the application
```bash
podman exec video-platform-app sh -c "cd /app && npm run start"
```

## 6. Check logs
```bash
podman logs -f video-platform-app
```

## Alternative: Access via Podman
```bash
# Enter the container directly
podman exec -it video-platform-app sh

# Then run inside container:
cd /app
npm install
npx prisma generate
npx prisma db push
npm run build
npm run start
```
