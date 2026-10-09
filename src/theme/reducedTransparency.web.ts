export function subscribeReducedTransparency(onChange: (enabled: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia('(prefers-reduced-transparency: reduce)');
  const listener = (event: MediaQueryListEvent) => onChange(event.matches);
  onChange(query.matches);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
