import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { WebTabScene, type TabSceneNavigation } from './tabSceneLayout.web';

class FakeNavigation implements TabSceneNavigation {
  focused = false;
  listeners = new Map<string, Set<() => void>>();
  isFocused = () => this.focused;
  addListener(event: 'focus' | 'blur', listener: () => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return () => set.delete(listener);
  }
  emit(event: 'focus' | 'blur'): void {
    this.focused = event === 'focus';
    this.listeners.get(event)?.forEach((listener) => listener());
  }
}

describe('web tab scenes', () => {
  it('removes an unfocused tab from layout so its controls leave the keyboard order', async () => {
    const navigation = new FakeNavigation();
    const { unmount } = await render(<WebTabScene navigation={navigation}><Text>PCs</Text></WebTabScene>);
    const scene = () => screen.getByTestId('web-tab-scene', { includeHiddenElements: true });
    expect(scene().props.style).toMatchObject({ display: 'none' });
    await act(async () => navigation.emit('focus'));
    expect(scene().props.style).toMatchObject({ display: 'flex' });
    await act(async () => navigation.emit('blur'));
    expect(scene().props.style).toMatchObject({ display: 'none' });
    await unmount();
    expect(navigation.listeners.get('focus')?.size).toBe(0);
    expect(navigation.listeners.get('blur')?.size).toBe(0);
  });
});
