import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/backend/http/server';

const auth = { authorization: 'Bearer dev-token' };

describe('minimal consumer platform', () => {
  it('protects design APIs and exposes only published projected JSON', async () => {
    const app = buildServer();
    await app.ready();

    const unauthorized = await app.inject({ method: 'POST', url: '/api/question-types', payload: { name: '数学题' } });
    expect(unauthorized.statusCode).toBe(401);

    const created = await app.inject({ method: 'POST', url: '/api/question-types', headers: auth, payload: { name: '数学题' } });
    expect(created.statusCode).toBe(201);
    const { id, code } = created.json();

    const beforePublish = await app.inject({ method: 'GET', url: `/api/exam/${code}` });
    expect(beforePublish.statusCode).toBe(404);

    const design = await app.inject({ method: 'GET', url: `/api/question-types/${id}`, headers: auth });
    const draft = design.json().formJson;
    draft.widgetList[0].widgetList.push({
      type: 'stem', id: 'stem_1', options: { content: '<p>题干</p><script>alert(1)</script>' },
    });
    draft.widgetList[0].widgetList.push({
      type: 'single-choice', id: 'choice_1', options: {
        name: 'answer_1', optionItems: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }],
        correctAnswer: 'a', score: 1,
      },
    });
    draft.widgetList[0].widgetList.push({
      type: 'fill-blank', id: 'fill_1', options: {
        name: 'fill_1', maxLength: 3, defaultValue: null,
      },
    });
    const saved = await app.inject({ method: 'POST', url: `/api/question-types/${id}/versions`, headers: auth, payload: { formJson: draft } });
    expect(saved.statusCode).toBe(201);
    expect(JSON.stringify(saved.json())).not.toContain('<script>');

    const unsupported = structuredClone(draft);
    unsupported.contractVersion = '9.9.9';
    const unsupportedResponse = await app.inject({ method: 'POST', url: `/api/question-types/${id}/versions`, headers: auth, payload: { formJson: unsupported } });
    expect(unsupportedResponse.statusCode).toBe(400);
    expect(unsupportedResponse.json().error).toBe('UNSUPPORTED_CONTRACT_VERSION');

    const published = await app.inject({ method: 'POST', url: `/api/question-types/${id}/publish`, headers: auth, payload: { version: 2 } });
    expect(published.statusCode).toBe(200);
    const exam = await app.inject({ method: 'GET', url: `/api/exam/${code}` });
    expect(exam.statusCode).toBe(200);
    expect(JSON.stringify(exam.json())).not.toContain('correctAnswer');

    const emptyAnswer = await app.inject({ method: 'POST', url: `/api/exam/${code}/answers`, payload: { version: 2, answerData: { answer_1: null } } });
    expect(emptyAnswer.statusCode).toBe(201);
    const badAnswer = await app.inject({ method: 'POST', url: `/api/exam/${code}/answers`, payload: { version: 2, answerData: { unknown: 'x' } } });
    expect(badAnswer.statusCode).toBe(400);
    const badType = await app.inject({ method: 'POST', url: `/api/exam/${code}/answers`, payload: { version: 2, answerData: { answer_1: true } } });
    expect(badType.statusCode).toBe(400);
    const tooLong = await app.inject({ method: 'POST', url: `/api/exam/${code}/answers`, payload: { version: 2, answerData: { fill_1: '超过长度' } } });
    expect(tooLong.statusCode).toBe(400);
    const badVersion = await app.inject({ method: 'POST', url: `/api/exam/${code}/answers`, payload: { version: 99, answerData: {} } });
    expect(badVersion.statusCode).toBe(404);

    const savedDraft = await app.inject({ method: 'POST', url: `/api/question-types/${id}/versions`, headers: auth, payload: { formJson: draft } });
    expect(savedDraft.json().version).toBe(3);
    const stillPublished = await app.inject({ method: 'GET', url: `/api/exam/${code}` });
    expect(stillPublished.json().version).toBe(2);

    await app.close();
  });

  it('authenticates and transparently streams the Agent SSE response', async () => {
    let serviceToken = '';
    const fetchImpl: typeof fetch = async (_input, init) => {
      serviceToken = String((init?.headers as Record<string, string>)['x-agent-token']);
      return new Response('event: plan\ndata: {"steps":["规划"]}\n\nevent: done\ndata: {}\n\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const app = buildServer(undefined, { agentUrl: 'http://agent.test', agentToken: 'secret', fetchImpl });
    await app.ready();
    const denied = await app.inject({ method: 'POST', url: '/api/agent/chat', payload: {} });
    expect(denied.statusCode).toBe(401);
    const response = await app.inject({ method: 'POST', url: '/api/agent/chat', headers: auth, payload: { message: '出题' } });
    expect(response.statusCode).toBe(200);
    expect(serviceToken).toBe('secret');
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['x-accel-buffering']).toBe('no');
    expect(response.body).toContain('event: plan');
    await app.close();
  });
});
