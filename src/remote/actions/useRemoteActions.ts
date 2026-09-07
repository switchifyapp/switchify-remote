import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { resolveActions, type ActionContext } from "./runtime";

export function useRemoteActions(context: ActionContext) {
  useSyncExternalStore(
    context.session.subscribe,
    context.session.snapshot,
    context.session.snapshot,
  );
  const current = useRef(context);
  useLayoutEffect(() => {
    current.current = context;
  });
  // eslint-disable-next-line react-hooks/refs -- The resolver stores this callback for presses; it does not read it during render.
  return resolveActions(context, () => current.current);
}
