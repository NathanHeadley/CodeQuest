# CodeQuest

A 2D coding-driven RPG for S2 Computing Science pupils. Players write Python to unlock
and recharge in-game actions. Code is **parsed, never executed** (Python `ast`).

## Architecture

- **Frontend** — Phaser 3 static site (served by nginx).
- **Backend** — Node.js (Express + `ws`) API + WebSocket multiplayer. Listens on `127.0.0.1:3000`.
- **Validator** — small Python service (`ast.parse` only) on `127.0.0.1:5001`. The Node backend
  calls it to check submitted code against the expected AST pattern for each action/tier.
- **Database** — MySQL (local to the game VPS).
- **Auth** — the main site (joltcomputing.com) already does Microsoft SSO via SAML. On launch it
  mints a short-lived **RS256 JWT** (`bridge/bridge.php`) from the live SAML session; the Node
  backend verifies it with the public key. The game server never holds the signing key.

Hosting: separate VPS `87.106.103.179`, reached as `game.joltcomputing.com` (reverse-proxied,
reuses the `*.joltcomputing.com` wildcard cert).

## Layout

```
codequest/
├── backend/      # Node API + WebSocket server
│   ├── src/
│   └── sql/schema.sql
├── validator/    # Python ast validation microservice
├── frontend/     # Phaser 3 static site (added in a later slice)
├── bridge/       # bridge.php — drop into the main site to mint JWTs
├── nginx/        # codequest.conf vhost
├── systemd/      # service units for api + validator
└── setup.sh      # app-level provisioning (run on the game VPS)
```

## Local dev quick start

```bash
# 1. Validator
cd validator && python3 -m venv venv && . venv/bin/activate && pip install -r requirements.txt
python validator.py   # -> 127.0.0.1:5001

# 2. Backend (needs MySQL + a JWT public key at backend/keys/jwt_public.pem)
cd backend && npm install
cp .env.example .env   # edit DB creds
mysql < sql/schema.sql
npm start              # -> 127.0.0.1:3000  (GET /api/health)
```

## MVP actions

| action_name | expected code |
|---|---|
| `move_left`  | `player.x = player.x - 1` |
| `move_right` | `player.x = player.x + 1` |
| `move_up`    | `player.y = player.y - 1` |
| `move_down`  | `player.y = player.y + 1` |
| `attack`     | `player.attack(enemy)` |
| `equip`      | `player.equip(item_name)` |
| `use`        | `player.use(item_name, target_name)` |
