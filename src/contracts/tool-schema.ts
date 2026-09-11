import type { JSONSchema } from '@exam/lowcode/contract';
import { z } from 'zod';

import type { ContractAdapter } from './bundles';

export const patchInputSchema = z.object({
  summary: z.string(),
  ops: z.array(z.discriminatedUnion('op', [
    z.object({ op: z.literal('insertChild'), parentId: z.string(), afterId: z.string().nullable(), node: z.record(z.unknown()) }),
    z.object({ op: z.literal('remove'), targetId: z.string() }),
    z.object({ op: z.literal('updateOptions'), targetId: z.string(), options: z.record(z.unknown()) }),
    z.object({ op: z.literal('move'), targetId: z.string(), parentId: z.string(), afterId: z.string().nullable() }),
  ])),
});

const strictObject = (properties: Record<string, unknown>, required: string[]): JSONSchema => ({
  type: 'object', properties: properties as Record<string, JSONSchema>, required, additionalProperties: false,
});

export function buildEmitPatchToolSchema(adapter: ContractAdapter, selectedTypes: string[]): JSONSchema {
  const nodeSchemas = selectedTypes
    .map((type) => adapter.optionsSchema(type))
    .filter((schema): schema is JSONSchema => Boolean(schema))
    .map((optionsSchema, index) => {
      const type = selectedTypes[index]!;
      const properties: Record<string, unknown> = {
        type: { const: type },
        id: { type: 'string' },
        options: optionsSchema,
      };
      if (adapter.isContainer(type)) {
        properties.widgetList = { type: 'array', items: { type: 'object' } };
      }
      return strictObject(properties, adapter.isContainer(type) ? ['type', 'id', 'options', 'widgetList'] : ['type', 'id', 'options']);
    });

  const insert = strictObject({
    op: { const: 'insertChild' }, parentId: { type: 'string' }, afterId: { type: ['string', 'null'] },
    node: { oneOf: nodeSchemas },
  }, ['op', 'parentId', 'afterId', 'node']);
  const remove = strictObject({ op: { const: 'remove' }, targetId: { type: 'string' } }, ['op', 'targetId']);
  const update = strictObject({ op: { const: 'updateOptions' }, targetId: { type: 'string' }, options: { type: 'object', additionalProperties: true } }, ['op', 'targetId', 'options']);
  const move = strictObject({ op: { const: 'move' }, targetId: { type: 'string' }, parentId: { type: 'string' }, afterId: { type: ['string', 'null'] } }, ['op', 'targetId', 'parentId', 'afterId']);
  return strictObject({ summary: { type: 'string' }, ops: { type: 'array', items: { oneOf: [insert, remove, update, move] } } }, ['summary', 'ops']);
}
