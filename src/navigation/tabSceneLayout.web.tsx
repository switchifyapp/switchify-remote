import { type ReactElement, useCallback, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import type { TabSceneNavigation } from './tabSceneLayout';

export type { TabSceneNavigation } from './tabSceneLayout';

/**
 * On the web, inactive tabs stay in the page behind the focused one and are only
 * hidden from screen readers, so their buttons still take keyboard focus. Removing
 * them from layout keeps Tab order on the visible screen.
 */
export function WebTabScene({ children, navigation }: { children: ReactElement; navigation: TabSceneNavigation }) {
  const subscribe = useCallback((onChange: () => void) => {
    const removeFocus = navigation.addListener('focus', onChange);
    const removeBlur = navigation.addListener('blur', onChange);
    return () => { removeFocus(); removeBlur(); };
  }, [navigation]);
  const isFocused = useCallback(() => navigation.isFocused(), [navigation]);
  const focused = useSyncExternalStore(subscribe, isFocused, isFocused);
  return <View testID="web-tab-scene" style={{ display: focused ? 'flex' : 'none', flex: 1 }}>{children}</View>;
}

export const tabSceneLayout = ({ children, navigation }: { children: ReactElement; navigation: TabSceneNavigation }): ReactElement =>
  <WebTabScene navigation={navigation}>{children}</WebTabScene>;
