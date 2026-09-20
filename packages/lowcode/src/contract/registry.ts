import type { JSONSchema, WidgetDefinition } from './types';

export const CONTRACT_VERSION = '1.0.0';

export const DEFAULT_FORM_CONFIG = {
  labelPosition: 'top',
  labelWidth: 100,
  size: 'default',
  layoutType: 'PC',
} as const;

const radio = (options: Array<{ label: string; value: string | boolean }>) => ({
  widget: 'radio-group' as const,
  options,
});

const titleProperty: JSONSchema = {
  type: 'string',
  'x-ui': { widget: 'input' },
};

const labelPositionProperty: JSONSchema = {
  type: 'string',
  enum: ['inherit', 'top', 'left'],
  'x-ui': radio([
    { label: '继承表单', value: 'inherit' },
    { label: '顶部', value: 'top' },
    { label: '左侧', value: 'left' },
  ]),
};

const commonAnswerProperties = (
  defaultValueSchema: JSONSchema,
): Record<string, JSONSchema> => ({
  title: titleProperty,
  name: {
    type: 'string',
    pattern: '^[a-zA-Z0-9_]+$',
    'x-ui': { widget: 'input' },
  },
  score: {
    type: 'number',
    minimum: 0,
    'x-ui': { widget: 'number', min: 0 },
  },
  defaultValue: {
    ...defaultValueSchema,
    'x-ui': { widget: 'hidden' },
  },
  labelPosition: labelPositionProperty,
});

const commonFormProperties = (
  defaultValueSchema: JSONSchema,
): Record<string, JSONSchema> => ({
  title: titleProperty,
  name: {
    type: 'string',
    pattern: '^[a-zA-Z0-9_]+$',
    'x-ui': { widget: 'input' },
  },
  defaultValue: {
    ...defaultValueSchema,
    'x-ui': { widget: 'hidden' },
  },
  labelPosition: labelPositionProperty,
});

const stringOrNull: JSONSchema = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
};

const stringArrayOrNull: JSONSchema = {
  anyOf: [
    { type: 'array', items: { type: 'string' } },
    { type: 'null' },
  ],
};

const booleanOrNull: JSONSchema = {
  anyOf: [{ type: 'boolean' }, { type: 'null' }],
};

const optionItemsProperty: JSONSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      label: { type: 'string' },
      value: { type: 'string' },
    },
    required: ['label', 'value'],
    additionalProperties: false,
  },
  'x-ui': { widget: 'option-editor' },
};

const optionsLayoutProperty = (defaultDirection: 'vertical' | 'horizontal'): JSONSchema => ({
  type: 'string',
  enum: ['vertical', 'horizontal'],
  description: `Default: ${defaultDirection}`,
  'x-ui': radio([
    { label: '纵向', value: 'vertical' },
    { label: '横向', value: 'horizontal' },
  ]),
});

const leafTypes = [
  'stem',
  'image',
  'divider',
  'single-choice',
  'multi-choice',
  'judge',
  'fill-blank',
  'essay',
] as const;

const formTypes = [
  'form-input',
  'form-textarea',
  'form-select',
  'form-radio',
  'form-checkbox',
  'form-switch',
  'form-date',
] as const;

const definitions = [
  {
    type: 'page',
    displayName: '页面',
    aiHint: '题型唯一根容器，由系统创建，不允许 Agent 生成。',
    componentType: 'CONTAINER',
    allowedChildTypes: ['question-group', ...leafTypes, ...formTypes],
    internal: true,
    agentExcluded: true,
    defaultOptions: {},
    optionsSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: 'question-group',
    displayName: '组合题',
    aiHint: '承载材料与多个子问；不可嵌套另一个组合题。',
    componentType: 'CONTAINER',
    allowedChildTypes: [...leafTypes],
    defaultOptions: {
      title: '',
      gap: 16,
    },
    optionsSchema: {
      type: 'object',
      properties: {
        title: titleProperty,
        gap: {
          type: 'number',
          minimum: 4,
          maximum: 48,
          'x-ui': { widget: 'number', min: 4, max: 48 },
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'stem',
    displayName: '题干',
    aiHint: '题干或材料正文，content 为经过白名单消毒的 HTML。',
    componentType: 'DISPLAY_COMPONENT',
    defaultOptions: {
      title: '',
      content: '<p></p>',
      align: 'left',
    },
    optionsSchema: {
      type: 'object',
      properties: {
        title: titleProperty,
        content: { type: 'string', 'x-ui': { widget: 'richtext' } },
        align: {
          type: 'string',
          enum: ['left', 'center'],
          'x-ui': radio([
            { label: '左对齐', value: 'left' },
            { label: '居中', value: 'center' },
          ]),
        },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
  {
    type: 'image',
    displayName: '图片',
    aiHint: '人工配置的 HTTPS 外链图片，Agent 不得生成。',
    componentType: 'DISPLAY_COMPONENT',
    agentExcluded: true,
    defaultOptions: {
      title: '',
      src: '',
      alt: '',
      width: 100,
      align: 'center',
    },
    optionsSchema: {
      type: 'object',
      properties: {
        title: titleProperty,
        src: { type: 'string', pattern: '^$|^https://', 'x-ui': { widget: 'url' } },
        alt: { type: 'string', 'x-ui': { widget: 'input' } },
        width: {
          type: 'number',
          minimum: 10,
          maximum: 100,
          'x-ui': { widget: 'number', min: 10, max: 100 },
        },
        align: {
          type: 'string',
          enum: ['left', 'center'],
          'x-ui': radio([
            { label: '左对齐', value: 'left' },
            { label: '居中', value: 'center' },
          ]),
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'divider',
    displayName: '分割线',
    aiHint: '用于分隔题目内容，可通过 title 显示居中文字。',
    componentType: 'DISPLAY_COMPONENT',
    defaultOptions: {
      title: '',
      dashed: false,
      marginY: 12,
    },
    optionsSchema: {
      type: 'object',
      properties: {
        title: titleProperty,
        dashed: { type: 'boolean', 'x-ui': { widget: 'switch' } },
        marginY: {
          type: 'number',
          minimum: 0,
          maximum: 64,
          'x-ui': { widget: 'number', min: 0, max: 64 },
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'single-choice',
    displayName: '单选题',
    aiHint: '考生只能选择一个选项；optionItems 的 value 是不可变标识。',
    componentType: 'ANSWER_COMPONENT',
    answerType: 'string',
    designOnlyOptionKeys: ['correctAnswer'],
    defaultOptions: {
      title: '',
      name: 'single_choice',
      score: 0,
      defaultValue: null,
      labelPosition: 'inherit',
      optionItems: [],
      optionsLayout: 'vertical',
    },
    optionsSchema: {
      type: 'object',
      properties: {
        ...commonAnswerProperties(stringOrNull),
        optionItems: optionItemsProperty,
        correctAnswer: {
          type: 'string',
          'x-ui': { widget: 'answer-select', optionsFrom: 'optionItems' },
        },
        optionsLayout: optionsLayoutProperty('vertical'),
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'multi-choice',
    displayName: '多选题',
    aiHint: '考生可选择多个选项；optionItems 的 value 是不可变标识。',
    componentType: 'ANSWER_COMPONENT',
    answerType: 'string[]',
    designOnlyOptionKeys: ['correctAnswer'],
    defaultOptions: {
      title: '',
      name: 'multi_choice',
      score: 0,
      defaultValue: null,
      labelPosition: 'inherit',
      optionItems: [],
      optionsLayout: 'vertical',
    },
    optionsSchema: {
      type: 'object',
      properties: {
        ...commonAnswerProperties(stringArrayOrNull),
        optionItems: optionItemsProperty,
        correctAnswer: {
          type: 'array',
          items: { type: 'string' },
          'x-ui': {
            widget: 'answer-select',
            optionsFrom: 'optionItems',
            multiple: true,
          },
        },
        optionsLayout: optionsLayoutProperty('vertical'),
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'judge',
    displayName: '判断题',
    aiHint: '答案为布尔值，true/false 的显示文案可以配置。',
    componentType: 'ANSWER_COMPONENT',
    answerType: 'boolean',
    designOnlyOptionKeys: ['correctAnswer'],
    defaultOptions: {
      title: '',
      name: 'judge',
      score: 0,
      defaultValue: null,
      labelPosition: 'inherit',
      trueLabel: '正确',
      falseLabel: '错误',
      optionsLayout: 'horizontal',
    },
    optionsSchema: {
      type: 'object',
      properties: {
        ...commonAnswerProperties(booleanOrNull),
        trueLabel: { type: 'string', 'x-ui': { widget: 'input' } },
        falseLabel: { type: 'string', 'x-ui': { widget: 'input' } },
        correctAnswer: {
          type: 'boolean',
          'x-ui': radio([
            { label: '正确', value: true },
            { label: '错误', value: false },
          ]),
        },
        optionsLayout: optionsLayoutProperty('horizontal'),
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'fill-blank',
    displayName: '填空题',
    aiHint: '单行文本答案，可配置最大长度与标准答案。',
    componentType: 'ANSWER_COMPONENT',
    answerType: 'string',
    designOnlyOptionKeys: ['correctAnswer'],
    defaultOptions: {
      title: '',
      name: 'fill_blank',
      score: 0,
      defaultValue: null,
      labelPosition: 'inherit',
      maxLength: 200,
      placeholder: '',
      width: 240,
    },
    optionsSchema: {
      type: 'object',
      properties: {
        ...commonAnswerProperties(stringOrNull),
        maxLength: {
          type: 'number',
          minimum: 1,
          maximum: 1000,
          'x-ui': { widget: 'number', min: 1, max: 1000 },
        },
        placeholder: { type: 'string', 'x-ui': { widget: 'input' } },
        correctAnswer: { type: 'string', 'x-ui': { widget: 'input' } },
        width: {
          type: 'number',
          minimum: 80,
          maximum: 600,
          'x-ui': { widget: 'number', min: 80, max: 600 },
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'essay',
    displayName: '主观题',
    aiHint: '多行主观文本答案，不配置标准答案。',
    componentType: 'ANSWER_COMPONENT',
    answerType: 'string',
    designOnlyOptionKeys: [],
    defaultOptions: {
      title: '',
      name: 'essay',
      score: 0,
      defaultValue: null,
      labelPosition: 'inherit',
      minLength: 0,
      maxLength: 2000,
      placeholder: '',
      rows: 6,
    },
    optionsSchema: {
      type: 'object',
      properties: {
        ...commonAnswerProperties(stringOrNull),
        minLength: {
          type: 'number',
          minimum: 0,
          maximum: 1000,
          'x-ui': { widget: 'number', min: 0, max: 1000 },
        },
        maxLength: {
          type: 'number',
          minimum: 1,
          maximum: 10000,
          'x-ui': { widget: 'number', min: 1, max: 10000 },
        },
        placeholder: { type: 'string', 'x-ui': { widget: 'input' } },
        rows: {
          type: 'number',
          minimum: 2,
          maximum: 20,
          'x-ui': { widget: 'number', min: 2, max: 20 },
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'form-input',
    displayName: '单行输入',
    aiHint: '问卷中的单行文本输入项，适合姓名、邮箱、电话等短文本。',
    libraryGroup: 'form',
    componentType: 'ANSWER_COMPONENT',
    answerType: 'string',
    defaultOptions: {
      title: '',
      name: 'text_input',
      defaultValue: null,
      labelPosition: 'inherit',
      placeholder: '请输入',
      maxLength: 200,
      width: 420,
    },
    optionsSchema: {
      type: 'object',
      properties: {
        ...commonFormProperties(stringOrNull),
        placeholder: { type: 'string', 'x-ui': { widget: 'input' } },
        maxLength: { type: 'number', minimum: 1, maximum: 2000, 'x-ui': { widget: 'number', min: 1, max: 2000 } },
        width: { type: 'number', minimum: 120, maximum: 720, 'x-ui': { widget: 'number', min: 120, max: 720 } },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'form-textarea',
    displayName: '多行输入',
    aiHint: '问卷中的多行文本输入项，适合意见、建议和详细描述。',
    libraryGroup: 'form',
    componentType: 'ANSWER_COMPONENT',
    answerType: 'string',
    defaultOptions: {
      title: '',
      name: 'textarea',
      defaultValue: null,
      labelPosition: 'inherit',
      placeholder: '请输入',
      maxLength: 2000,
      rows: 5,
    },
    optionsSchema: {
      type: 'object',
      properties: {
        ...commonFormProperties(stringOrNull),
        placeholder: { type: 'string', 'x-ui': { widget: 'input' } },
        maxLength: { type: 'number', minimum: 1, maximum: 10000, 'x-ui': { widget: 'number', min: 1, max: 10000 } },
        rows: { type: 'number', minimum: 2, maximum: 16, 'x-ui': { widget: 'number', min: 2, max: 16 } },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'form-select',
    displayName: '下拉选择',
    aiHint: '问卷中的单项下拉选择，选项 value 是不可变标识。',
    libraryGroup: 'form',
    componentType: 'ANSWER_COMPONENT',
    answerType: 'string',
    defaultOptions: {
      title: '',
      name: 'select',
      defaultValue: null,
      labelPosition: 'inherit',
      optionItems: [],
      placeholder: '请选择',
      width: 280,
    },
    optionsSchema: {
      type: 'object',
      properties: {
        ...commonFormProperties(stringOrNull),
        optionItems: optionItemsProperty,
        placeholder: { type: 'string', 'x-ui': { widget: 'input' } },
        width: { type: 'number', minimum: 120, maximum: 720, 'x-ui': { widget: 'number', min: 120, max: 720 } },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'form-radio',
    displayName: '单选项',
    aiHint: '问卷中的单项选择，适合满意度、类型和偏好等互斥选项。',
    libraryGroup: 'form',
    componentType: 'ANSWER_COMPONENT',
    answerType: 'string',
    defaultOptions: {
      title: '',
      name: 'radio',
      defaultValue: null,
      labelPosition: 'inherit',
      optionItems: [],
      optionsLayout: 'vertical',
    },
    optionsSchema: {
      type: 'object',
      properties: {
        ...commonFormProperties(stringOrNull),
        optionItems: optionItemsProperty,
        optionsLayout: optionsLayoutProperty('vertical'),
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'form-checkbox',
    displayName: '多选项',
    aiHint: '问卷中的多项选择，适合兴趣、技能和可接受条件等非互斥选项。',
    libraryGroup: 'form',
    componentType: 'ANSWER_COMPONENT',
    answerType: 'string[]',
    defaultOptions: {
      title: '',
      name: 'checkbox',
      defaultValue: null,
      labelPosition: 'inherit',
      optionItems: [],
      optionsLayout: 'vertical',
    },
    optionsSchema: {
      type: 'object',
      properties: {
        ...commonFormProperties(stringArrayOrNull),
        optionItems: optionItemsProperty,
        optionsLayout: optionsLayoutProperty('vertical'),
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'form-switch',
    displayName: '开关',
    aiHint: '问卷中的二值开关，适合是否同意、是否订阅等问题。',
    libraryGroup: 'form',
    componentType: 'ANSWER_COMPONENT',
    answerType: 'boolean',
    defaultOptions: {
      title: '',
      name: 'switch',
      defaultValue: null,
      labelPosition: 'inherit',
      activeLabel: '是',
      inactiveLabel: '否',
    },
    optionsSchema: {
      type: 'object',
      properties: {
        ...commonFormProperties(booleanOrNull),
        activeLabel: { type: 'string', 'x-ui': { widget: 'input' } },
        inactiveLabel: { type: 'string', 'x-ui': { widget: 'input' } },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'form-date',
    displayName: '日期选择',
    aiHint: '问卷中的日期选择，答案使用 YYYY-MM-DD 字符串。',
    libraryGroup: 'form',
    componentType: 'ANSWER_COMPONENT',
    answerType: 'string',
    defaultOptions: {
      title: '',
      name: 'date',
      defaultValue: null,
      labelPosition: 'inherit',
      placeholder: '请选择日期',
      width: 220,
    },
    optionsSchema: {
      type: 'object',
      properties: {
        ...commonFormProperties(stringOrNull),
        placeholder: { type: 'string', 'x-ui': { widget: 'input' } },
        width: { type: 'number', minimum: 120, maximum: 420, 'x-ui': { widget: 'number', min: 120, max: 420 } },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
] as const satisfies readonly WidgetDefinition[];

export const registry: Readonly<Record<string, WidgetDefinition>> = Object.freeze(
  Object.fromEntries(definitions.map((definition) => [definition.type, definition])),
);

export const widgetDefinitions: readonly WidgetDefinition[] = definitions;

export const formConfigSchema: JSONSchema = {
  type: 'object',
  properties: {
    labelPosition: {
      type: 'string',
      enum: ['top', 'left'],
      'x-ui': radio([
        { label: '顶部', value: 'top' },
        { label: '左侧', value: 'left' },
      ]),
    },
    labelWidth: {
      type: 'number',
      minimum: 60,
      maximum: 300,
      'x-ui': { widget: 'number', min: 60, max: 300 },
    },
    size: {
      type: 'string',
      enum: ['default', 'small', 'large'],
      'x-ui': {
        widget: 'select',
        options: [
          { label: '默认', value: 'default' },
          { label: '小', value: 'small' },
          { label: '大', value: 'large' },
        ],
      },
    },
    layoutType: {
      type: 'string',
      enum: ['PC', 'H5'],
      'x-ui': radio([
        { label: 'PC', value: 'PC' },
        { label: 'H5', value: 'H5' },
      ]),
    },
  },
  required: ['labelPosition', 'labelWidth', 'size', 'layoutType'],
  additionalProperties: false,
};

export const SANITIZE_CONFIG = Object.freeze({
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'sub',
    'sup',
    'ul',
    'ol',
    'li',
    'blockquote',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  ALLOWED_ATTR: ['colspan', 'rowspan'],
});

export function getWidgetDefinition(type: string): WidgetDefinition | undefined {
  return registry[type];
}

export function isContainer(type: string): boolean {
  return registry[type]?.componentType === 'CONTAINER';
}

export function isFormItem(type: string): boolean {
  return registry[type]?.componentType === 'ANSWER_COMPONENT';
}

export const isAnswerNode = isFormItem;
