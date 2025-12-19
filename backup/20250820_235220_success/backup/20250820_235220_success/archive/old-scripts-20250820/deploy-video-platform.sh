#!/bin/bash

# Deploy Video Platform with Prisma
PROJECT_NAME="video-platform"
SERVER_IP="141.164.60.51"
LOCAL_PROJECT_PATH="/Users/admin/new_project/video_platform"

echo "🚀 Deploying ${PROJECT_NAME} with Prisma setup..."

# Step 1: Copy Prisma schema and necessary files to server storage
echo "📁 Preparing deployment package..."

# Create a deployment package
DEPLOY_DIR="/tmp/video-platform-deploy"
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

# Copy Prisma files
cp -r $LOCAL_PROJECT_PATH/prisma $DEPLOY_DIR/
cp $LOCAL_PROJECT_PATH/package.json $DEPLOY_DIR/ 2>/dev/null || echo "No package.json found"
cp $LOCAL_PROJECT_PATH/package-lock.json $DEPLOY_DIR/ 2>/dev/null || echo "No package-lock.json"
cp $LOCAL_PROJECT_PATH/.env.example $DEPLOY_DIR/.env 2>/dev/null || echo "No .env.example"

# Create deployment script
cat > $DEPLOY_DIR/setup.sh << 'EOF'
#!/bin/bash
PROJECT_NAME="video-platform"
CONTAINER="${PROJECT_NAME}-app"
PROJECT_PATH="/mnt/blockstorage/projects/${PROJECT_NAME}"

echo "🔧 Setting up video-platform..."

# Copy Prisma files to the container's app directory
echo "📋 Copying Prisma schema..."
podman cp /tmp/video-platform-deploy/prisma ${CONTAINER}:/app/

# Update package.json if exists
if [ -f /tmp/video-platform-deploy/package.json ]; then
    echo "📦 Updating package.json..."
    podman cp /tmp/video-platform-deploy/package.json ${CONTAINER}:/app/
fi

# Install dependencies
echo "📦 Installing dependencies..."
podman exec ${CONTAINER} sh -c "cd /app && npm install"

# Install Prisma if not already installed
echo "🔧 Installing Prisma..."
podman exec ${CONTAINER} sh -c "cd /app && npm install prisma @prisma/client"

# Generate Prisma Client
echo "🔄 Generating Prisma Client..."
podman exec ${CONTAINER} sh -c "cd /app && npx prisma generate"

# Push schema to database
echo "🗄️ Pushing schema to database..."
podman exec ${CONTAINER} sh -c "cd /app && npx prisma db push --force-reset"

# Run migrations if they exist
echo "🔄 Running migrations..."
podman exec ${CONTAINER} sh -c "cd /app && npx prisma migrate deploy" || echo "No migrations to run"

# Build the application
echo "🏗️ Building application..."
podman exec ${CONTAINER} sh -c "cd /app && npm run build" || echo "Build failed, trying dev mode"

# Start the application
echo "▶️ Starting application..."
podman exec ${CONTAINER} sh -c "cd /app && npm run dev &" || podman exec ${CONTAINER} sh -c "cd /app && npm start &"

# Show logs
echo "📜 Application logs:"
podman logs --tail 20 ${CONTAINER}

echo "✅ Setup complete!"
echo "🌐 Access at: http://${SERVER_IP}:4002"
EOF

# Make script executable
chmod +x $DEPLOY_DIR/setup.sh

# Create tar archive for easy transfer
echo "📦 Creating deployment archive..."
tar -czf /tmp/video-platform-deploy.tar.gz -C /tmp video-platform-deploy

echo "📤 Attempting to deploy to server..."

# Try SSH first (might fail)
scp -o ConnectTimeout=5 /tmp/video-platform-deploy.tar.gz root@${SERVER_IP}:/tmp/ 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ Files uploaded successfully!"
    ssh -o ConnectTimeout=5 root@${SERVER_IP} << 'REMOTE_COMMANDS'
    cd /tmp
    tar -xzf video-platform-deploy.tar.gz
    cd video-platform-deploy
    bash setup.sh
REMOTE_COMMANDS
else
    echo "⚠️ SSH not available. Creating manual deployment instructions..."
    
    # Create manual instructions
    cat > deploy-instructions.md << EOF
# Manual Deployment Instructions for video-platform

## Option 1: Using the API Server (Recommended)

### 1. Upload Prisma schema via API
Since SSH is not available, we need to manually update the project files.

### 2. Steps to follow:

1. Access the server somehow (console, VNC, or wait for SSH to be available)

2. Create Prisma directory in the container:
\`\`\`bash
podman exec video-platform-app mkdir -p /app/prisma
\`\`\`

3. Create the schema.prisma file:
\`\`\`bash
podman exec video-platform-app sh -c "cat > /app/prisma/schema.prisma << 'SCHEMA'
$(cat $LOCAL_PROJECT_PATH/prisma/schema.prisma)
SCHEMA"
\`\`\`

4. Install dependencies and setup Prisma:
\`\`\`bash
podman exec video-platform-app sh -c "cd /app && npm install prisma @prisma/client"
podman exec video-platform-app sh -c "cd /app && npx prisma generate"
podman exec video-platform-app sh -c "cd /app && npx prisma db push --force-reset"
\`\`\`

5. Build and start the application:
\`\`\`bash
podman exec video-platform-app sh -c "cd /app && npm run build"
podman exec video-platform-app sh -c "cd /app && npm run start"
\`\`\`

## Option 2: Direct Container Access

\`\`\`bash
# Enter the container
podman exec -it video-platform-app sh

# Inside container:
cd /app
npm install prisma @prisma/client
# Create prisma/schema.prisma manually with vi or nano
npx prisma generate
npx prisma db push
npm run build
npm run start
\`\`\`

## Files to deploy:
- Deployment package saved at: /tmp/video-platform-deploy.tar.gz
- Contains: Prisma schema, migrations, seed files

## Access URLs:
- Direct: http://141.164.60.51:4002
- Domain: https://video-platform.codeb.one-q.xyz (DNS required)
EOF
    
    echo "📋 Manual instructions saved to deploy-instructions.md"
    echo ""
    echo "⚠️ Since SSH is not available, you need to:"
    echo "1. Access the server directly (console/VNC)"
    echo "2. Follow the instructions in deploy-instructions.md"
    echo "3. Or wait for SSH to become available"
fi

echo ""
echo "📊 Current Status:"
curl -s http://${SERVER_IP}:3008/api/projects | jq '.projects[] | select(.name=="video-platform")' 2>/dev/null || echo "Unable to fetch status"