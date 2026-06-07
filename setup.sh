#!/usr/bin/env bash
#
# CodeQuest APP provisioning -- run on the game VPS (87.106.103.179) as root.
# The base OS bootstrap (Node, MySQL, nginx, Python, ufw, SSH hardening) is already done
# by jolt-bootstrap.sh. This script wires up the application itself.
#
# Idempotent: safe to re-run.
set -uo pipefail

APP_DIR=/var/www/codequest
DB_NAME=codequest
DB_USER=codequest

echo "===== [1/8] service account + directories ====="
id codequest >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin codequest
mkdir -p "$APP_DIR"/{backend,validator,frontend}
mkdir -p "$APP_DIR/backend/keys"

echo "===== [2/8] deploy code ====="
# Expecting the repo contents to have been copied to /root/codequest (scp/git).
# Copy each component into place (frontend handled in a later slice).
rsync -a --delete /root/codequest/backend/   "$APP_DIR/backend/"   --exclude node_modules --exclude .env --exclude keys
rsync -a --delete /root/codequest/validator/ "$APP_DIR/validator/" --exclude venv

echo "===== [3/8] MySQL database + user ====="
DB_PASS_FILE="$APP_DIR/.db_password"
if [ ! -f "$DB_PASS_FILE" ]; then
  openssl rand -base64 24 > "$DB_PASS_FILE"
  chmod 600 "$DB_PASS_FILE"
fi
DB_PASS=$(cat "$DB_PASS_FILE")
mysql <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT SELECT, INSERT, UPDATE, DELETE ON ${DB_NAME}.* TO '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
mysql "${DB_NAME}" < "$APP_DIR/backend/sql/schema.sql"

echo "===== [4/8] backend .env ====="
ENV_FILE="$APP_DIR/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<ENV
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_NAME=${DB_NAME}
JWT_PUBLIC_KEY_PATH=${APP_DIR}/backend/keys/jwt_public.pem
JWT_ISSUER=joltcomputing.com
JWT_AUDIENCE=codequest
VALIDATOR_URL=http://127.0.0.1:5001
ENV
  chmod 600 "$ENV_FILE"
fi

echo "===== [5/8] node deps ====="
cd "$APP_DIR/backend" && npm install --omit=dev

echo "===== [6/8] python venv ====="
python3 -m venv "$APP_DIR/validator/venv"
"$APP_DIR/validator/venv/bin/pip" install --upgrade pip
"$APP_DIR/validator/venv/bin/pip" install -r "$APP_DIR/validator/requirements.txt"

echo "===== [7/8] ownership + systemd ====="
chown -R codequest:codequest "$APP_DIR"
# nginx (www-data) must be able to traverse/read the static frontend.
find "$APP_DIR/frontend" -type d -exec chmod 755 {} + 2>/dev/null || true
find "$APP_DIR/frontend" -type f -exec chmod 644 {} + 2>/dev/null || true
cp /root/codequest/systemd/codequest-validator.service /etc/systemd/system/
cp /root/codequest/systemd/codequest-api.service       /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now codequest-validator.service
systemctl enable --now codequest-api.service

echo "===== [8/8] nginx vhost ====="
cp /root/codequest/nginx/codequest.conf /etc/nginx/sites-available/codequest.conf
ln -sf /etc/nginx/sites-available/codequest.conf /etc/nginx/sites-enabled/codequest.conf
nginx -t && systemctl reload nginx

echo
echo "DONE. Remaining manual steps:"
echo "  - Place the JWT public key at ${APP_DIR}/backend/keys/jwt_public.pem"
echo "  - Point game.joltcomputing.com DNS at this host, then run:"
echo "      certbot --nginx -d game.joltcomputing.com"
echo "  - Deploy the Phaser frontend into ${APP_DIR}/frontend"
