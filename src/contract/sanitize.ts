import { SANITIZE_CONFIG } from './registry';
import type { QuestionJson, WidgetNode } from './types';

const allowedTags = new Set(SANITIZE_CONFIG.ALLOWED_TAGS);
const allowedAttrs = new Set(SANITIZE_CONFIG.ALLOWED_ATTR);

/** Dependency-free HTML sanitizer used at write time and by the renderer fallback. */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (full, rawTag: string, rawAttrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!allowedTags.has(tag)) return '';
      if (full.startsWith('</')) return `</${tag}>`;
      const attrs = [...rawAttrs.matchAll(/([:\w-]+)\s*=\s*(["'][^"']*["']|[^\s>]+)/g)]
        .filter((match) => allowedAttrs.has(match[1]!.toLowerCase()))
        .map((match) => ` ${match[1]}="${match[2]!.replace(/^['"]|['"]$/g, '')}"`)
        .join('');
      return `<${tag}${attrs}>`;
    })
    .replace(/\s(on[a-z]+)\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi, '')
    .replace(/(?:href|src)\s*=\s*(['"]?)\s*javascript:[^\s>]*\1/gi, '');
}

function sanitizeNode(node: WidgetNode): WidgetNode {
  const next = structuredClone(node);
  if (next.type === 'stem' && typeof next.options.content === 'string') {
    next.options.content = sanitizeHtml(next.options.content);
  }
  if (next.widgetList !== undefined) next.widgetList = next.widgetList.map(sanitizeNode);
  return next;
}

export function sanitizeQuestionJson(json: QuestionJson): QuestionJson {
  return {
    contractVersion: json.contractVersion,
    widgetList: json.widgetList.map(sanitizeNode),
    formConfig: structuredClone(json.formConfig),
  };
}
