import React, { useEffect, useRef, useState } from 'react';

import type { QuestionJson } from '@exam/lowcode/contract';
import { QuestionRenderer, type QuestionRendererHandle } from '@exam/lowcode/renderer';

interface ExamPayload { version: number; json: QuestionJson; }

export function ExamPage({ code }: { code: string }) {
  const [exam, setExam] = useState<ExamPayload | null>(null);
  const [message, setMessage] = useState('');
  const rendererRef = useRef<QuestionRendererHandle>(null);
  useEffect(() => { void fetch(`/api/exam/${code}`).then((response) => response.json()).then(setExam); }, [code]);
  if (!exam) return <main className="platform-page">加载中…</main>;
  const submit = async () => {
    const response = await fetch(`/api/exam/${code}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: exam.version, answerData: rendererRef.current?.getAnswerData() ?? {} }) });
    setMessage(response.ok ? '提交成功' : `提交失败：${await response.text()}`);
  };
  return <main className="platform-page"><h1>在线答题</h1><QuestionRenderer ref={rendererRef} json={exam.json} mode="answer" /><button type="button" onClick={() => void submit()}>提交答案</button><p>{message}</p></main>;
}
