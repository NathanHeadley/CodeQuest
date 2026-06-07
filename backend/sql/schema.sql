-- CodeQuest schema (MySQL 8)
-- Run as: mysql < schema.sql   (creates DB if absent)

CREATE DATABASE IF NOT EXISTS codequest
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE codequest;

-- Keyed on Azure AD object id; user row created on first login (via JWT claims).
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  azure_oid               VARCHAR(64)  NOT NULL UNIQUE,
  display_name            VARCHAR(255) NOT NULL,
  year_group              VARCHAR(8)   NULL,
  is_teacher              BOOLEAN      NOT NULL DEFAULT FALSE,
  total_charges_consumed  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at            TIMESTAMP    NULL
);

CREATE TABLE IF NOT EXISTS player_state (
  user_id      BIGINT UNSIGNED PRIMARY KEY,
  x            INT          NOT NULL DEFAULT 0,
  y            INT          NOT NULL DEFAULT 0,
  current_map  VARCHAR(64)  NOT NULL DEFAULT 'town',
  health       INT          NOT NULL DEFAULT 10,
  combat_xp    INT UNSIGNED NOT NULL DEFAULT 0,
  survival_xp  INT UNSIGNED NOT NULL DEFAULT 0,
  coding_xp    INT UNSIGNED NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- One row per (user, action). tier rises each successful recode; charges reset on recode.
CREATE TABLE IF NOT EXISTS action_progress (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT UNSIGNED NOT NULL,
  action_name       VARCHAR(32)  NOT NULL,
  tier              INT          NOT NULL DEFAULT 1,
  charges_remaining INT          NOT NULL DEFAULT 0,
  times_coded       INT          NOT NULL DEFAULT 0,
  bound_key         VARCHAR(16)  NULL,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_action (user_id, action_name),
  CONSTRAINT fk_ap_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS combat_log (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  enemy_type    VARCHAR(32)  NOT NULL,
  outcome       VARCHAR(16)  NOT NULL,
  auto_resolved BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  item_name  VARCHAR(64)  NOT NULL,
  quantity   INT          NOT NULL DEFAULT 0,
  UNIQUE KEY uq_user_item (user_id, item_name),
  CONSTRAINT fk_inv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_quests (
  user_id      BIGINT UNSIGNED NOT NULL,
  quest_key    VARCHAR(32)  NOT NULL,
  completed_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, quest_key),
  CONSTRAINT fk_pq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS world_objects (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  object_type         VARCHAR(32)  NOT NULL,
  x                   INT          NOT NULL,
  y                   INT          NOT NULL,
  map_id              VARCHAR(64)  NOT NULL DEFAULT 'town',
  spawned_by_user_id  BIGINT UNSIGNED NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wo_user FOREIGN KEY (spawned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
