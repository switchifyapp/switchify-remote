import { useScanGroup, useScanItem, type Measurable } from '@switchify/scanning/native';
import { type Ref, useCallback, useContext, useEffect, useId, useState } from 'react';
import { Platform, type View } from 'react-native';

import { ScanningEnabledContext, ScanVisibleContext } from './ScanningContext';

export type ScanHighlightState = { highlighted: boolean; groupHighlighted?: boolean };

function assign<T>(target: Ref<T> | undefined, value: T | null): void {
  if (typeof target === 'function') target(value);
  else if (target && typeof target === 'object') (target as { current: T | null }).current = value;
}

/** On the web a React Native view is its DOM element, which can scroll itself into view. */
function scrollIntoView(view: unknown): void {
  if (Platform.OS !== 'web') return;
  const element = view as { scrollIntoView?: (options: ScrollIntoViewOptions) => void } | null;
  element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

function useScanAnchor<V>(highlighted: boolean, measuredRef: (node: V | null) => void, forwarded?: Ref<V> | undefined) {
  const [view, setView] = useState<V | null>(null);
  const attach = useCallback((node: V | null) => {
    setView(node);
    measuredRef(node);
    assign(forwarded, node);
  }, [measuredRef, forwarded]);
  useEffect(() => { if (highlighted) scrollIntoView(view); }, [highlighted, view]);
  return attach;
}

/**
 * Makes a control scannable. Selecting it with a switch calls `onActivate`, the same
 * handler a press would. Attach `ref` and `onLayout` to the control's view so the
 * scan follows its position on screen.
 */
export function useScannable({ onActivate, disabled = false, controlRef }: { onActivate?: (() => void) | undefined; disabled?: boolean | undefined; controlRef?: Ref<View> | undefined }) {
  const enabled = useContext(ScanningEnabledContext);
  const visible = useContext(ScanVisibleContext);
  const id = useId();
  const item = useScanItem<View & Measurable>(id, { ...(onActivate ? { onActivate } : {}), disabled: disabled || !enabled || !visible || !onActivate });
  const attach = useScanAnchor<View>(item.highlighted, item.ref as (node: View | null) => void, controlRef);
  return { attach, onLayout: item.onLayout, highlighted: item.highlighted, groupHighlighted: item.groupHighlighted };
}

/** Makes a section scan as one group: Select enters it, and the last stop leaves it. */
export function useScannableGroup({ exclusive = false }: { exclusive?: boolean } = {}) {
  const id = useId();
  const group = useScanGroup<View & Measurable>(id, { exclusive });
  const attach = useScanAnchor<View>(group.highlighted || group.escapeHighlighted, group.ref as (node: View | null) => void);
  return { id, attach, onLayout: group.onLayout, highlighted: group.highlighted || group.parentHighlighted, entered: group.entered, escapeHighlighted: group.escapeHighlighted };
}
