#!/usr/bin/env bash
set -euo pipefail

KEY=~/Documents/algopin_key.pem
VM=superadmin@51.12.242.188
DOMAIN=algopin.swedencentral.cloudapp.azure.com

echo "[1/4] rsync code (excluding server/.env)…"
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .git \
  --exclude 'server/.env' --exclude '*.log' \
  -e "ssh -i $KEY" \
  ./ "$VM":~/mturk-pin-study/

echo "[2/4] rebuild + redeploy…"
ssh -i "$KEY" "$VM" 'bash -s' <<EOF
set -euo pipefail
cd ~/mturk-pin-study
export VITE_API_BASE_URL="https://$DOMAIN"
npm run build
sudo rm -rf /var/www/algopin/*
sudo cp -r dist/* /var/www/algopin/
sudo chown -R www-data:www-data /var/www/algopin
sudo systemctl restart algopin-api.service
EOF

echo "[3/4] smoke test…"
curl -s -o /dev/null -w "GET  https://$DOMAIN/          -> HTTP %{http_code}\n" https://$DOMAIN/
curl -s -o /dev/null -w "GET  https://$DOMAIN/api/health -> HTTP %{http_code}\n" https://$DOMAIN/api/health
echo "[4/4] done ✓"