#!/bin/bash
set -e

SITE="/home/ubuntu/.openclaw/workspace/stealthvpn"

echo "[deploy] Pulling latest..."
cd "$SITE" && git pull origin main

echo "[deploy] Installing dependencies..."
npm install --production=false

echo "[deploy] Building..."
npm run build

echo "[deploy] Restarting service..."
sudo systemctl restart stealthvpn

echo "[deploy] Done at $(date)"
