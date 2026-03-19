#!/bin/bash
# WirePulse RTMS — One-Click VPS Setup Script
# Run this after uploading and extracting on your Hostinger VPS

set -e
echo "================================================"
echo "  WirePulse RTMS — Automated Setup"
echo "================================================"

# 1. Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "[1/5] Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
else
    echo "[1/5] Node.js already installed: $(node -v)"
fi

# 2. Install PM2 if not present
if ! command -v pm2 &> /dev/null; then
    echo "[2/5] Installing PM2..."
    npm install -g pm2
else
    echo "[2/5] PM2 already installed"
fi

# 3. Install app dependencies
echo "[3/5] Installing dependencies..."
npm install --omit=dev

# 4. Seed database if not exists
if [ ! -f "db/ems_rtms.db" ]; then
    echo "[4/5] Seeding database..."
    node db/seed.js
else
    echo "[4/5] Database already exists, skipping seed"
fi

# 5. Start with PM2
echo "[5/5] Starting WirePulse RTMS..."
pm2 delete wirepulse-rtms 2>/dev/null || true
pm2 start server.js --name wirepulse-rtms
pm2 save
pm2 startup 2>/dev/null || true

echo ""
echo "================================================"
echo "  WirePulse RTMS is LIVE!"
echo "  Open: http://$(curl -s ifconfig.me):4000"
echo "  Login: admin / admin123"
echo "================================================"
echo ""
echo "Useful commands:"
echo "  pm2 logs wirepulse-rtms   — View logs"
echo "  pm2 restart wirepulse-rtms — Restart"
echo "  pm2 stop wirepulse-rtms    — Stop"
