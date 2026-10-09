import type { ReactElement } from 'react';

type TabSceneLayout = (props: { children: ReactElement; navigation: TabSceneNavigation }) => ReactElement;

export type TabSceneNavigation = {
  isFocused(): boolean;
  addListener(event: 'focus' | 'blur', listener: () => void): () => void;
};

export const tabSceneLayout: TabSceneLayout | undefined = undefined;
