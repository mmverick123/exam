import { describe, expect, it } from 'vitest';

import {
  deepEqualJson,
  normalizeJson,
  outlineForAgent,
  validate,
  widgetDefinitions,
} from '../src/contract';
import { fixtureFile, questionWithDefaultNode } from './helpers';

const validFixtures = [
  fixtureFile.valid,
  ...widgetDefinitions.map((definition) => questionWithDefaultNode(definition.type)),
];

describe('Step 1 contract invariants', () => {
  it('1. never strips required option keys from the Agent outline', () => {
    for (const definition of widgetDefinitions) {
      const outlined = outlineForAgent(questionWithDefaultNode(definition.type));
      const target =
        definition.type === 'page'
          ? outlined.widgetList[0]!
          : outlined.widgetList[0]!.widgetList![0]!;
      for (const key of definition.optionsSchema.required ?? []) {
        expect(target.options, `${definition.type}.${key}`).toHaveProperty(key);
      }
    }
  });

  it('2. makes every valid fixture reversible through outline + normalize', () => {
    for (const fixture of validFixtures) {
      expect(
        deepEqualJson(
          normalizeJson(outlineForAgent(fixture)),
          normalizeJson(fixture),
        ),
      ).toBe(true);
    }
  });

  it('3. keeps every valid Agent outline contract-valid', () => {
    for (const fixture of validFixtures) {
      expect(validate(outlineForAgent(fixture)).errors).toEqual([]);
    }
  });

  it('4. makes a complete QuestionJson built from every defaultOptions error-free', () => {
    for (const definition of widgetDefinitions) {
      expect(
        validate(questionWithDefaultNode(definition.type)).errors,
        definition.type,
      ).toEqual([]);
    }
  });

  it('5. aligns schema properties with defaults except design-only keys', () => {
    for (const definition of widgetDefinitions) {
      const schemaKeys = new Set(Object.keys(definition.optionsSchema.properties ?? {}));
      const defaultKeys = new Set(Object.keys(definition.defaultOptions));
      const designOnlyKeys = new Set(definition.designOnlyOptionKeys ?? []);

      expect(
        [...defaultKeys].filter((key) => !schemaKeys.has(key)),
        `${definition.type}: default-only keys`,
      ).toEqual([]);
      expect(
        [...schemaKeys].filter(
          (key) => !defaultKeys.has(key) && !designOnlyKeys.has(key),
        ),
        `${definition.type}: undeclared missing-default keys`,
      ).toEqual([]);
      expect(
        [...designOnlyKeys].filter((key) => !schemaKeys.has(key)),
        `${definition.type}: unknown design-only keys`,
      ).toEqual([]);
    }
  });

  it('preserves non-default style values in the outline', () => {
    const fixture = structuredClone(fixtureFile.valid);
    fixture.widgetList[0]!.widgetList![1]!.options.labelPosition = 'left';
    const outlined = outlineForAgent(fixture);
    expect(outlined.widgetList[0]!.widgetList![1]!.options.labelPosition).toBe('left');
  });
});
