import type { QuestionJson } from '@exam/lowcode/contract';

export function hasContent(outline: QuestionJson): boolean {
  return outline.widgetList.some((node) => (node.type === 'page' ? (node.widgetList?.length ?? 0) > 0 : true));
}
