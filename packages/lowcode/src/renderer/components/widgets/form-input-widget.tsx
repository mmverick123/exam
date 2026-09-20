import React from 'react';

import type { FieldProps } from '../../model/types';
import { TextAnswerControl } from '../shared/text-answer-control';

export function FormInputWidget(props: FieldProps) {
  return <TextAnswerControl {...props} multiline={false} />;
}
