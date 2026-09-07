import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Modal,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ControlButton } from "@/components/ControlButton";
import { AppText } from "@/components/AppText";
import { focusAccessibilityTarget } from "@/components/accessibilityFocus";
import { useTheme } from "@/theme/ThemeContext";
import type { LayoutControl } from "./SurfaceLayout";
import {
  initialLayout,
  moveCell,
  resizeLayout,
  setCell,
  type ButtonLayout,
} from "./model";

type Rect = { x: number; y: number; width: number; height: number };
export function LayoutEditor({
  visible,
  initial,
  controls,
  onSave,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  initial: ButtonLayout;
  controls: LayoutControl[];
  onSave(layout: ButtonLayout | null): Promise<void>;
  onClose(): void;
  onDismiss(): void;
}) {
  const [draft, setDraft] = useState(initial);
  const [reset, setReset] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const { colors, spacing, reducedMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const mounted = useRef(true);
  const scroll = useRef<ScrollView>(null);
  const viewport = useRef<View>(null);
  const bounds = useRef<Rect | null>(null);
  const cells = useRef(new Map<number, View>());
  const rects = useRef(new Map<number, Rect>());
  const cellRefs = useMemo(() => Array.from({ length: draft.cells.length }, (_, index) => (node: View | null) => {
    if (node) cells.current.set(index, node);
    else { cells.current.delete(index); rects.current.delete(index); }
  }), [draft.cells.length]);
  const actionHeading = useRef<View>(null);
  const heading = useRef<View>(null);
  const focusFrame = useRef<number | null>(null);
  const drag = useRef<{ index: number; x: number; y: number } | null>(null);
  const [dragPosition] = useState(() => new Animated.ValueXY());
  const dragFrame = useRef<number | null>(null);
  const offset = useRef(0);
  const maxOffset = useRef(0);
  const measure = () => {
    viewport.current?.measureInWindow((x, y, width, height) => {
      bounds.current = { x, y, width, height };
    });
    cells.current.forEach((node, index) =>
      node.measureInWindow((x, y, width, height) => {
        rects.current.set(index, { x, y, width, height });
      }),
    );
  };
  const focus = (node: () => View | null) => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      if (mounted.current) focusAccessibilityTarget(node());
    });
  };
  const cancelDrag = () => {
    drag.current = null;
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    if (mounted.current) setDragging(null);
  };
  useEffect(() => {
    cancelDrag();
    rects.current.clear();
    // Rotation or text relayout invalidates all drag coordinates.
  }, [dimensions.width, dimensions.height, dimensions.fontScale]);
  useEffect(
    () => () => {
      mounted.current = false;
      if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    },
    [],
  );
  const announce = (message: string) =>
    AccessibilityInfo.announceForAccessibilityWithOptions(message, {
      queue: true,
    });
  const change = (next: ButtonLayout) => {
    if (savingRef.current) return;
    setDraft(next);
    setReset(false);
    setDirty(true);
    setError(null);
  };
  const finishMove = (from: number, to: number) => {
    change(moveCell(draft, from, to));
    announce(
      `Moved to row ${Math.floor(to / draft.columns) + 1}, column ${(to % draft.columns) + 1}.`,
    );
    setSelected(null);
    setMoving(false);
    focus(() => cells.current.get(to) ?? null);
  };
  const tick = () => {
    const current = drag.current;
    const area = bounds.current;
    if (!current || !area) return;
    const delta =
      current.y < area.y + 56
        ? -6
        : current.y > area.y + area.height - 56
          ? 6
          : 0;
    if (delta) {
      offset.current = Math.max(
        0,
        Math.min(maxOffset.current, offset.current + delta),
      );
      scroll.current?.scrollTo({ y: offset.current, animated: false });
      measure();
    }
    dragFrame.current = requestAnimationFrame(tick);
  };
  const dismiss = () => {
    if (savingRef.current) return;
    cancelDrag();
    if (dirty)
      Alert.alert(
        "Discard layout changes?",
        "Your saved layout will stay as it was.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: onClose },
        ],
      );
    else onClose();
  };
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    cancelDrag();
    try {
      await onSave(reset ? null : draft);
      if (mounted.current) onClose();
    } catch {
      if (mounted.current) {
        setError("Layout could not be saved. Try again.");
        announce("Layout could not be saved. Try again.");
      }
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const resize = (axis: "row" | "column", insert: boolean) => {
    if (selected === null) return;
    const index =
      axis === "row"
        ? Math.floor(selected / draft.columns)
        : selected % draft.columns;
    const apply = () => {
      change(resizeLayout(draft, axis, index, insert));
      setSelected(null);
      setMoving(false);
      focus(() => heading.current);
    };
    const occupied = draft.cells.some(
      (id, cell) =>
        id !== null &&
        (axis === "row"
          ? Math.floor(cell / draft.columns)
          : cell % draft.columns) === index,
    );
    if (!insert && occupied)
      Alert.alert(
        `Remove ${axis}?`,
        "Buttons in it will return to the available buttons list.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: apply },
        ],
      );
    else apply();
  };
  const maxColumns = Math.min(
    4,
    Math.max(1, Math.floor((width + spacing.sm) / (48 + spacing.sm))),
  );
  return (
    <Modal
      visible={visible}
      animationType={reducedMotion ? "none" : "slide"}
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={dismiss}
      onDismiss={onDismiss}
      onShow={() => focus(() => heading.current)}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={dismiss}
          style={{
            flex: 1,
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <View style={{ padding: spacing.md, gap: spacing.sm }}>
            <View ref={heading} accessible accessibilityRole="header">
              <AppText variant="heading">Edit layout</AppText>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <ControlButton
                label={saving ? "Saving layout" : "Save layout"}
                disabled={saving}
                onPress={() => void save()}
              />
              <ControlButton
                label="Cancel"
                disabled={saving}
                onPress={dismiss}
              />
            </View>
            {error ? <AppText>{error}</AppText> : null}
          </View>
          <View
            testID="layout-editor-viewport"
            ref={viewport}
            style={{ flex: 1 }}
            onLayout={(event) => {
              setWidth(event.nativeEvent.layout.width - spacing.md * 2);
              measure();
            }}
          >
            <ScrollView
              testID="layout-editor-scroll"
              ref={scroll}
              pointerEvents={saving ? "none" : "auto"}
              accessibilityElementsHidden={saving}
              importantForAccessibility={
                saving ? "no-hide-descendants" : "auto"
              }
              onScroll={(event) => {
                offset.current = event.nativeEvent.contentOffset.y;
                measure();
              }}
              scrollEventThrottle={16}
              onContentSizeChange={(_, height) => {
                maxOffset.current = Math.max(
                  0,
                  height - (bounds.current?.height ?? 0),
                );
              }}
              contentContainerStyle={{
                padding: spacing.md,
                gap: spacing.md,
                maxWidth: 960,
                width: "100%",
                alignSelf: "center",
              }}
            >
              <AppText muted>
                Hold a button to drag it, or select a cell for editing actions.
                Buttons do not control your PC here.
              </AppText>
              {selected !== null ? (
                <View style={{ gap: spacing.sm }}>
                  <View
                    ref={actionHeading}
                    accessible
                    accessibilityRole="header"
                  >
                    <AppText variant="heading">
                      Row {Math.floor(selected / draft.columns) + 1}, column{" "}
                      {(selected % draft.columns) + 1}
                    </AppText>
                  </View>
                  {moving ? (
                    <AppText>
                      Select a destination cell to move or swap this button.
                    </AppText>
                  ) : (
                    <>
                      {draft.cells[selected] ? (
                        <>
                          <ControlButton
                            label="Move button"
                            onPress={() => {
                              setMoving(true);
                              focus(() => cells.current.get(0) ?? null);
                            }}
                          />
                          <ControlButton
                            label="Remove button"
                            onPress={() => {
                              change(setCell(draft, selected, null));
                              setSelected(null);
                              focus(() => cells.current.get(selected) ?? null);
                            }}
                          />
                        </>
                      ) : (
                        controls
                          .filter(
                            (control) => !draft.cells.includes(control.id),
                          )
                          .map((control) => (
                            <ControlButton
                              key={control.id}
                              label={`Add ${control.accessibilityLabel ?? control.label}`}
                              onPress={() => {
                                change(setCell(draft, selected, control.id));
                                setSelected(null);
                                focus(
                                  () => cells.current.get(selected) ?? null,
                                );
                              }}
                            />
                          ))
                      )}
                      <ControlButton
                        label="Insert row before"
                        disabled={draft.cells.length / draft.columns >= 20}
                        onPress={() => resize("row", true)}
                      />
                      <ControlButton
                        label="Remove row"
                        disabled={draft.cells.length / draft.columns <= 1}
                        onPress={() => resize("row", false)}
                      />
                      <ControlButton
                        label="Insert column before"
                        disabled={draft.columns >= maxColumns}
                        onPress={() => resize("column", true)}
                      />
                      <ControlButton
                        label="Remove column"
                        disabled={draft.columns <= 1}
                        onPress={() => resize("column", false)}
                      />
                    </>
                  )}
                  <ControlButton
                    label="Close cell actions"
                    onPress={() => {
                      const index = selected;
                      setSelected(null);
                      setMoving(false);
                      focus(() => cells.current.get(index) ?? null);
                    }}
                  />
                </View>
              ) : null}
              {/* Gesture callbacks read refs on native events, not while this map renders. */}
              <View style={{ gap: spacing.sm }} onLayout={measure}>
                {Array.from(
                  { length: draft.cells.length / draft.columns },
                  // eslint-disable-next-line react-hooks/refs -- Gesture setters register callbacks; native events read the refs.
                  (_, row) => (
                    <View
                      key={row}
                      style={{ flexDirection: "row", gap: spacing.sm }}
                    >
                      {draft.cells
                        .slice(row * draft.columns, (row + 1) * draft.columns)
                        .map((id, column) => {
                          const index = row * draft.columns + column;
                          const control = controls.find(
                            (item) => item.id === id,
                          );
                          // Gesture setters register callbacks; native events read these refs after rendering.
                          const gesture = Gesture.Pan()
                            .enabled(!!id && !saving && selected === null)
                            .activateAfterLongPress(350)
                            .runOnJS(true)
                            .onStart((event) => {
                              measure();
                              drag.current = {
                                index,
                                x: event.absoluteX,
                                y: event.absoluteY,
                              };
                              dragPosition.setValue({
                                x: event.absoluteX - 80,
                                y: event.absoluteY - 30,
                              });
                              setDragging(index);
                              dragFrame.current = requestAnimationFrame(tick);
                            })
                            .onUpdate((event) => {
                              if (drag.current) {
                                drag.current = {
                                  ...drag.current,
                                  x: event.absoluteX,
                                  y: event.absoluteY,
                                };
                                dragPosition.setValue({
                                  x: event.absoluteX - 80,
                                  y: event.absoluteY - 30,
                                });
                              }
                            })
                            .onEnd((event) => {
                              if (!drag.current) return;
                              const area = bounds.current;
                              if (
                                area &&
                                event.absoluteY >= area.y &&
                                event.absoluteY <= area.y + area.height
                              ) {
                                const target = [...rects.current].find(
                                  ([, r]) =>
                                    event.absoluteX >= r.x &&
                                    event.absoluteX <= r.x + r.width &&
                                    event.absoluteY >= r.y &&
                                    event.absoluteY <= r.y + r.height,
                                );
                                if (target && target[0] !== index)
                                  finishMove(index, target[0]);
                              }
                              cancelDrag();
                            })
                            .onFinalize(cancelDrag);
                          return (
                            <GestureDetector key={column} gesture={gesture}>
                              <View
                                style={{
                                  flex: 1,
                                  minWidth: 48,
                                  opacity: dragging === index ? 0.5 : 1,
                                }}
                              >
                                <ControlButton
                              controlRef={cellRefs[index]!}
                                  label={
                                    control?.label ??
                                    (id ? "Unavailable button" : "Empty")
                                  }
                                  accessibilityLabel={`Row ${row + 1}, column ${column + 1}: ${control?.accessibilityLabel ?? control?.label ?? (id ? "Unavailable button" : "Empty")}`}
                                  selected={selected === index}
                                  disabled={saving}
                                  onPress={() => {
                                    if (moving && selected !== null)
                                      finishMove(selected, index);
                                    else {
                                      setSelected(index);
                                      scroll.current?.scrollTo({
                                        y: 0,
                                        animated: !reducedMotion,
                                      });
                                      focus(() => actionHeading.current);
                                    }
                                  }}
                                />
                              </View>
                            </GestureDetector>
                          );
                        })}
                    </View>
                  ),
                )}
              </View>
              <ControlButton
                label="Add row at end"
                disabled={saving || draft.cells.length / draft.columns >= 20}
                onPress={() =>
                  change(
                    resizeLayout(
                      draft,
                      "row",
                      draft.cells.length / draft.columns,
                      true,
                    ),
                  )
                }
              />
              <ControlButton
                label="Add column at end"
                disabled={saving || draft.columns >= maxColumns}
                onPress={() =>
                  change(resizeLayout(draft, "column", draft.columns, true))
                }
              />
              <ControlButton
                label="Reset to default"
                disabled={saving}
                onPress={() =>
                  Alert.alert(
                    "Reset layout?",
                    "Save to restore the original arrangement.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Reset",
                        onPress: () => {
                          setDraft(
                            initialLayout(
                              controls.map((control) => control.id),
                            ),
                          );
                          setReset(true);
                          setDirty(true);
                          setSelected(null);
                        },
                      },
                    ],
                  )
                }
              />
            </ScrollView>
          </View>
          {dragging !== null ? (
            <Animated.View
              pointerEvents="none"
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 160,
                minHeight: 48,
                padding: spacing.sm,
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.brand,
                borderWidth: 2,
                transform: dragPosition.getTranslateTransform(),
              }}
            >
              <AppText>
                {
                  controls.find(
                    (control) => control.id === draft.cells[dragging],
                  )?.label
                }
              </AppText>
            </Animated.View>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
