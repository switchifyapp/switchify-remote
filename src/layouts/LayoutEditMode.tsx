import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

export const LayoutEditModeContext = createContext({
  enabled: false,
  toggle: () => {},
});

/** Editing chrome is temporary UI state, independent of layouts and typing. */
export function LayoutEditModeProvider({ children }: PropsWithChildren) {
  const [enabled, setEnabled] = useState(false);
  const toggle = useCallback(() => setEnabled((value) => !value), []);
  const value = useMemo(() => ({ enabled, toggle }), [enabled, toggle]);
  return (
    <LayoutEditModeContext.Provider value={value}>
      {children}
    </LayoutEditModeContext.Provider>
  );
}

export function useLayoutEditMode() {
  return useContext(LayoutEditModeContext);
}
