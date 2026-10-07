import { type ReactElement, useEffect, useState } from 'react';
import { View } from 'react-native';

import type { TabSceneNavigation } from './tabSceneLayout';

export type { TabSceneNavigation } from './tabSceneLayout';

/**
 * On the web, inactive tabs stay in the page behind the focused one and are only
 * hidden from screen readers, so their buttons still take keyboard focus. Removing
 * them from layout keeps Tab order on the visible screen.
 */
export function WebTabScene({ children, navigation }: { children: ReactElement; navigation: TabSceneNavigation }) {
  const [focused, setFocused] = useState(() => navigation.isFocused());
  useEffect(() => {
    setFocused(navigation.isFocused());
    const removeFocus = navigation.addListener('focus', () => setFocused(true));
    const removeBlur = navigation.addListener('blur', () => setFocused(false));
    return () => { removeFocus(); removeBlur(); };
  }, [navigation]);
  return <View testID="web-tab-scene" style={{ display: focused ? 'flex' : 'none', flex: 1 }}>{children}</View>;
}

export const tabSceneLayout = ({ children, navigation }: { children: ReactElement; navigation: TabSceneNavigation }): ReactElement =>
  <WebTabScene navigation={navigation}>{children}</WebTabScene>;
