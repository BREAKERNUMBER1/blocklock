#!/bin/bash
# BlockLock — DigitalOcean Server Setup Script
# Run as root on a fresh Ubuntu 22.04 LTS Droplet
# Usage: bash setup.sh YOUR_DOMAIN

set -e

DOMAIN=${1:?Usage: bash setup.sh your-domain.com}

echo "=== BlockLock Server Setup ==="
echo "Domain: $DOMAIN"
echo ""

# ─── System update ────────────────────────────────────────────
apt-get update -y && apt-get upgrade -y

# ─── Node.js 20 ───────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# ─── Mosquitto MQTT broker ────────────────────────────────────
apt-get install -y mosquitto mosquitto-clients

# ─── Nginx ────────────────────────────────────────────────────
apt-get install -y nginx

# ─── Certbot (Let's Encrypt TLS) ─────────────────────────────
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN"

# ─── Mosquitto MQTT user ──────────────────────────────────────
echo "Creating MQTT user 'blocklock'..."
read -s -p "Enter MQTT password for 'blocklock': " MQTT_PASS
echo ""
mosquitto_passwd -b -c /etc/mosquitto/passwd blocklock "$MQTT_PASS"
echo "MQTT user created."

# ─── Copy Mosquitto config ────────────────────────────────────
cp "$(dirname "$0")/mosquitto.conf" /etc/mosquitto/mosquitto.conf
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" /etc/mosquitto/mosquitto.conf
systemctl enable mosquitto
systemctl restart mosquitto
echo "Mosquitto configured and started."

# ─── Create web root ──────────────────────────────────────────
mkdir -p /var/www/blocklock

# ─── Copy Nginx config ────────────────────────────────────────
cp "$(dirname "$0")/nginx.conf" /etc/nginx/sites-available/blocklock
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" /etc/nginx/sites-available/blocklock
ln -sf /etc/nginx/sites-available/blocklock /etc/nginx/sites-enabled/blocklock
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "Nginx configured."

# ─── Backend setup ────────────────────────────────────────────
mkdir -p /opt/blocklock-backend
cp -r "$(dirname "$0")/../backend/." /opt/blocklock-backend/
cd /opt/blocklock-backend && npm install --production
echo ""
echo "IMPORTANT: Copy and fill in your .env file:"
echo "  cp /opt/blocklock-backend/.env.example /opt/blocklock-backend/.env"
echo "  nano /opt/blocklock-backend/.env"

# ─── PM2 process manager ──────────────────────────────────────
npm install -g pm2
pm2 start /opt/blocklock-backend/src/server.js --name blocklock-api
pm2 save
pm2 startup systemd -u root --hp /root
echo "PM2 configured to auto-start BlockLock API on boot."

# ─── Firewall ─────────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 8883/tcp   # MQTT TLS
ufw --force enable
echo "Firewall configured."

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Fill in /opt/blocklock-backend/.env"
echo "  2. pm2 restart blocklock-api"
echo "  3. Build and deploy frontend:"
echo "       cd frontend && npm install && npm run build"
echo "       cp -r dist/. /var/www/blocklock/"
echo "  4. Deploy contracts: cd contracts && npm run deploy:sepolia"
echo "  5. Update .env files with deployed contract addresses"
echo "  6. Flash ESP32 firmware with config.h filled in"
echo ""
