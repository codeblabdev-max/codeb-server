# Makefile for CodeB Development

.PHONY: help setup install dev build test clean docker-up docker-down docker-build

# Default target
help:
	@echo "CodeB Development Commands:"
	@echo ""
	@echo "  make setup        - Complete local setup"
	@echo "  make install      - Install dependencies"
	@echo "  make dev          - Start development servers"
	@echo "  make build        - Build production version"
	@echo "  make test         - Run all tests"
	@echo "  make clean        - Clean build artifacts"
	@echo ""
	@echo "Docker Commands:"
	@echo "  make docker-up    - Start Docker containers"
	@echo "  make docker-down  - Stop Docker containers"
	@echo "  make docker-build - Build Docker images"
	@echo ""
	@echo "CLI Commands:"
	@echo "  make cli-install  - Install CLI globally"
	@echo "  make cli-link     - Link CLI for development"
	@echo ""
	@echo "Database Commands:"
	@echo "  make db-init      - Initialize database"
	@echo "  make db-backup    - Backup database"
	@echo "  make db-restore   - Restore database"
	@echo ""
	@echo "API Key Commands:"
	@echo "  make api-key      - Generate admin API key"

# Setup local development
setup:
	@echo "Setting up CodeB local development..."
	@chmod +x setup-local.sh
	@./setup-local.sh

# Install dependencies
install:
	@echo "Installing dependencies..."
	@cd codeb-remix && npm install
	@cd codeb-cli && npm install

# Start development servers
dev:
	@echo "Starting development servers..."
	@./start-dev.sh

# Build production version
build:
	@echo "Building production version..."
	@cd codeb-remix && npm run build

# Run tests
test:
	@echo "Running tests..."
	@cd codeb-remix && npm test
	@cd codeb-cli && npm test

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf codeb-remix/build
	@rm -rf codeb-remix/node_modules
	@rm -rf codeb-cli/node_modules
	@rm -rf data/database.json
	@rm -rf logs/*

# Docker: Start containers
docker-up:
	@echo "Starting Docker containers..."
	@docker-compose up -d

# Docker: Stop containers
docker-down:
	@echo "Stopping Docker containers..."
	@docker-compose down

# Docker: Build images
docker-build:
	@echo "Building Docker images..."
	@docker-compose build

# Docker: View logs
docker-logs:
	@docker-compose logs -f

# Docker: Clean everything
docker-clean:
	@echo "Cleaning Docker resources..."
	@docker-compose down -v
	@docker system prune -f

# CLI: Install globally
cli-install:
	@echo "Installing CLI globally..."
	@cd codeb-cli && npm install -g .

# CLI: Link for development
cli-link:
	@echo "Linking CLI for development..."
	@cd codeb-cli && npm link

# Database: Initialize
db-init:
	@echo "Initializing database..."
	@mkdir -p data
	@echo '{"projects":[],"apiKeys":[]}' > data/database.json

# Database: Backup
db-backup:
	@echo "Backing up database..."
	@cp data/database.json data/database.backup.$$(date +%Y%m%d_%H%M%S).json
	@echo "Backup created: data/database.backup.$$(date +%Y%m%d_%H%M%S).json"

# Database: Restore
db-restore:
	@echo "Available backups:"
	@ls -la data/database.backup.*.json
	@echo ""
	@echo "To restore, run: cp data/database.backup.TIMESTAMP.json data/database.json"

# API Key: Generate admin key
api-key:
	@echo "Generating admin API key..."
	@curl -X POST http://localhost:3000/api/auth/init | jq '.'

# Server: Start production
start-prod:
	@echo "Starting production server..."
	@cd codeb-remix && NODE_ENV=production npm start

# Server: PM2 start
pm2-start:
	@echo "Starting with PM2..."
	@pm2 start ecosystem.config.js

# Server: PM2 stop
pm2-stop:
	@echo "Stopping PM2..."
	@pm2 stop all

# Server: PM2 restart
pm2-restart:
	@echo "Restarting PM2..."
	@pm2 restart all

# Server: PM2 logs
pm2-logs:
	@pm2 logs

# Git: Initialize repository
git-init:
	@echo "Initializing Git repository..."
	@git init
	@git add .
	@git commit -m "Initial commit"

# Development: Watch mode
watch:
	@echo "Starting watch mode..."
	@cd codeb-remix && npm run dev

# Development: Type checking
typecheck:
	@echo "Running type checks..."
	@cd codeb-remix && npm run typecheck

# Development: Linting
lint:
	@echo "Running linter..."
	@cd codeb-remix && npm run lint
	@cd codeb-cli && npm run lint

# Development: Format code
format:
	@echo "Formatting code..."
	@cd codeb-remix && npm run format
	@cd codeb-cli && npm run format

# Quick start for new developers
quickstart: install db-init api-key cli-link
	@echo ""
	@echo "========================================="
	@echo "CodeB Quick Start Complete!"
	@echo "========================================="
	@echo ""
	@echo "1. Start the server: make dev"
	@echo "2. Test the CLI: codeb config test"
	@echo "3. Create a project: codeb project create myapp"
	@echo ""
	@echo "Happy coding! 🚀"