CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(128) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','user') NOT NULL DEFAULT 'user',
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  last_login_at DATETIME NULL
);

CREATE TABLE projects (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(512) NOT NULL DEFAULT '',
  created_by BIGINT NOT NULL,
  status ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE project_members (
  project_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  permission ENUM('manage','answer') NOT NULL DEFAULT 'answer',
  created_at DATETIME NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE question_type (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(512) NOT NULL DEFAULT '',
  subject VARCHAR(32) NOT NULL DEFAULT '',
  status TINYINT NOT NULL DEFAULT 0,
  current_version INT NOT NULL DEFAULT 0,
  published_version INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE project_question_types (
  project_id BIGINT NOT NULL,
  question_type_id BIGINT NOT NULL,
  assigned_by BIGINT NOT NULL,
  assigned_at DATETIME NOT NULL,
  PRIMARY KEY (project_id, question_type_id)
);

CREATE TABLE user_sessions (
  token CHAR(36) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX ix_session_user (user_id),
  INDEX ix_session_expiry (expires_at)
);

CREATE TABLE question_type_version (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_type_id BIGINT NOT NULL,
  version INT NOT NULL,
  form_json JSON NOT NULL,
  contract_version VARCHAR(32) NOT NULL,
  lib_version VARCHAR(32) NOT NULL,
  source TINYINT NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_type_version (question_type_id, version)
);

CREATE TABLE answer_record (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_type_id BIGINT NOT NULL,
  version INT NOT NULL,
  examinee VARCHAR(64) NOT NULL DEFAULT 'anonymous',
  user_id BIGINT NULL,
  project_id BIGINT NULL,
  answer_data JSON NOT NULL,
  submitted_at DATETIME NOT NULL
);
