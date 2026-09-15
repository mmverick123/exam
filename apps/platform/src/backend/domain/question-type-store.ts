import { randomUUID } from 'node:crypto';
import type { Pool } from 'mysql2/promise';

import {
  CONTRACT_VERSION,
  DEFAULT_FORM_CONFIG,
  normalizeJson,
  projectForExam,
  sanitizeQuestionJson,
  validate,
  validateAnswerData,
  validateForPublish,
  type QuestionJson,
} from '@exam/lowcode/contract';

export interface VersionSnapshot {
  version: number;
  formJson: QuestionJson;
  contractVersion: string;
  libVersion: string;
  source: 0 | 1 | 2;
}

export interface QuestionTypeRecord {
  id: number;
  code: string;
  name: string;
  description: string;
  subject: string;
  status: 0 | 1 | 2;
  currentVersion: number;
  publishedVersion: number;
  versions: Map<number, VersionSnapshot>;
}

export interface CreateQuestionInput {
  name: string;
  description?: string;
  subject?: string;
}

export class QuestionTypeStore {
  private nextId = 1;
  private readonly records = new Map<number, QuestionTypeRecord>();
  constructor(private readonly pool?: Pool) {}

  create(input: CreateQuestionInput): QuestionTypeRecord {
    if (this.pool) throw new Error('MySQL store requires createAsync');
    const id = this.nextId++;
    const code = randomUUID().replaceAll('-', '').slice(0, 16);
    const emptyJson: QuestionJson = {
      contractVersion: CONTRACT_VERSION,
      widgetList: [{ type: 'page', id: randomUUID(), options: {}, widgetList: [] }],
      formConfig: { ...DEFAULT_FORM_CONFIG },
    };
    const record: QuestionTypeRecord = {
      id,
      code,
      name: input.name,
      description: input.description ?? '',
      subject: input.subject ?? '',
      status: 0,
      currentVersion: 1,
      publishedVersion: 0,
      versions: new Map([
        [1, { version: 1, formJson: emptyJson, contractVersion: CONTRACT_VERSION, libVersion: '0.1.0', source: 0 }],
      ]),
    };
    this.records.set(id, record);
    return record;
  }

  async createAsync(input: CreateQuestionInput): Promise<QuestionTypeRecord> {
    if (!this.pool) return this.create(input);
    const code = randomUUID().replaceAll('-', '').slice(0, 16); const now = new Date();
    const [result] = await this.pool.execute<any>('INSERT INTO question_type (code,name,description,subject,status,current_version,published_version,created_at,updated_at) VALUES (?,?,?,?,0,1,0,?,?)', [code, input.name, input.description ?? '', input.subject ?? '', now, now]);
    const id = Number(result.insertId);
    const emptyJson: QuestionJson = { contractVersion: CONTRACT_VERSION, widgetList: [{ type: 'page', id: randomUUID(), options: {}, widgetList: [] }], formConfig: { ...DEFAULT_FORM_CONFIG } };
    await this.pool.execute('INSERT INTO question_type_version (question_type_id,version,form_json,contract_version,lib_version,source,created_at) VALUES (?,?,?,?,?,?,?)', [id, 1, JSON.stringify(emptyJson), CONTRACT_VERSION, '0.1.0', 0, now]);
    return { id, code, name: input.name, description: input.description ?? '', subject: input.subject ?? '', status: 0, currentVersion: 1, publishedVersion: 0, versions: new Map([[1, { version: 1, formJson: emptyJson, contractVersion: CONTRACT_VERSION, libVersion: '0.1.0', source: 0 }]]) };
  }

  getById(id: number): QuestionTypeRecord | undefined {
    return this.records.get(id);
  }

  async getByIdAsync(id: number): Promise<QuestionTypeRecord | undefined> { if (!this.pool) return this.getById(id); const [rows] = await this.pool.execute<any[]>('SELECT * FROM question_type WHERE id=?', [id]); return this.hydrate(rows[0]); }

  getByCode(code: string): QuestionTypeRecord | undefined {
    return [...this.records.values()].find((record) => record.code === code);
  }

  async getByCodeAsync(code: string): Promise<QuestionTypeRecord | undefined> { if (!this.pool) return this.getByCode(code); const [rows] = await this.pool.execute<any[]>('SELECT * FROM question_type WHERE code=?', [code]); return this.hydrate(rows[0]); }

  list(): QuestionTypeRecord[] {
    return [...this.records.values()];
  }

  async listAsync(): Promise<QuestionTypeRecord[]> { if (!this.pool) return this.list(); const [rows] = await this.pool.query<any[]>('SELECT * FROM question_type WHERE status<>2 ORDER BY updated_at DESC'); return Promise.all(rows.map((row) => this.hydrate(row))).then((items) => items.filter(Boolean) as QuestionTypeRecord[]); }

  saveVersion(record: QuestionTypeRecord, input: unknown, source: 0 | 1 | 2 = 0): VersionSnapshot {
    if (this.pool) throw new Error('MySQL store requires saveVersionAsync');
    let sanitized: QuestionJson;
    try {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new Error('formJson must be an object');
      }
      sanitized = sanitizeQuestionJson(input as QuestionJson);
    } catch {
      throw new PlatformError(400, 'INVALID_QUESTION_JSON');
    }
    if (sanitized.contractVersion !== CONTRACT_VERSION) {
      throw new PlatformError(400, 'UNSUPPORTED_CONTRACT_VERSION');
    }
    const validation = validate(sanitized);
    if (validation.errors.length > 0) {
      throw new PlatformError(400, 'INVALID_QUESTION_JSON', validation.errors);
    }
    const version = record.currentVersion + 1;
    const snapshot: VersionSnapshot = {
      version,
      formJson: normalizeJson(sanitized),
      contractVersion: sanitized.contractVersion,
      libVersion: '0.1.0',
      source,
    };
    record.versions.set(version, snapshot);
    record.currentVersion = version;
    return snapshot;
  }

  async saveVersionAsync(record: QuestionTypeRecord, input: unknown, source: 0 | 1 | 2 = 0): Promise<VersionSnapshot> { if (!this.pool) return this.saveVersion(record, input, source); const sanitized = this.sanitize(input); const version = record.currentVersion + 1; const now = new Date(); const snapshot = { version, formJson: normalizeJson(sanitized), contractVersion: sanitized.contractVersion, libVersion: '0.1.0', source } as VersionSnapshot; await this.pool.execute('INSERT INTO question_type_version (question_type_id,version,form_json,contract_version,lib_version,source,created_at) VALUES (?,?,?,?,?,?,?)', [record.id, version, JSON.stringify(snapshot.formJson), sanitized.contractVersion, '0.1.0', source, now]); await this.pool.execute('UPDATE question_type SET current_version=?,status=0,updated_at=? WHERE id=?', [version, now, record.id]); record.currentVersion = version; record.status = 0; record.versions.set(version, snapshot); return snapshot; }

  publish(record: QuestionTypeRecord, version: number): VersionSnapshot {
    if (this.pool) throw new Error('MySQL store requires publishAsync');
    const snapshot = record.versions.get(version);
    if (!snapshot) throw new PlatformError(404, 'VERSION_NOT_FOUND');
    const validation = validateForPublish(snapshot.formJson);
    if (!validation.valid) throw new PlatformError(400, 'PUBLISH_VALIDATION_FAILED', validation);
    record.publishedVersion = version;
    record.status = 1;
    return snapshot;
  }

  async publishAsync(record: QuestionTypeRecord, version: number): Promise<VersionSnapshot> { if (!this.pool) return this.publish(record, version); const snapshot = await this.getVersionAsync(record.id, version); if (!snapshot) throw new PlatformError(404, 'VERSION_NOT_FOUND'); const validation = validateForPublish(snapshot.formJson); if (!validation.valid) throw new PlatformError(400, 'PUBLISH_VALIDATION_FAILED', validation); await this.pool.execute('UPDATE question_type SET published_version=?,status=1,updated_at=? WHERE id=?', [version, new Date(), record.id]); record.publishedVersion = version; record.status = 1; record.versions.set(version, snapshot); return snapshot; }

  getPublished(record: QuestionTypeRecord): { version: number; json: QuestionJson } | undefined {
    if (record.publishedVersion === 0) return undefined;
    const snapshot = record.versions.get(record.publishedVersion);
    if (!snapshot) return undefined;
    return { version: snapshot.version, json: projectForExam(snapshot.formJson) };
  }

  async getPublishedAsync(record: QuestionTypeRecord): Promise<{ version: number; json: QuestionJson } | undefined> { if (!this.pool) return this.getPublished(record); if (!record.publishedVersion) return undefined; const snapshot = await this.getVersionAsync(record.id, record.publishedVersion); return snapshot ? { version: snapshot.version, json: projectForExam(snapshot.formJson) } : undefined; }

  validateAnswers(record: QuestionTypeRecord, version: number, answerData: unknown) {
    if (this.pool) throw new Error('MySQL store requires validateAnswersAsync');
    const snapshot = record.versions.get(version);
    if (!snapshot) throw new PlatformError(404, 'VERSION_NOT_FOUND');
    const result = validateAnswerData(snapshot.formJson, answerData);
    if (!result.valid) throw new PlatformError(400, 'INVALID_ANSWER_DATA', result);
    return result;
  }

  async validateAnswersAsync(record: QuestionTypeRecord, version: number, answerData: unknown) { if (!this.pool) return this.validateAnswers(record, version, answerData); const snapshot = await this.getVersionAsync(record.id, version); if (!snapshot) throw new PlatformError(404, 'VERSION_NOT_FOUND'); const result = validateAnswerData(snapshot.formJson, answerData); if (!result.valid) throw new PlatformError(400, 'INVALID_ANSWER_DATA', result); return result; }

  async recordAnswerAsync(record: QuestionTypeRecord, version: number, answerData: unknown, context: { userId?: number; projectId?: number; examinee?: string } = {}): Promise<void> {
    await this.validateAnswersAsync(record, version, answerData);
    if (this.pool) await this.pool.execute('INSERT INTO answer_record (question_type_id,version,examinee,user_id,project_id,answer_data,submitted_at) VALUES (?,?,?,?,?,?,?)', [record.id, version, context.examinee ?? 'anonymous', context.userId ?? null, context.projectId ?? null, JSON.stringify(answerData), new Date()]);
  }

  private sanitize(input: unknown): QuestionJson { let sanitized: QuestionJson; try { if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error(); sanitized = sanitizeQuestionJson(input as QuestionJson); } catch { throw new PlatformError(400, 'INVALID_QUESTION_JSON'); } if (sanitized.contractVersion !== CONTRACT_VERSION) throw new PlatformError(400, 'UNSUPPORTED_CONTRACT_VERSION'); const validation = validate(sanitized); if (validation.errors.length) throw new PlatformError(400, 'INVALID_QUESTION_JSON', validation.errors); return sanitized; }
  private async getVersionAsync(id: number, version: number): Promise<VersionSnapshot | undefined> { const [rows] = await this.pool!.execute<any[]>('SELECT * FROM question_type_version WHERE question_type_id=? AND version=?', [id, version]); const row = rows[0]; return row ? { version: row.version, formJson: typeof row.form_json === 'string' ? JSON.parse(row.form_json) : row.form_json, contractVersion: row.contract_version, libVersion: row.lib_version, source: row.source } : undefined; }
  private async hydrate(row: any): Promise<QuestionTypeRecord | undefined> { if (!row) return undefined; const [versions] = await this.pool!.execute<any[]>('SELECT * FROM question_type_version WHERE question_type_id=? ORDER BY version', [row.id]); const map = new Map<number, VersionSnapshot>(versions.map((item) => [item.version, { version: item.version, formJson: typeof item.form_json === 'string' ? JSON.parse(item.form_json) : item.form_json, contractVersion: item.contract_version, libVersion: item.lib_version, source: item.source }])); return { id: Number(row.id), code: row.code, name: row.name, description: row.description, subject: row.subject, status: row.status, currentVersion: row.current_version, publishedVersion: row.published_version, versions: map }; }
}

export class PlatformError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, public readonly details?: unknown) {
    super(code);
  }
}
