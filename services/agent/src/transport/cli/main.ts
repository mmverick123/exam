import { CONTRACT_VERSION, DEFAULT_FORM_CONFIG, type QuestionJson } from '@exam/lowcode/contract';

import '../../config/load-env';
import { runAgent } from '../../application/state-machine';

const message = process.argv.slice(2).join(' ') || '出一道关于光合作用的单选题，4 个选项';
const outline: QuestionJson = {
  contractVersion: CONTRACT_VERSION,
  widgetList: [{ type: 'page', id: 'page_cli', options: {}, widgetList: [] }],
  formConfig: { ...DEFAULT_FORM_CONFIG },
};

const result = await runAgent({ message, contractVersion: CONTRACT_VERSION, questionOutline: outline });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
