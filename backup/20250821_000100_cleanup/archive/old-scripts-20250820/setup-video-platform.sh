#!/bin/bash

# Video Platform Setup Script
PROJECT_NAME="video-platform"
SERVER_IP="141.164.60.51"
API_URL="http://${SERVER_IP}:3008/api"

echo "🚀 Setting up ${PROJECT_NAME} project..."

# Create setup commands file
cat > /tmp/setup-commands.sh << 'EOF'
#!/bin/bash
PROJECT_NAME="video-platform"
APP_CONTAINER="${PROJECT_NAME}-app"

echo "📦 Installing dependencies..."
podman exec $APP_CONTAINER sh -c "cd /app && npm install"

echo "🔍 Checking for Prisma..."
if podman exec $APP_CONTAINER sh -c "test -f /app/prisma/schema.prisma"; then
    echo "✅ Prisma schema found!"
    
    echo "🗄️ Setting up database..."
    # Generate Prisma client
    podman exec $APP_CONTAINER sh -c "cd /app && npx prisma generate"
    
    # Push schema to database
    podman exec $APP_CONTAINER sh -c "cd /app && npx prisma db push --skip-generate"
    
    # Run migrations if they exist
    podman exec $APP_CONTAINER sh -c "cd /app && npx prisma migrate deploy || true"
else
    echo "⚠️ No Prisma schema found"
fi

echo "🏗️ Building the application..."
podman exec $APP_CONTAINER sh -c "cd /app && npm run build || npm run dev"

echo "🔄 Restarting application..."
podman restart $APP_CONTAINER

echo "✅ Setup complete!"
EOF

echo "📤 Sending setup script to server..."
# Try to execute remotely via SSH (this might fail due to connection issues)
ssh -o ConnectTimeout=5 root@${SERVER_IP} 'bash -s' < /tmp/setup-commands.sh 2>/dev/null

if [ $? -ne 0 ]; then
    echo "⚠️ SSH connection failed. Trying alternative method..."
    
    # Alternative: Create a setup job via API
    echo "📝 Creating setup job..."
    
    # Since we can't SSH, let's create a manual instruction file
    cat > setup-instructions.md << EOF
# Manual Setup Instructions for video-platform

Since SSH access is not available, please run these commands on the server:

## 1. Connect to the server
\`\`\`bash
ssh root@141.164.60.51
\`\`\`

## 2. Install dependencies
\`\`\`bash
podman exec video-platform-app sh -c "cd /app && npm install"
\`\`\`

## 3. Setup Prisma (if schema exists)
\`\`\`bash
# Check if Prisma schema exists
podman exec video-platform-app sh -c "ls -la /app/prisma/"

# If schema.prisma exists, run:
podman exec video-platform-app sh -c "cd /app && npx prisma generate"
podman exec video-platform-app sh -c "cd /app && npx prisma db push"
\`\`\`

## 4. Build the application
\`\`\`bash
podman exec video-platform-app sh -c "cd /app && npm run build"
\`\`\`

## 5. Start the application
\`\`\`bash
podman exec video-platform-app sh -c "cd /app && npm run start"
\`\`\`

## 6. Check logs
\`\`\`bash
podman logs -f video-platform-app
\`\`\`

## Alternative: Access via Podman
\`\`\`bash
# Enter the container directly
podman exec -it video-platform-app sh

# Then run inside container:
cd /app
npm install
npx prisma generate
npx prisma db push
npm run build
npm run start
\`\`\`
EOF
    
    echo "📋 Setup instructions saved to setup-instructions.md"
    echo "Please follow the manual instructions to complete setup."
fi

echo "🌐 Access URLs:"
echo "  Direct: http://${SERVER_IP}:4002"
echo "  Domain: https://${PROJECT_NAME}.codeb.one-q.xyz (DNS setup required)"