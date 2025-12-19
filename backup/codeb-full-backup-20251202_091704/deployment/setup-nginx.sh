#!/bin/bash

# Nginx setup script for CodeB Server
# Run on server: 141.164.60.51

set -e

echo "🔧 Setting up Nginx for CodeB Server..."

# 1. Create web root directory
echo "Creating web root directory..."
mkdir -p /var/www/codeb

# 2. Create simple landing page
cat > /var/www/codeb/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CodeB Server</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 10px;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        .status { 
            display: inline-block;
            padding: 5px 10px;
            background: #4CAF50;
            color: white;
            border-radius: 5px;
            font-size: 14px;
        }
        .projects {
            margin-top: 30px;
            padding: 20px;
            background: #f9f9f9;
            border-radius: 5px;
        }
        .project {
            margin: 10px 0;
            padding: 10px;
            background: white;
            border-radius: 5px;
        }
        a {
            color: #2196F3;
            text-decoration: none;
        }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 CodeB Server</h1>
        <p><span class="status">ONLINE</span></p>
        
        <h2>API Endpoints</h2>
        <ul>
            <li><a href="/api/health">Health Check</a></li>
            <li>API Base: <code>http://one-q.xyz/api</code></li>
        </ul>

        <div class="projects">
            <h3>Active Projects</h3>
            <div class="project">
                <strong>test-nextjs</strong> - 
                <a href="http://test-nextjs.one-q.xyz" target="_blank">View Site</a>
            </div>
            <div class="project">
                <strong>video-platform</strong> - 
                <a href="http://video-platform.one-q.xyz" target="_blank">View Site</a>
            </div>
            <div class="project">
                <strong>test-cli-project</strong> - 
                <a href="http://test-cli-project.one-q.xyz" target="_blank">View Site</a>
            </div>
        </div>

        <p style="margin-top: 30px; color: #666;">
            Server: 141.164.60.51 | Port: 3008 | 
            <a href="https://github.com/yourusername/codeb" target="_blank">Documentation</a>
        </p>
    </div>
</body>
</html>
EOF

# 3. Copy Nginx configuration
echo "Setting up Nginx configuration..."
cat > /etc/nginx/sites-available/codeb << 'NGINX_CONFIG'
server {
    listen 80;
    server_name one-q.xyz www.one-q.xyz;

    # API Server
    location /api/ {
        proxy_pass http://localhost:3008/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static landing page
    location / {
        root /var/www/codeb;
        index index.html;
        try_files $uri $uri/ =404;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3008/api/health;
        access_log off;
    }
}

# Projects
server {
    listen 80;
    server_name test-nextjs.one-q.xyz;
    location / {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name video-platform.one-q.xyz video.one-q.xyz;
    location / {
        proxy_pass http://localhost:4002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name test-cli-project.one-q.xyz test-cli.one-q.xyz;
    location / {
        proxy_pass http://localhost:4003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_CONFIG

# 4. Enable site
echo "Enabling site..."
ln -sf /etc/nginx/sites-available/codeb /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 5. Test configuration
echo "Testing Nginx configuration..."
nginx -t

# 6. Restart Nginx
echo "Starting Nginx..."
systemctl restart nginx
systemctl enable nginx

# 7. Setup UFW firewall rules
echo "Configuring firewall..."
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"

# 8. Status check
echo ""
echo "✅ Nginx setup complete!"
echo ""
echo "Status:"
systemctl status nginx --no-pager | head -10

echo ""
echo "Test URLs:"
echo "  - http://one-q.xyz"
echo "  - http://one-q.xyz/api/health"
echo "  - http://test-nextjs.one-q.xyz"
echo "  - http://video-platform.one-q.xyz"
echo ""
echo "Next steps:"
echo "1. Setup SSL with Let's Encrypt:"
echo "   certbot --nginx -d one-q.xyz -d *.one-q.xyz"
echo "2. Configure DNS wildcard for *.one-q.xyz"
echo ""