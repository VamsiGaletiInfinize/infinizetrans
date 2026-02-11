#!/bin/bash
set -e

echo "========================================="
echo "Infinize Backend — Docker Deployment"
echo "========================================="

# Install Docker if not present
if ! command -v docker &> /dev/null; then
  echo "[1/4] Installing Docker..."
  sudo yum update -y
  sudo yum install -y docker
  sudo systemctl enable docker
  sudo systemctl start docker
  sudo usermod -aG docker ec2-user
  echo "Docker installed. You may need to log out and back in for group changes."
  echo "Then re-run this script."
  exit 0
fi

# Install Docker Compose plugin if not present
if ! docker compose version &> /dev/null; then
  echo "[1/4] Installing Docker Compose plugin..."
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

echo "[1/4] Docker ready: $(docker --version)"

# Pull latest code
echo "[2/4] Pulling latest code..."
cd ~/infinize-translate-service
git pull

# Stop PM2 if running
if command -v pm2 &> /dev/null; then
  echo "[3/4] Stopping PM2..."
  pm2 stop all 2>/dev/null || true
  pm2 delete all 2>/dev/null || true
fi

# Build and start with Docker
echo "[4/4] Building and starting Docker container..."
cd backend
docker compose up -d --build

echo ""
echo "========================================="
echo "Checking health..."
echo "========================================="
sleep 5
if curl -sf http://localhost:3001/api/health > /dev/null; then
  echo "✅ Backend is healthy!"
  echo ""
  echo "Useful commands:"
  echo "  docker compose logs -f     — View live logs"
  echo "  docker compose restart     — Restart"
  echo "  docker compose down        — Stop"
  echo "  docker compose up -d --build — Rebuild & start"
else
  echo "❌ Health check failed. Check logs:"
  echo "  docker compose logs"
fi
