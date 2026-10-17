import { useCallback, useSyncExternalStore } from 'react';

import type { DesignerState, DesignerStore } from './store';

/**
 * React adapter for the vanilla Zustand store. The selector result is the
 * subscription boundary, so unchanged node references do not re-render.
 */
export function useDesignerSelector<T>(
  store: DesignerStore,
  selector: (state: DesignerState) => T,
  equality: (previous: T, next: T) => boolean = Object.is,
): T {
  const getSnapshot = useCallback(() => selector(store.getSnapshot()), [selector, store]);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeSelector(selector, listener, equality),
    [equality, selector, store],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
