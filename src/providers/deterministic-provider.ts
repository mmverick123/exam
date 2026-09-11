import { getWidgetDefinition, type QuestionJson, type QuestionPatch, type ValidationIssue, type WidgetNode } from '@exam/lowcode/contract';

import { hasContent } from './shared';
import type { AgentProvider, IntentResult, PlanResult, ProviderContext } from './types';

function extractTopic(message: string): string {
  return message.match(/关于(.+?)(?:的|，|,|题|$)/)?.[1]?.trim() || '综合知识';
}

function optionCount(message: string): number {
  const match = message.match(/(\d+)\s*(?:个|道)?选项/);
  return Math.max(2, Math.min(8, Number(match?.[1] ?? 4)));
}

function firstPage(outline: QuestionJson): WidgetNode {
  const page = outline.widgetList.find((node) => node.type === 'page');
  if (!page) throw new Error('outline 缺少 page 根节点');
  return page;
}

interface LocatedNode { node: WidgetNode; parent: WidgetNode; index: number; }

function findLocated(nodes: WidgetNode[], predicate: (node: WidgetNode) => boolean, parent?: WidgetNode): LocatedNode[] {
  const found: LocatedNode[] = [];
  nodes.forEach((node, index) => {
    if (parent && predicate(node)) found.push({ node, parent, index });
    if (node.widgetList) found.push(...findLocated(node.widgetList, predicate, node));
  });
  return found;
}

function choiceNodes(outline: QuestionJson): LocatedNode[] {
  return findLocated(outline.widgetList, (node) => node.type === 'single-choice' || node.type === 'multi-choice');
}

function answerNodes(outline: QuestionJson): LocatedNode[] {
  return findLocated(outline.widgetList, (node) => Boolean(getWidgetDefinition(node.type)?.answerType));
}

function requestedIndex(message: string): number {
  if (/第二|第\s*2/.test(message)) return 1;
  if (/第三|第\s*3/.test(message)) return 2;
  return 0;
}

function choiceNode(type: 'single-choice' | 'multi-choice', topic: string, count: number, id = 'tmp_question'): WidgetNode {
  const definition = getWidgetDefinition(type)!;
  const values = Array.from({ length: count }, (_, index) => ({ label: `选项 ${String.fromCharCode(65 + index)}`, value: `model_${index}` }));
  return { type, id, options: { ...definition.defaultOptions, title: topic, name: type.replaceAll('-', '_'), optionItems: values, ...(type === 'single-choice' ? { correctAnswer: values[0]!.value } : {}) } };
}

export class DeterministicProvider implements AgentProvider {
  async intent(context: ProviderContext): Promise<IntentResult> {
    if (!/(题|选项|小问|材料|组合|新增|增加|改|修改|变成|生成)/.test(context.message)) return { kind: 'irrelevant' };
    return { kind: hasContent(context.outline) ? 'modify' : 'create' };
  }

  async plan(context: ProviderContext): Promise<PlanResult> {
    const selectedTypes = /材料|组合|子问/.test(context.message) ? ['question-group', 'stem', 'essay'] : context.message.includes('多选') ? ['multi-choice'] : ['stem', 'single-choice'];
    return { steps: [`使用${selectedTypes.join('、')}表达用户需求`], selectedTypes };
  }

  async generate(context: ProviderContext, plan: PlanResult): Promise<QuestionPatch> {
    const page = firstPage(context.outline);
    const choices = choiceNodes(context.outline);
    const selected = choices[requestedIndex(context.message)] ?? choices[0];

    if (/组合题.*(?:再|内|里).*(?:组合题|question-group)/i.test(context.message)) {
      const group = findLocated(context.outline.widgetList, (node) => node.type === 'question-group')[0];
      if (group) return { summary: '在组合题中嵌套组合题', ops: [{ op: 'insertChild', parentId: group.node.id, afterId: group.node.widgetList?.at(-1)?.id ?? null, node: { type: 'question-group', id: 'tmp_nested_group', options: {}, widgetList: [] } }] };
    }
    if (/材料|组合/.test(context.message) && /2\s*个子问|两(?:个|道)子问/.test(context.message)) {
      return { summary: '新增一道含两个子问的材料分析题', ops: [
        { op: 'insertChild', parentId: page.id, afterId: page.widgetList?.at(-1)?.id ?? null, node: { type: 'question-group', id: 'tmp_group', options: { title: '材料分析题' }, widgetList: [] } },
        { op: 'insertChild', parentId: 'tmp_group', afterId: null, node: { type: 'stem', id: 'tmp_material', options: { content: '<p>请阅读材料并回答问题。</p>' } } },
        { op: 'insertChild', parentId: 'tmp_group', afterId: 'tmp_material', node: { type: 'essay', id: 'tmp_sub_1', options: { title: '小问 1', name: 'essay' } } },
        { op: 'insertChild', parentId: 'tmp_group', afterId: 'tmp_sub_1', node: { type: 'essay', id: 'tmp_sub_2', options: { title: '小问 2', name: 'essay' } } },
      ] };
    }
    if (/删除|移除/.test(context.message) && selected) return { summary: `删除${selected.node.options.title || '选择题'}`, ops: [{ op: 'remove', targetId: selected.node.id }] };
    if (/倒过来|倒序|反转/.test(context.message) && selected && Array.isArray(selected.node.options.optionItems)) return { summary: '倒序排列选项', ops: [{ op: 'updateOptions', targetId: selected.node.id, options: { optionItems: structuredClone(selected.node.options.optionItems).reverse() } }] };
    if (/移动|移到|上移|下移/.test(context.message)) {
      const target = answerNodes(context.outline)[requestedIndex(context.message)] ?? answerNodes(context.outline).at(-1);
      if (target) {
        const siblings = (target.parent.widgetList ?? []).filter((node) => node.id !== target.node.id);
        return { summary: '移动小问', ops: [{ op: 'move', targetId: target.node.id, parentId: target.parent.id, afterId: /末尾|最后|下移/.test(context.message) ? siblings.at(-1)?.id ?? null : null }] };
      }
    }
    if (selected && /改成多选|变成多选/.test(context.message)) {
      const optionItems = Array.isArray(selected.node.options.optionItems) ? structuredClone(selected.node.options.optionItems) : [];
      if (/加|增加|新增/.test(context.message)) optionItems.push({ label: context.message.match(/[“'‘]([^”'’]+)[”'’]选项/)?.[1] ?? '新增选项', value: 'model_new' });
      const correct = selected.node.options.correctAnswer;
      return { summary: '将小问改为多选并补充选项', ops: [
        { op: 'remove', targetId: selected.node.id },
        { op: 'insertChild', parentId: selected.parent.id, afterId: selected.parent.widgetList?.[selected.index - 1]?.id ?? null, node: { type: 'multi-choice', id: 'tmp_multi', options: { ...selected.node.options, name: String(selected.node.options.name ?? 'multi_choice'), optionItems, ...(correct === undefined ? {} : { correctAnswer: Array.isArray(correct) ? correct : [correct] }) } } },
      ] };
    }
    if (selected && /加|增加|新增/.test(context.message) && context.message.includes('选项')) {
      const optionItems = Array.isArray(selected.node.options.optionItems) ? structuredClone(selected.node.options.optionItems) : [];
      optionItems.push({ label: context.message.match(/[“'‘]([^”'’]+)[”'’]选项/)?.[1] ?? '以上都不对', value: 'model_new' });
      return { summary: '增加一个选项', ops: [{ op: 'updateOptions', targetId: selected.node.id, options: { optionItems } }] };
    }
    const type = plan.selectedTypes.includes('multi-choice') ? 'multi-choice' : 'single-choice';
    return { summary: `新增一道${getWidgetDefinition(type)!.displayName}`, ops: [{ op: 'insertChild', parentId: page.id, afterId: page.widgetList?.at(-1)?.id ?? null, node: choiceNode(type, extractTopic(context.message), optionCount(context.message)) }] };
  }

  async repair(context: ProviderContext, _plan: PlanResult, _errors: ValidationIssue[]): Promise<QuestionPatch> {
    const page = firstPage(context.outline);
    return { summary: '降级为追加合法单选题', ops: [{ op: 'insertChild', parentId: page.id, afterId: page.widgetList?.at(-1)?.id ?? null, node: choiceNode('single-choice', extractTopic(context.message), 4, 'tmp_repaired') }] };
  }
}
