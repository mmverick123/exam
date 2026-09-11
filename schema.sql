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
  answer_data JSON NOT NULL,
  submitted_at DATETIME NOT NULL
);
