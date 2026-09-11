import { randomUUID } from 'node:crypto';

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

  create(input: CreateQuestionInput): QuestionTypeRecord {
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

  getById(id: number): QuestionTypeRecord | undefined {
    return this.records.get(id);
  }

  getByCode(code: string): QuestionTypeRecord | undefined {
    return [...this.records.values()].find((record) => record.code === code);
  }

  list(): QuestionTypeRecord[] {
    return [...this.records.values()];
  }

  saveVersion(record: QuestionTypeRecord, input: unknown, source: 0 | 1 | 2 = 0): VersionSnapshot {
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

  publish(record: QuestionTypeRecord, version: number): VersionSnapshot {
    const snapshot = record.versions.get(version);
    if (!snapshot) throw new PlatformError(404, 'VERSION_NOT_FOUND');
    const validation = validateForPublish(snapshot.formJson);
    if (!validation.valid) throw new PlatformError(400, 'PUBLISH_VALIDATION_FAILED', validation);
    record.publishedVersion = version;
    record.status = 1;
    return snapshot;
  }

  getPublished(record: QuestionTypeRecord): { version: number; json: QuestionJson } | undefined {
    if (record.publishedVersion === 0) return undefined;
    const snapshot = record.versions.get(record.publishedVersion);
    if (!snapshot) return undefined;
    return { version: snapshot.version, json: projectForExam(snapshot.formJson) };
  }

  validateAnswers(record: QuestionTypeRecord, version: number, answerData: unknown) {
    const snapshot = record.versions.get(version);
    if (!snapshot) throw new PlatformError(404, 'VERSION_NOT_FOUND');
    const result = validateAnswerData(snapshot.formJson, answerData);
    if (!result.valid) throw new PlatformError(400, 'INVALID_ANSWER_DATA', result);
    return result;
  }
}

export class PlatformError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, public readonly details?: unknown) {
    super(code);
  }
}
