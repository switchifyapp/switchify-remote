import type { ReactNode } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import type { Selection } from "./drag";

type Point = { absoluteX: number; absoluteY: number };
export function DragHandle({
  selection,
  enabled,
  children,
  start,
  update,
  end,
  cancel,
}: {
  selection: Selection;
  enabled: boolean;
  children: ReactNode;
  start(selection: Selection, point: Point): void;
  update(point: Point): void;
  end(point: Point): void;
  cancel(): void;
}) {
  const gesture = Gesture.Pan()
    .enabled(enabled)
    .activateAfterLongPress(350)
    .runOnJS(true)
    .onStart((point) => start(selection, point))
    .onUpdate(update)
    .onEnd((point, success) => {
      if (success) end(point);
      else cancel();
    })
    .onFinalize(cancel);
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}
