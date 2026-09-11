import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';

import {
  formConfigSchema,
  getWidgetDefinition,
  isContainer,
  isFormItem,
  widgetDefinitions,
} from './registry';
import type {
  AnswerType,
  JSONSchema,
  ValidationIssue,
  ValidationResult,
  ValidationSeverity,
  WidgetDefinition,
} from './types';

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const NAME_PATTERN = /^[a-zA-Z0-9_]+$/;

const ajv = new Ajv({ allErrors: true, strict: false });
const optionValidators = new Map<string, ValidateFunction>(
  widgetDefinitions.map((definition) => [
    definition.type,
    ajv.compile(definition.optionsSchema as object),
  ]),
);
const validateFormConfig = ajv.compile(formConfigSchema as object);

function issue(
  code: string,
  path: string,
  message: string,
  severity: ValidationSeverity = 'error',
): ValidationIssue {
  return { code, path, message, severity };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function appendSchemaErrors(
  errors: ValidationIssue[],
  code: string,
  basePath: string,
  schemaErrors: ErrorObject[] | null | undefined,
): void {
  for (const schemaError of schemaErrors ?? []) {
    const suffix = schemaError.instancePath || '';
    errors.push(
      issue(
        code,
        `${basePath}${suffix}`,
        schemaError.message ?? '不符合 JSON Schema',
      ),
    );
  }
}

function matchesAnswerType(value: unknown, answerType: AnswerType): boolean {
  if (answerType === 'string') return typeof value === 'string';
  if (answerType === 'boolean') return typeof value === 'boolean';
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function schemaDeclares(definition: WidgetDefinition, key: string): boolean {
  return Object.hasOwn(definition.optionsSchema.properties ?? {}, key);
}

interface TraversalState {
  ids: Set<string>;
  names: Set<string>;
  answerCount: number;
  totalScore: number;
}

function traverseNode(
  node: unknown,
  path: string,
  parentDefinition: WidgetDefinition | undefined,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  state: TraversalState,
): void {
  if (!isRecord(node)) {
    errors.push(issue('NODE_INVALID', path, '节点必须是对象'));
    return;
  }

  const type = node.type;
  if (typeof type !== 'string') {
    errors.push(issue('NODE_TYPE_MISSING', `${path}/type`, '节点 type 必须是字符串'));
    return;
  }

  const definition = getWidgetDefinition(type);
  if (!definition) {
    errors.push(issue('UNKNOWN_WIDGET_TYPE', `${path}/type`, `未注册的组件类型：${type}`));
  }

  if (
    parentDefinition?.allowedChildTypes &&
    !parentDefinition.allowedChildTypes.includes(type)
  ) {
    errors.push(
      issue(
        'CHILD_TYPE_NOT_ALLOWED',
        `${path}/type`,
        `${type} 不允许放入 ${parentDefinition.type}`,
      ),
    );
  }

  const id = node.id;
  if (typeof id !== 'string' || id.length === 0) {
    errors.push(issue('NODE_ID_MISSING', `${path}/id`, '节点 id 不能为空'));
  } else if (state.ids.has(id)) {
    errors.push(issue('NODE_ID_DUPLICATE', `${path}/id`, `节点 id 重复：${id}`));
  } else {
    state.ids.add(id);
  }

  const options = node.options;
  if (!isRecord(options)) {
    errors.push(issue('OPTIONS_INVALID', `${path}/options`, '节点 options 必须是对象'));
  } else if (definition) {
    const optionsValidator = optionValidators.get(type);
    if (optionsValidator && !optionsValidator(options)) {
      appendSchemaErrors(
        errors,
        'OPTIONS_SCHEMA',
        `${path}/options`,
        optionsValidator.errors,
      );
    }

    if (isFormItem(type)) {
      state.answerCount += 1;
      const name = options.name;
      if (typeof name !== 'string' || name.length === 0) {
        errors.push(issue('ANSWER_NAME_MISSING', `${path}/options/name`, '答案组件 name 不能为空'));
      } else {
        if (!NAME_PATTERN.test(name)) {
          errors.push(
            issue('ANSWER_NAME_FORMAT', `${path}/options/name`, `答案 key 格式非法：${name}`),
          );
        }
        if (state.names.has(name)) {
          errors.push(
            issue('ANSWER_NAME_DUPLICATE', `${path}/options/name`, `答案 key 重复：${name}`),
          );
        } else {
          state.names.add(name);
        }
      }

      if (typeof options.score === 'number') state.totalScore += options.score;
      if (
        options.defaultValue !== undefined &&
        options.defaultValue !== null &&
        definition.answerType &&
        !matchesAnswerType(options.defaultValue, definition.answerType)
      ) {
        errors.push(
          issue(
            'DEFAULT_VALUE_TYPE',
            `${path}/options/defaultValue`,
            `defaultValue 与 ${definition.answerType} 答案类型不符`,
          ),
        );
      }
    }

    if (schemaDeclares(definition, 'optionItems') && Array.isArray(options.optionItems)) {
      const values = new Set<string>();
      for (const [index, item] of options.optionItems.entries()) {
        if (!isRecord(item) || typeof item.value !== 'string') continue;
        if (values.has(item.value)) {
          errors.push(
            issue(
              'OPTION_VALUE_DUPLICATE',
              `${path}/options/optionItems/${index}/value`,
              `同一节点的选项 value 重复：${item.value}`,
            ),
          );
        }
        values.add(item.value);
      }

      if (options.optionItems.length < 2) {
        warnings.push(
          issue(
            'OPTION_ITEMS_TOO_FEW',
            `${path}/options/optionItems`,
            '选择题至少需要两个选项',
            'warn-block',
          ),
        );
      }

      if (schemaDeclares(definition, 'correctAnswer')) {
        if (options.correctAnswer === undefined) {
          warnings.push(
            issue(
              'CORRECT_ANSWER_MISSING',
              `${path}/options/correctAnswer`,
              '尚未设置标准答案',
              'warn-pass',
            ),
          );
        } else {
          const allowedValues = new Set(
            options.optionItems
              .filter(isRecord)
              .map((item) => item.value)
              .filter((value): value is string => typeof value === 'string'),
          );
          const answers = Array.isArray(options.correctAnswer)
            ? options.correctAnswer
            : [options.correctAnswer];
          for (const answer of answers) {
            if (typeof answer === 'string' && !allowedValues.has(answer)) {
              warnings.push(
                issue(
                  'CORRECT_ANSWER_OUT_OF_RANGE',
                  `${path}/options/correctAnswer`,
                  `标准答案不在选项取值域内：${answer}`,
                  'warn-block',
                ),
              );
            }
          }
        }
      }
    } else if (
      schemaDeclares(definition, 'correctAnswer') &&
      options.correctAnswer === undefined
    ) {
      warnings.push(
        issue(
          'CORRECT_ANSWER_MISSING',
          `${path}/options/correctAnswer`,
          '尚未设置标准答案',
          'warn-pass',
        ),
      );
    }

    if (type === 'image' && options.src === '') {
      warnings.push(
        issue('IMAGE_SRC_EMPTY', `${path}/options/src`, '图片地址不能为空', 'warn-block'),
      );
    }
  }

  const children = node.widgetList;
  if (definition && isContainer(type)) {
    if (!Array.isArray(children)) {
      errors.push(
        issue('CONTAINER_CHILDREN_MISSING', `${path}/widgetList`, '容器必须包含 widgetList 数组'),
      );
      return;
    }
    children.forEach((child, index) =>
      traverseNode(child, `${path}/widgetList/${index}`, definition, errors, warnings, state),
    );
  } else if (children !== undefined) {
    errors.push(
      issue('LEAF_HAS_CHILDREN', `${path}/widgetList`, '非容器节点不得包含 widgetList'),
    );
  }
}

function precheck(input: unknown): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return [issue('QUESTION_JSON_INVALID', '', 'QuestionJson 必须是对象')];
  }
  if (
    typeof input.contractVersion !== 'string' ||
    !SEMVER_PATTERN.test(input.contractVersion)
  ) {
    errors.push(
      issue(
        'CONTRACT_VERSION_INVALID',
        '/contractVersion',
        'contractVersion 缺失或格式非法，应为 x.y.z',
      ),
    );
  }
  if (!Array.isArray(input.widgetList)) {
    errors.push(issue('WIDGET_LIST_INVALID', '/widgetList', '顶层 widgetList 必须是数组'));
  }
  if (!isRecord(input.formConfig)) {
    errors.push(issue('FORM_CONFIG_INVALID', '/formConfig', '顶层 formConfig 必须是对象'));
  }
  return errors;
}

export function validate(input: unknown): ValidationResult {
  const errors = precheck(input);
  const warnings: ValidationIssue[] = [];
  if (errors.length > 0 || !isRecord(input)) {
    return { valid: false, errors, warnings };
  }

  const widgetList = input.widgetList as unknown[];
  const formConfig = input.formConfig as Record<string, unknown>;
  if (!validateFormConfig(formConfig)) {
    appendSchemaErrors(errors, 'FORM_CONFIG_SCHEMA', '/formConfig', validateFormConfig.errors);
  }

  if (
    widgetList.length !== 1 ||
    !isRecord(widgetList[0]) ||
    widgetList[0].type !== 'page'
  ) {
    errors.push(issue('ROOT_PAGE_INVALID', '/widgetList', '根节点必须且只能有一个 page'));
  }

  const state: TraversalState = {
    ids: new Set(),
    names: new Set(),
    answerCount: 0,
    totalScore: 0,
  };
  widgetList.forEach((node, index) =>
    traverseNode(node, `/widgetList/${index}`, undefined, errors, warnings, state),
  );

  if (state.answerCount === 0) {
    warnings.push(
      issue('NO_ANSWER_COMPONENT', '/widgetList', '题型中没有答案组件', 'warn-block'),
    );
  }
  if (state.totalScore === 0) {
    warnings.push(issue('TOTAL_SCORE_ZERO', '/widgetList', '题型总分为 0', 'warn-pass'));
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateForPublish(input: unknown): ValidationResult {
  const result = validate(input);
  return {
    ...result,
    valid:
      result.errors.length === 0 &&
      result.warnings.every((warning) => warning.severity !== 'warn-block'),
  };
}

export function compileOptionsSchema(schema: JSONSchema): ValidateFunction {
  return ajv.compile(schema as object);
}
