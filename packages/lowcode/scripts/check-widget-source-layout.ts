import { readFile } from 'node:fs/promises';

const widgetFiles = new Map([
  ['page', 'page-container.tsx'],
  ['question-group', 'question-group-container.tsx'],
  ['stem', 'stem-widget.tsx'],
  ['image', 'image-widget.tsx'],
  ['divider', 'divider-widget.tsx'],
  ['single-choice', 'single-choice-widget.tsx'],
  ['multi-choice', 'multi-choice-widget.tsx'],
  ['judge', 'judge-widget.tsx'],
  ['fill-blank', 'fill-blank-widget.tsx'],
  ['essay', 'essay-widget.tsx'],
  ['form-input', 'form-input-widget.tsx'],
  ['form-textarea', 'form-textarea-widget.tsx'],
  ['form-select', 'form-select-widget.tsx'],
  ['form-radio', 'form-radio-widget.tsx'],
  ['form-checkbox', 'form-checkbox-widget.tsx'],
  ['form-switch', 'form-switch-widget.tsx'],
  ['form-date', 'form-date-widget.tsx'],
]);

for (const [type, file] of widgetFiles) {
  const source = await readFile(new URL(`../src/renderer/components/widgets/${file}`, import.meta.url), 'utf8');
  const exports = [...source.matchAll(/export function (\w+)/g)];
  if (exports.length !== 1) {
    throw new Error(`${type} 必须在 ${file} 中且该文件只能导出一个题型组件`);
  }
}

process.stdout.write(`${widgetFiles.size} widget source files passed.\n`);
