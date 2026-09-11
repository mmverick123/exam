import '../../config/load-env';

function secret(name: 'EXAM_PLATFORM_TOKEN' | 'AGENT_SERVICE_TOKEN', testFallback: string): string {
  const value = process.env[name] ?? (process.env.NODE_ENV === 'test' ? testFallback : undefined);
  if (!value) throw new Error(`${name} 未配置，请写入 exam-platform/.env.local`);
  return value;
}

export const PLATFORM_TOKEN = secret('EXAM_PLATFORM_TOKEN', 'dev-token');
export const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL ?? 'http://127.0.0.1:3001';
export const AGENT_SERVICE_TOKEN = secret('AGENT_SERVICE_TOKEN', 'agent-dev-token');

export interface PlatformServerOptions {
  agentUrl?: string;
  agentToken?: string;
  fetchImpl?: typeof fetch;
}
