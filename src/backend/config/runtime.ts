export const PLATFORM_TOKEN = process.env.EXAM_PLATFORM_TOKEN ?? 'dev-token';
export const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL ?? 'http://127.0.0.1:3001';
export const AGENT_SERVICE_TOKEN = process.env.AGENT_SERVICE_TOKEN ?? 'agent-dev-token';

export interface PlatformServerOptions {
  agentUrl?: string;
  agentToken?: string;
  fetchImpl?: typeof fetch;
}
