import type { QuestionJson, WidgetNode } from '@exam/lowcode/contract';

export interface AgentNodeRef {
  id: string;
  type: string;
  label: string;
  path: string;
  parentId?: string;
}

function labelForNode(node: WidgetNode): string {
  const title = node.options.title;
  if (typeof title === 'string' && title.trim()) return title.trim();
  const name = node.options.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  const content = node.options.content;
  if (typeof content === 'string' && content.trim()) return content.replace(/<[^>]+>/g, '').trim().slice(0, 32);
  return node.type;
}

export function buildNodeRefs(json: QuestionJson): AgentNodeRef[] {
  const refs: AgentNodeRef[] = [];
  const walk = (nodes: WidgetNode[], path: string, parentId?: string): void => {
    nodes.forEach((node, index) => {
      const nodePath = `${path} / ${index + 1}. ${labelForNode(node)}`;
      refs.push({ id: node.id, type: node.type, label: labelForNode(node), path: nodePath, ...(parentId ? { parentId } : {}) });
      if (node.widgetList) walk(node.widgetList, nodePath, node.id);
    });
  };
  walk(json.widgetList, '题型');
  return refs;
}


export function summarizeRefs(json: QuestionJson): Array<{ id: string; type: string; label: string; path: string }> {
  return buildNodeRefs(json).map(({ id, type, label, path }) => ({ id, type, label, path }));
}
