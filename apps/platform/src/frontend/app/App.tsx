import React from 'react';

import { DesignPage } from '../pages/DesignPage';
import { ExamPage } from '../pages/ExamPage';
import { QuestionTypesPage } from '../pages/QuestionTypesPage';

export function App() {
  const path = window.location.pathname;
  const design = path.match(/^\/question-types\/(\d+)\/design$/);
  if (design?.[1]) return <DesignPage id={design[1]} />;
  const exam = path.match(/^\/exam\/([^/]+)$/);
  if (exam?.[1]) return <ExamPage code={exam[1]} />;
  return <QuestionTypesPage />;
}
