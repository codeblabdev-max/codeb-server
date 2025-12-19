#!/bin/bash

# CodeB Simple API Deployment Script
# Based on warehouse-rental deployment pattern

set -e

echo "🚀 CodeB Simple API Deployment"
echo "================================"

# Configuration
SERVER="141.164.60.51"
SERVER_USER="root"
SERVER_PATH="/opt/codeb-api"
IMAGE_NAME="codeb-simple-api"
IMAGE_VERSION="1.0.0"
CONTAINER_NAME="codeb-api"
PORT="3020"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Step 1: Build Docker image for x86_64
echo ""
echo "📦 Building Docker image for x86_64..."
docker buildx build \
    --platform linux/amd64 \
    -t ${IMAGE_NAME}:${IMAGE_VERSION} \
    -f Dockerfile.simple \
    . \
    --load

if [ $? -eq 0 ]; then
    log_info "Image built successfully"
else
    log_error "Failed to build image"
    exit 1
fi

# Step 2: Save and compress image
echo ""
echo "💾 Saving and compressing image..."
docker save ${IMAGE_NAME}:${IMAGE_VERSION} | gzip > /tmp/${IMAGE_NAME}-${IMAGE_VERSION}.tar.gz

if [ $? -eq 0 ]; then
    SIZE=$(du -h /tmp/${IMAGE_NAME}-${IMAGE_VERSION}.tar.gz | cut -f1)
    log_info "Image saved (${SIZE})"
else
    log_error "Failed to save image"
    exit 1
fi

# Step 3: Transfer to server
echo ""
echo "📤 Transferring image to server..."
scp /tmp/${IMAGE_NAME}-${IMAGE_VERSION}.tar.gz ${SERVER_USER}@${SERVER}:/tmp/

if [ $? -eq 0 ]; then
    log_info "Image transferred"
else
    log_error "Failed to transfer image"
    exit 1
fi

# Step 4: Transfer deployment files
echo ""
echo "📤 Transferring deployment files..."
ssh ${SERVER_USER}@${SERVER} "mkdir -p ${SERVER_PATH}"
scp docker-compose.simple.yml ${SERVER_USER}@${SERVER}:${SERVER_PATH}/docker-compose.yml
scp Dockerfile.simple ${SERVER_USER}@${SERVER}:${SERVER_PATH}/Dockerfile.simple
scp simple-api-server.js ${SERVER_USER}@${SERVER}:${SERVER_PATH}/simple-api-server.js

if [ $? -eq 0 ]; then
    log_info "Deployment files transferred"
else
    log_error "Failed to transfer deployment files"
    exit 1
fi

# Step 5: Deploy on server
echo ""
echo "🚀 Deploying on server..."
ssh ${SERVER_USER}@${SERVER} << 'ENDSSH'
set -e

# Load image
echo "Loading image..."
podman load < /tmp/codeb-simple-api-1.0.0.tar.gz

# Navigate to deployment directory
cd /opt/codeb-api

# Stop and remove existing container
echo "Stopping existing containers..."
podman-compose down 2>/dev/null || true

# Start new containers
echo "Starting new containers..."
podman-compose up -d

# Check status
sleep 5
echo "Checking container status..."
podman ps | grep codeb-api

# Test health endpoint
echo "Testing health endpoint..."
sleep 2
curl -f http://localhost:3020/health || echo "Health check will be available shortly"

echo "✅ Deployment complete"
ENDSSH

if [ $? -eq 0 ]; then
    log_info "Deployment successful"
else
    log_error "Deployment failed"
    exit 1
fi

# Cleanup
echo ""
echo "🧹 Cleaning up..."
rm /tmp/${IMAGE_NAME}-${IMAGE_VERSION}.tar.gz
log_info "Local cleanup complete"

echo ""
echo "================================"
echo "✅ Deployment Complete!"
echo ""
echo "API URL: http://${SERVER}:${PORT}"
echo "Health: http://${SERVER}:${PORT}/health"
echo "Projects: http://${SERVER}:${PORT}/projects"
echo ""
