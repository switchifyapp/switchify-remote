import { useScanGroup, useScanItem, type Measurable } from '@switchify/scanning/native';
import { type Ref, useCallback, useContext, useEffect, useId, useState } from 'react';
import { Platform, type View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { ScanningEnabledContext, ScanVisibleContext } from './ScanningContext';

export type ScanHighlightState = { highlighted: boolean; groupHighlighted?: boolean };

function assign<T>(target: Ref<T> | undefined, value: T | null): void {
  if (typeof target === 'function') target(value);
  else if (target && typeof target === 'object') (target as { current: T | null }).current = value;
}

type Span = { top: number; bottom: number };

const REVEAL_MARGIN = 12;

/**
 * How to bring a highlighted control into view: not at all while it is fully
 * visible, otherwise centred, or aligned to the top when it is too tall to centre.
 * Centring leaves the next few stops visible, so the page moves once rather than on
 * every step.
 */
export function revealPlan(item: Span, area: Span, margin = REVEAL_MARGIN): ScrollLogicalPosition | null {
  if (item.top >= area.top + margin && item.bottom <= area.bottom - margin) return null;
  return item.bottom - item.top > (area.bottom - area.top) * 0.8 ? 'start' : 'center';
}

function scrollArea(element: HTMLElement): Span {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) return parent.getBoundingClientRect();
  }
  return { top: 0, bottom: window.innerHeight };
}

/** On the web a React Native view is its DOM element, which can scroll itself into view. */
function reveal(view: unknown, reducedMotion: boolean): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const element = view as HTMLElement | null;
  if (!element?.getBoundingClientRect || !element.scrollIntoView) return;
  const block = revealPlan(element.getBoundingClientRect(), scrollArea(element));
  if (block) element.scrollIntoView({ block, inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
}

function useScanAnchor<V>(highlighted: boolean, measuredRef: (node: V | null) => void, forwarded?: Ref<V> | undefined) {
  const { reducedMotion } = useTheme();
  const [view, setView] = useState<V | null>(null);
  const attach = useCallback((node: V | null) => {
    setView(node);
    measuredRef(node);
    assign(forwarded, node);
  }, [measuredRef, forwarded]);
  useEffect(() => { if (highlighted) reveal(view, reducedMotion); }, [highlighted, view, reducedMotion]);
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
