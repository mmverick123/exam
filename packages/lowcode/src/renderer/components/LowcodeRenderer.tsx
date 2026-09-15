import React from 'react';
import { QuestionRenderer, type QuestionRendererProps } from './QuestionRenderer';

/** Canonical low-code renderer entry point shared by preview and answer surfaces. */
export const LowcodeRenderer = React.forwardRef<React.ElementRef<typeof QuestionRenderer>, QuestionRendererProps>(
  function LowcodeRenderer(props, ref) {
    return <QuestionRenderer {...props} ref={ref} />;
  },
);

LowcodeRenderer.displayName = 'LowcodeRenderer';
