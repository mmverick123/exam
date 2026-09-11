import React from 'react';

import type { FieldProps } from '../../model/types';
import { classNames, FieldShell } from '../shared/field-shell';

export function ImageWidget({ node, mode }: FieldProps) {
  const src = typeof node.options.src === 'string' ? node.options.src : '';
  const isHttps = src === '' || src.startsWith('https://');
  return (
    <FieldShell node={node}>
      {src && isHttps ? (
        <img className={classNames('exam-image', `align-${String(node.options.align ?? 'center')}`)} src={src} alt={String(node.options.alt ?? '')} style={{ width: `${Number(node.options.width ?? 100)}%` }} draggable={false} />
      ) : <div className="exam-image-placeholder" data-mode={mode}>待配置图片</div>}
    </FieldShell>
  );
}
