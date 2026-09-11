import React from 'react';

import type { FieldProps } from '../../model/types';
import { ChoiceControl } from '../shared/choice-control';

export function MultiChoiceWidget(props: FieldProps) {
  return <ChoiceControl {...props} multiple />;
}
