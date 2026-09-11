import { readFileSync } from 'node:fs';

import {
  CONTRACT_VERSION,
  DEFAULT_FORM_CONFIG,
  isContainer,
  normalizeJson,
  widgetDefinitions,
  type QuestionJson,
  type WidgetNode,
} from '../src/contract';

interface InvalidFixture {
  name: string;
  expectedCodes: string[];
  json: unknown;
}

interface FixtureFile {
  valid: QuestionJson;
  invalid: InvalidFixture[];
}

export const fixtureFile = JSON.parse(
  readFileSync(new URL('./fixtures/validation-fixtures.json', import.meta.url), 'utf8'),
) as FixtureFile;

export function questionWithDefaultNode(type: string): QuestionJson {
  const definition = widgetDefinitions.find((item) => item.type === type);
  if (!definition) throw new Error(`Unknown fixture widget type: ${type}`);

  const node: WidgetNode = {
    type,
    id: `${type.replaceAll('-', '_')}_fixture`,
    options: structuredClone(definition.defaultOptions),
  };
  if (isContainer(type)) node.widgetList = [];

  const root: WidgetNode =
    type === 'page'
      ? node
      : { type: 'page', id: 'page_fixture', options: {}, widgetList: [node] };

  return normalizeJson({
    contractVersion: CONTRACT_VERSION,
    widgetList: [root],
    formConfig: structuredClone(DEFAULT_FORM_CONFIG),
  });
}
