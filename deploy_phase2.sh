#!/usr/bin/env bash
# =============================================================================
# deploy_phase2.sh
#
# Run this from your Mac. It uploads Phase 2 to Azure, then SSHs in to install
# the frontend + backend NEXT TO Phase 1. Phase 1 files, Nginx vhosts, PM2
# names, ports, and databases are never modified.
#
#   ./deploy_phase2.sh
#
# Run as your Mac user. Do not use sudo / sudo su — this script SSHs to Azure
# and needs your key at ~/Documents/algopin_key.pem.
#
# Public URL (Option A — second Azure Public IP + DNS label):
#   https://algopinphase2.swedencentral.cloudapp.azure.com/
#
# SSH still uses the Phase 1 hostname. Phase 2 is a separate DNS label on a
# second public IP attached to the same VM (see the Azure steps printed at
# the end of a successful deploy).
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# 1. Server connection variables — edit these before deploying
# -----------------------------------------------------------------------------

SERVER_HOST="algopin.swedencentral.cloudapp.azure.com"
SERVER_USER="superadmin"
STAGING_DIR="~/algopin_phase2_staging"

# Same key Phase 1's deploy.sh uses. Override with a full path if yours lives elsewhere.
# Default is filled in after LOCAL_HOME is resolved (never use ~/ here — bash
# expands tilde inside ${var#~/}, which produced .../~/Documents/...).
SSH_KEY="${SSH_KEY:-}"

# Local copy of this repo (the directory that contains this script).
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# -----------------------------------------------------------------------------
# Local helpers
# -----------------------------------------------------------------------------

step() {
  echo
  echo "============================================================"
  echo " $1"
  echo "============================================================"
}

info() {
  echo "  -> $1"
}

die() {
  echo "ERROR: $1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

# Home of the Mac user who should own the SSH key — even inside `sudo su`.
local_home() {
  local owner=""
  if [[ "$(id -u)" -eq 0 ]]; then
    if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
      owner="${SUDO_USER}"
    elif [[ "$(uname -s)" == "Darwin" ]]; then
      owner="$(stat -f '%Su' /dev/console 2>/dev/null || true)"
    fi
    if [[ -n "${owner}" && "${owner}" != "root" ]]; then
      if command -v dscl >/dev/null 2>&1; then
        dscl . -read "/Users/${owner}" NFSHomeDirectory 2>/dev/null | awk '{print $2}'
        return
      fi
      eval echo "~${owner}"
      return
    fi
  fi
  printf '%s' "${HOME}"
}

LOCAL_HOME="$(local_home)"

expand_tilde() {
  local path="$1"
  local prefix='~/'
  # Quote the prefix. ${path#~/} tilde-expands to $HOME/ and fails to strip.
  if [[ "${path}" == "${prefix}"* ]]; then
    printf '%s' "${LOCAL_HOME}/${path#"${prefix}"}"
  elif [[ "${path}" == '~' ]]; then
    printf '%s' "${LOCAL_HOME}"
  else
    printf '%s' "${path}"
  fi
}

# -----------------------------------------------------------------------------
# Local safety / prompts
# -----------------------------------------------------------------------------

step "Phase 2 remote deploy (Mac -> Azure)"

echo "This script uploads Phase 2 from this Mac, then deploys it on the server."
echo "It will NOT modify Phase 1 Nginx configs, PM2 processes, files, or ports."
echo

read -r -p "Enter your Azure SSH username: " INPUT
if [[ -n "${INPUT}" ]]; then
  SERVER_USER="${INPUT}"
fi
if [[ -z "${SERVER_USER}" || "${SERVER_USER}" == "YOUR_AZURE_USERNAME" ]]; then
  die "Azure SSH username is required (or set SERVER_USER at the top of this script)."
fi

if [[ "$(id -u)" -eq 0 ]]; then
  echo "WARNING: You are running as root. This script runs on your Mac and SSHs to Azure."
  echo "Do not use sudo. Prefer: exit the root shell, then ./deploy_phase2.sh"
  echo "Using Mac user home ${LOCAL_HOME} for the SSH key (not /var/root)."
  echo
fi

if [[ -z "${SSH_KEY}" ]]; then
  SSH_KEY="${LOCAL_HOME}/Documents/algopin_key.pem"
else
  SSH_KEY="$(expand_tilde "${SSH_KEY}")"
fi
if [[ ! -f "${SSH_KEY}" ]]; then
  die "SSH key not found at ${SSH_KEY}. Expected ${LOCAL_HOME}/Documents/algopin_key.pem"
fi

if [[ ! -d "${REPO_DIR}/server" || ! -f "${REPO_DIR}/package.json" ]]; then
  die "Cannot find Phase 2 source at ${REPO_DIR} (expected server/ and package.json)."
fi

require_cmd rsync
require_cmd ssh

SSH_TARGET="${SERVER_USER}@${SERVER_HOST}"
SSH_OPTS=( -i "${SSH_KEY}" -o IdentitiesOnly=yes )

echo
echo "  SSH target   : ${SSH_TARGET}"
echo "  SSH key      : ${SSH_KEY}"
echo "  Staging dir  : ${STAGING_DIR}"
echo "  Local source : ${REPO_DIR}"
echo "  Public URL   : https://algopinphase2.swedencentral.cloudapp.azure.com/"
echo "  Frontend     : /var/www/algo-phase2-frontend"
echo "  Backend      : /var/www/algo-phase2-backend  (PM2 port 5002, proxied at /api)"
echo "  PM2 name     : algo-phase2-backend"
echo
echo "WARNING: You are about to upload and deploy Phase 2 on Azure."
echo "Phase 1 will be left untouched."
echo
read -r -p "Type 'yes' to continue: " CONFIRM
if [[ "${CONFIRM}" != "yes" ]]; then
  echo "Aborted by user."
  exit 1
fi

# -----------------------------------------------------------------------------
# 2. File upload (runs on this Mac)
# -----------------------------------------------------------------------------

step "[Local] Uploading files to Azure server..."
echo "Uploading files to Azure server..."
info "rsync ${REPO_DIR}/ -> ${SSH_TARGET}:${STAGING_DIR}/  (excluding node_modules and .git)"

rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  --exclude 'server/.env' \
  --exclude '.env.production' \
  --exclude '*.log' \
  -e "ssh ${SSH_OPTS[*]}" \
  "${REPO_DIR}/" "${SSH_TARGET}:${STAGING_DIR}/"

info "Upload complete."

# -----------------------------------------------------------------------------
# 3. Remote execution (SSH heredoc — runs on Azure)
# -----------------------------------------------------------------------------

step "[Local] Opening SSH session to run the server-side deploy..."
echo "Connecting to ${SSH_TARGET}..."

ssh -t "${SSH_OPTS[@]}" "${SSH_TARGET}" 'bash -s' << 'EOF'
set -euo pipefail

# --- Remote paths, ports, and domains (Phase 2 only) ---
STAGING_DIR="${HOME}/algopin_phase2_staging"
FRONTEND_DIR="/var/www/algo-phase2-frontend"
BACKEND_DIR="/var/www/algo-phase2-backend"
# Second Azure Public IP DNS label (NOT a subdomain of the Phase 1 name).
PHASE2_DOMAIN="algopinphase2.swedencentral.cloudapp.azure.com"
PHASE2_PUBLIC_IP="4.223.209.233"
PHASE2_PRIVATE_IP="10.0.0.5"
BACKEND_PORT=5002
PM2_APP_NAME="algo-phase2-backend"
NGINX_CONF_NAME="algo-phase2.conf"
NGINX_AVAILABLE="/etc/nginx/sites-available/${NGINX_CONF_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${NGINX_CONF_NAME}"
PHASE1_FRONTEND_DIR="/var/www/algopin"
PHASE1_SYSTEMD_UNIT="algopin-api.service"
PHASE2_DB_NAME="algopin_study_phase_2"

# Phase 1 source on this VM. /var/www/algopin is only the static build and
# has no server/.env — credentials live next to the Phase 1 Express app.
PHASE1_DIR="${HOME}/mturk-pin-study"
PHASE1_ENV_FILE="${PHASE1_DIR}/server/.env"

step() {
  echo
  echo "============================================================"
  echo " [remote] $1"
  echo "============================================================"
}

info() {
  echo "  -> $1"
}

die() {
  echo "ERROR: $1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

extract_env_value() {
  local file="$1"
  local key="$2"
  local line=""
  line="$(grep -E "^(export[[:space:]]+)?${key}=" "$file" 2>/dev/null | tail -n1)" || true
  [[ -n "$line" ]] || return 1
  local value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" =~ ^\"(.*)\"$ ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi
  printf '%s' "$value"
}

redact_mongo_uri() {
  sed -E 's#(mongodb(\+srv)?://[^:/]+:)[^@]+@#\1***@#'
}

rewrite_mongo_db() {
  local uri="$1"
  local new_db="$2"
  local query=""
  local base="$uri"
  if [[ "$uri" == *'?'* ]]; then
    base="${uri%%'?'*}"
    query="?${uri#*'?'}"
  fi
  local scheme="${base%%://*}"
  local rest="${base#*://}"
  local authority="${rest%%/*}"
  if [[ "$scheme" != "mongodb" && "$scheme" != "mongodb+srv" ]]; then
    die "Cannot parse MongoDB URI from Phase 1 (expected mongodb:// or mongodb+srv://)."
  fi
  if [[ -z "$authority" || "$authority" == "$base" ]]; then
    die "Cannot parse MongoDB URI host from Phase 1."
  fi
  printf '%s' "${scheme}://${authority}/${new_db}${query}"
}

find_phase1_env_file() {
  local found=""
  local -a candidates=()

  candidates+=("${PHASE1_ENV_FILE}")

  if command -v systemctl >/dev/null 2>&1; then
    local unit_text=""
    unit_text="$(systemctl cat "${PHASE1_SYSTEMD_UNIT}" 2>/dev/null || true)"
    if [[ -n "$unit_text" ]]; then
      local envfile=""
      envfile="$(printf '%s\n' "$unit_text" | grep -E '^[[:space:]]*EnvironmentFile=' | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
      envfile="${envfile#-}"
      [[ -n "$envfile" ]] && candidates+=("$envfile")

      local workdir=""
      workdir="$(systemctl show -p WorkingDirectory --value "${PHASE1_SYSTEMD_UNIT}" 2>/dev/null || true)"
      if [[ -n "$workdir" && "$workdir" != "/" ]]; then
        candidates+=("${workdir}/.env")
      fi
    fi
  fi

  candidates+=(
    "${HOME}/mturk-pin-study/server/.env"
    "/home/superadmin/mturk-pin-study/server/.env"
    "/root/mturk-pin-study/server/.env"
    "/var/www/algopin/server/.env"
    "/etc/algopin-api.env"
    "/etc/default/algopin-api"
  )

  local path=""
  for path in "${candidates[@]}"; do
    [[ -n "$path" && -f "$path" ]] || continue
    if extract_env_value "$path" "MONGODB_URI" >/dev/null 2>&1 || \
       extract_env_value "$path" "MONGO_URI" >/dev/null 2>&1; then
      found="$path"
      break
    fi
  done
  printf '%s' "$found"
}

# --- Remote safety ---
step "Safety checks on the Azure server"

if [[ ! -d "${STAGING_DIR}/server" || ! -f "${STAGING_DIR}/package.json" ]]; then
  die "Staging directory ${STAGING_DIR} does not look like the Phase 2 repo. Upload may have failed."
fi

if [[ "${FRONTEND_DIR}" == "${PHASE1_FRONTEND_DIR}" ]] || \
   [[ "${BACKEND_DIR}" == "${PHASE1_FRONTEND_DIR}" ]]; then
  die "Phase 2 paths collide with Phase 1 (${PHASE1_FRONTEND_DIR}). Aborting."
fi

require_cmd nginx
require_cmd npm
require_cmd node
require_cmd rsync
require_cmd systemctl
require_cmd sudo

if ! command -v pm2 >/dev/null 2>&1; then
  info "PM2 is not installed. Installing it globally for Phase 2 (does not affect Phase 1)..."
  sudo npm install -g pm2
fi
require_cmd pm2

# Azure secondary IPs exist on the NIC but are NOT added to Ubuntu unless we
# do it here. Without 10.0.0.5 on eth0, public IP 4.223.209.233 times out.
step "Binding Azure secondary private IP ${PHASE2_PRIVATE_IP} on eth0"
if ip -4 addr show dev eth0 | grep -q "${PHASE2_PRIVATE_IP}/"; then
  info "${PHASE2_PRIVATE_IP} is already on eth0"
else
  info "sudo ip addr add ${PHASE2_PRIVATE_IP}/24 dev eth0"
  sudo ip addr add "${PHASE2_PRIVATE_IP}/24" dev eth0
fi
info "Persisting via /etc/netplan/60-phase2-secondary.yaml (50-cloud-init.yaml untouched)"
sudo tee /etc/netplan/60-phase2-secondary.yaml >/dev/null <<YAML
network:
  version: 2
  ethernets:
    eth0:
      addresses:
        - ${PHASE2_PRIVATE_IP}/24
YAML
sudo chmod 600 /etc/netplan/60-phase2-secondary.yaml
sudo netplan apply
info "eth0 addresses:"
ip -4 addr show dev eth0

# --- Mongo credentials from Phase 1 (read-only) ---
step "Reading Phase 1 Mongo credentials (database will be rewritten to ${PHASE2_DB_NAME})"

ENV_FILE="$(find_phase1_env_file)"
if [[ -z "${ENV_FILE}" ]]; then
  die "Could not find Phase 1 server/.env. Edit PHASE1_ENV_FILE inside the remote block of deploy_phase2.sh (expected ${PHASE1_DIR}/server/.env)."
fi
info "Using Phase 1 env file (read-only): ${ENV_FILE}"

PHASE1_URI="$(extract_env_value "${ENV_FILE}" "MONGODB_URI" || true)"
if [[ -z "${PHASE1_URI}" ]]; then
  PHASE1_URI="$(extract_env_value "${ENV_FILE}" "MONGO_URI" || true)"
fi
if [[ -z "${PHASE1_URI}" ]]; then
  die "Phase 1 env ${ENV_FILE} has no MONGODB_URI / MONGO_URI."
fi

MONGO_URI="$(rewrite_mongo_db "${PHASE1_URI}" "${PHASE2_DB_NAME}")"
if [[ "${MONGO_URI}" == *"<username>"* || "${MONGO_URI}" == *"<password>"* ]]; then
  die "Mongo URI still contains a placeholder. Check ${ENV_FILE}."
fi
info "Mongo URI (redacted): $(printf '%s' "${MONGO_URI}" | redact_mongo_uri)"
info "Phase 1 data is isolated; Phase 2 will use database '${PHASE2_DB_NAME}'."

# --- Backend ---
step "Copying Phase 2 backend into ${BACKEND_DIR}"
info "Creating ${BACKEND_DIR} (will not touch Phase 1 directories)"
sudo mkdir -p "${BACKEND_DIR}"
info "sudo rsync ${STAGING_DIR}/server/ -> ${BACKEND_DIR}/"
sudo rsync -a --delete \
  --exclude node_modules \
  --exclude .env \
  --exclude '*.log' \
  "${STAGING_DIR}/server/" "${BACKEND_DIR}/"
sudo chown -R "$(whoami):$(whoami)" "${BACKEND_DIR}"

step "Installing backend npm dependencies"
info "npm install --omit=dev in ${BACKEND_DIR}"
(
  cd "${BACKEND_DIR}"
  npm install --omit=dev
)

step "Writing Phase 2 backend .env (port ${BACKEND_PORT}, db ${PHASE2_DB_NAME})"
cat > "${BACKEND_DIR}/.env" <<ENVFILE
PORT=${BACKEND_PORT}
MONGODB_URI=${MONGO_URI}
CORS_ORIGIN=https://${PHASE2_DOMAIN},http://${PHASE2_DOMAIN}
NODE_ENV=production
ENVFILE
chmod 600 "${BACKEND_DIR}/.env"
info "Wrote ${BACKEND_DIR}/.env"

step "Starting / restarting PM2 process '${PM2_APP_NAME}' on port ${BACKEND_PORT}"
info "This will not restart, stop, or otherwise touch any other PM2 process."
(
  cd "${BACKEND_DIR}"
  export NODE_ENV=production
  if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
    info "Phase 2 process already exists — restarting only '${PM2_APP_NAME}'"
    pm2 restart "${PM2_APP_NAME}" --update-env
  else
    info "Starting a new PM2 process named '${PM2_APP_NAME}' (entry: src/index.js)"
    pm2 start src/index.js --name "${PM2_APP_NAME}"
  fi
)
pm2 save
info "PM2 process list (Phase 1 processes, if any, are left running):"
pm2 list

# --- Frontend ---
step "Building Phase 2 frontend in ${STAGING_DIR}"
# Same-origin: Nginx serves the SPA and proxies /api on PHASE2_DOMAIN.
# Leave VITE_API_BASE_URL empty so http and https both work (see src/lib/api.ts).
info "Writing .env.production for same-origin API on ${PHASE2_DOMAIN}"
cat > "${STAGING_DIR}/.env.production" <<ENVFILE
VITE_API_BASE_URL=
ENVFILE

info "npm install (frontend)"
(
  cd "${STAGING_DIR}"
  npm install
)
info "npm run build (Vite)"
(
  cd "${STAGING_DIR}"
  npm run build
)
if [[ ! -d "${STAGING_DIR}/dist" ]]; then
  die "Vite build did not produce ${STAGING_DIR}/dist."
fi

step "Publishing frontend build to ${FRONTEND_DIR}"
info "sudo: clear only the Phase 2 web root, then copy dist/"
sudo mkdir -p "${FRONTEND_DIR}"
sudo find "${FRONTEND_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
sudo cp -r "${STAGING_DIR}/dist/." "${FRONTEND_DIR}/"
sudo chown -R www-data:www-data "${FRONTEND_DIR}"
info "Phase 2 static files are in ${FRONTEND_DIR}"

# --- Nginx (new vhost file only) ---
step "Writing a NEW Phase 2 Nginx site (Phase 1 vhosts are not touched)"
info "Generating ${NGINX_AVAILABLE}"
sudo tee "${NGINX_AVAILABLE}" >/dev/null <<NGINX
# Phase 2 only — do not merge this into the Phase 1 Nginx config.
# Host: second Azure Public IP DNS label (algopinphase2.*). Phase 1 keeps
# algopin.swedencentral.cloudapp.azure.com on the original public IP.

server {
    listen 80;
    listen [::]:80;
    server_name ${PHASE2_DOMAIN};

    root ${FRONTEND_DIR};
    index index.html;

    location /api {
        proxy_pass http://localhost:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri /index.html;
    }
}
NGINX

step "Enabling the Phase 2 site and reloading Nginx"
info "sudo ln -sfn ${NGINX_AVAILABLE} ${NGINX_ENABLED}"
sudo ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"

# Azure cloudapp hostnames can exceed the default 64-byte hash bucket.
# This is an http{} setting only — Phase 1 site files are not edited.
step "Raising Nginx server_names_hash_bucket_size for long Phase 2 hostnames"
NGINX_MAIN="/etc/nginx/nginx.conf"
HASH_SNIPPET="/etc/nginx/conf.d/algo-phase2-hash-bucket.conf"
if sudo grep -qE '^\s*server_names_hash_bucket_size\s+' "${NGINX_MAIN}"; then
  info "Updating server_names_hash_bucket_size to 128 in ${NGINX_MAIN}"
  sudo sed -i -E 's/^(\s*server_names_hash_bucket_size\s+)[0-9]+;/\1128;/' "${NGINX_MAIN}"
elif sudo grep -qE '^\s*#\s*server_names_hash_bucket_size\s+' "${NGINX_MAIN}"; then
  info "Uncommenting server_names_hash_bucket_size and setting it to 128 in ${NGINX_MAIN}"
  sudo sed -i -E 's/^(\s*)#\s*server_names_hash_bucket_size\s+[0-9]+;/\1server_names_hash_bucket_size 128;/' "${NGINX_MAIN}"
else
  info "Adding ${HASH_SNIPPET} (Phase 1 vhosts unchanged)"
  sudo mkdir -p /etc/nginx/conf.d
  echo "server_names_hash_bucket_size 128;" | sudo tee "${HASH_SNIPPET}" >/dev/null
fi

info "sudo nginx -t"
sudo nginx -t
info "sudo systemctl reload nginx (reload, not restart)"
sudo systemctl reload nginx
info "Nginx reloaded. Existing Phase 1 server blocks keep serving as before."

step "Requesting a Let's Encrypt certificate for ${PHASE2_DOMAIN} only"
info "Uses the existing certbot install. Will not expand or replace the Phase 1 cert."
require_cmd certbot
# Existing Let's Encrypt account on this VM is reused (--agree-tos).
# --nginx only touches the Phase 2 vhost that matches -d.
sudo certbot --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  --keep-until-expiring \
  --cert-name "${PHASE2_DOMAIN}" \
  -d "${PHASE2_DOMAIN}"
info "Phase 2 HTTPS is ${PHASE2_DOMAIN}. Phase 1 cert unchanged."

step "Phase 2 remote deploy complete"
echo "Public URL : https://${PHASE2_DOMAIN}/"
echo "Health     : https://${PHASE2_DOMAIN}/api/health"
echo "Files      : ${FRONTEND_DIR}  (SPA)  ${BACKEND_DIR}  (PM2 ${PM2_APP_NAME} :${BACKEND_PORT})"
echo
echo "HTTP on port 80 redirects to HTTPS (same as Phase 1). Certbot's timer"
echo "renews this cert; it is a separate certificate from Phase 1."
echo "Phase 1 was not modified."
echo
EOF

step "Local script finished"
echo "Remote Phase 2 deploy commands completed."
echo
