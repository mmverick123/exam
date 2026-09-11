import type { AgentProvider } from './types';
import { AnthropicProvider } from './anthropic-provider';
import { DeterministicProvider } from './deterministic-provider';

export * from './types';
export * from './anthropic-provider';
export * from './deterministic-provider';

export function defaultProvider(): AgentProvider {
  return process.env.ANTHROPIC_API_KEY ? new AnthropicProvider() : new DeterministicProvider();
}
