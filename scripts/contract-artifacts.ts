import { readFile } from 'node:fs/promises';

import {
  CONTRACT_VERSION,
  formConfigSchema,
  widgetDefinitions,
} from '../src/contract/registry';

function nodeSchema(type: string, container: boolean): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    type: { const: type },
    id: { type: 'string', minLength: 1 },
    options: { $ref: `#/$defs/${type}Options` },
  };
  const required = ['type', 'id', 'options'];
  if (container) {
    properties.widgetList = {
      type: 'array',
      items: { oneOf: widgetDefinitions.map((item) => ({ $ref: `#/$defs/${item.type}Node` })) },
    };
    required.push('widgetList');
  }
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

export async function createContractArtifacts(): Promise<Record<string, unknown>> {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string };

  const widgets = widgetDefinitions.map((definition) => ({
    type: definition.type,
    displayName: definition.displayName,
    aiHint: definition.aiHint,
    componentType: definition.componentType,
    ...(definition.allowedChildTypes
      ? { allowedChildTypes: definition.allowedChildTypes }
      : {}),
    ...(definition.internal !== undefined ? { internal: definition.internal } : {}),
    ...(definition.agentExcluded !== undefined
      ? { agentExcluded: definition.agentExcluded }
      : {}),
    ...(definition.answerType ? { answerType: definition.answerType } : {}),
    ...(definition.designOnlyOptionKeys
      ? { designOnlyOptionKeys: definition.designOnlyOptionKeys }
      : {}),
    defaultOptions: definition.defaultOptions,
  }));

  const $defs = Object.fromEntries(
    widgetDefinitions.flatMap((definition) => [
      [`${definition.type}Options`, definition.optionsSchema],
      [
        `${definition.type}Node`,
        nodeSchema(definition.type, definition.componentType === 'CONTAINER'),
      ],
    ]),
  );

  const questionJsonSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://exam.local/contracts/question-json/${CONTRACT_VERSION}`,
    type: 'object',
    properties: {
      contractVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
      widgetList: {
        type: 'array',
        minItems: 1,
        maxItems: 1,
        items: { $ref: '#/$defs/pageNode' },
      },
      formConfig: { $ref: '#/$defs/formConfig' },
    },
    required: ['contractVersion', 'widgetList', 'formConfig'],
    additionalProperties: false,
    $defs: { formConfig: formConfigSchema, ...$defs },
  };

  return {
    widgets: { contractVersion: CONTRACT_VERSION, widgets },
    schema: {
      contractVersion: CONTRACT_VERSION,
      formConfigSchema,
      optionsSchemas: Object.fromEntries(
        widgetDefinitions.map((definition) => [definition.type, definition.optionsSchema]),
      ),
      questionJsonSchema,
    },
    version: {
      contractVersion: CONTRACT_VERSION,
      libVersion: packageJson.version,
    },
  };
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
