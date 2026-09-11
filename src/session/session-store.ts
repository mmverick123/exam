import { LRUCache } from 'lru-cache';

import type { AgentEvent } from '../application/state-machine';
import type { ConversationTurn } from '../providers';
import type { QuestionPatch } from '@exam/lowcode/contract';

export interface AgentSession { events: AgentEvent[]; updatedAt: number; turns: ConversationTurn[]; lastPatch?: QuestionPatch; requestCount: number; windowStartedAt: number; estimatedTokens: number; }
export const sessions = new LRUCache<string, AgentSession>({ max: 500, ttl: 1000 * 60 * 60 * 2 });

export function getSession(id: string): AgentSession {
  const now = Date.now();
  const existing = sessions.get(id);
  if (existing) {
    if (now - existing.windowStartedAt > 60_000) { existing.requestCount = 0; existing.windowStartedAt = now; }
    return existing;
  }
  const created: AgentSession = { events: [], updatedAt: now, turns: [], requestCount: 0, windowStartedAt: now, estimatedTokens: 0 };
  sessions.set(id, created);
  return created;
}

export function recordSession(id: string, events: AgentEvent[], message: string, patch?: QuestionPatch): void {
  const session = getSession(id);
  session.events = events.slice(-200);
  session.turns = [...session.turns, { role: 'user' as const, content: message }, ...(patch ? [{ role: 'assistant' as const, content: `已生成补丁：${patch.summary}` }] : [])].slice(-20);
  session.lastPatch = patch;
  session.updatedAt = Date.now();
  sessions.set(id, session);
}
