import fs from "node:fs";

import jwt from "jsonwebtoken";

import { config } from "../config.js";
import { pool } from "../db.js";

let _publicKey = null;

function getPublicKey() {
  if (_publicKey === null) {
    try {
      _publicKey = fs.readFileSync(config.jwt.publicKeyPath, "utf8");
    } catch (e) {
      throw new Error(
        `Cannot read JWT public key at ${config.jwt.publicKeyPath}: ${e.message}`,
      );
    }
  }
  return _publicKey;
}

export function verifyToken(token) {
  return jwt.verify(token, getPublicKey(), {
    algorithms: ["RS256"],
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });
}

/**
 * Upsert the user from JWT claims minted by the main site's bridge.php.
 * Expected claims: sub = azure_oid, name, year_group.
 * Note: is_teacher is NOT taken from the token -- it is authoritative in the DB and
 * only seeded (false) on first insert, so staff flags set by an admin persist.
 */
export async function upsertUser(claims) {
  const azureOid = claims.sub;
  if (!azureOid) throw new Error("token missing sub (azure_oid)");
  const displayName = claims.name || "Unknown";
  const yearGroup = claims.year_group ?? null;

  await pool.execute(
    `INSERT INTO users (azure_oid, display_name, year_group, last_seen_at)
       VALUES (:oid, :name, :yg, NOW())
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       year_group   = VALUES(year_group),
       last_seen_at = NOW()`,
    { oid: azureOid, name: displayName, yg: yearGroup },
  );

  const [rows] = await pool.execute(
    `SELECT id, azure_oid, display_name, year_group, is_teacher
       FROM users WHERE azure_oid = :oid`,
    { oid: azureOid },
  );
  return rows[0];
}

/** Express middleware: verify Bearer JWT, upsert user, attach req.user. */
export async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "missing_token" });
    const claims = verifyToken(token);
    req.user = await upsertUser(claims);
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid_token", detail: err.message });
  }
}

/** Express middleware: require an authenticated teacher (DB is authority). */
export function requireTeacher(req, res, next) {
  if (!req.user || !req.user.is_teacher) {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}
