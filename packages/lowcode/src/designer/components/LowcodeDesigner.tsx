import React from 'react';
import { QuestionDesigner, type QuestionDesignerProps } from './QuestionDesigner';

/** Canonical low-code designer entry point. Keep host applications on this API. */
export function LowcodeDesigner(props: QuestionDesignerProps) {
  return <QuestionDesigner {...props} />;
}
