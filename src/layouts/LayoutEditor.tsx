import { ResponsiveGrid } from "@/components/ResponsiveGrid";
import { sectionGridMetrics } from "./gridMetrics";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Animated,
  AppState,
  Modal,
  Keyboard,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ControlButton } from "@/components/ControlButton";
import { AppText } from "@/components/AppText";
import { focusAccessibilityTarget } from "@/components/accessibilityFocus";
import { useTheme } from "@/theme/ThemeContext";
import type { LayoutControl } from "./SurfaceLayout";
import {
  moveCell,
  moveTrack,
  resizeLayout,
  setCell,
  MAX_COLUMNS,
  MAX_ROWS,
  type ButtonLayout,
  type LayoutAxis,
  type LayoutSurface,
} from "./model";
import { dropTarget, type DropTarget, type Rect, type Selection } from "./drag";
import { DragHandle } from "./DragHandle";
import { ActionPicker } from "./ActionPicker";
import { canPlaceAction, getAction } from "@/remote/actions/catalog";

type Point = { absoluteX: number; absoluteY: number };
const keyFor = (selection: Selection) => `${selection.kind}-${selection.index}`;
export function LayoutEditor({
  visible,
  title,
  surface,
  initial,
  defaultLayout,
  initiallyCustomized,
  controls,
  onSave,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  surface: LayoutSurface;
  initial: ButtonLayout;
  defaultLayout: ButtonLayout;
  initiallyCustomized: boolean;
  controls: LayoutControl[];
  onSave(layout: ButtonLayout | null): Promise<void>;
  onClose(): void;
  onDismiss(): void;
}) {
  const [draft, setDraft] = useState(initial);
  const [reset, setReset] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerCell, setPickerCell] = useState<number | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [moving, setMoving] = useState(false);
  const [dragging, setDragging] = useState<Selection | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [width, setWidth] = useState(0);
  const { colors, spacing, reducedMotion } = useTheme();
  const dimensions = useWindowDimensions();
  const mounted = useRef(true);
  const savingRef = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const horizontal = useRef<ScrollView>(null);
  const viewport = useRef<View>(null);
  const gridViewport = useRef<View>(null);
  const bounds = useRef<Rect | null>(null);
  const horizontalBounds = useRef<Rect | null>(null);
  const nodes = useRef(new Map<string, View>());
  const rects = useRef(new Map<string, Rect>());
  const generation = useRef(0);
  const rows = draft.cells.length / draft.columns;
  const nodeRefs = useMemo(() => {
    const keys = [
      ...draft.cells.map((_, index) => `cell-${index}`),
      ...Array.from({ length: rows }, (_, i) => `row-${i}`),
      ...Array.from({ length: draft.columns }, (_, i) => `column-${i}`),
    ];
    return Object.fromEntries(
      keys.map((key) => [
        key,
        (node: View | null) => {
          // eslint-disable-next-line react-hooks/refs -- React invokes this ref callback during commit, never during render.
          if (node) nodes.current.set(key, node);
          else {
            nodes.current.delete(key);
            // eslint-disable-next-line react-hooks/refs -- React invokes this ref callback during commit, never during render.
            rects.current.delete(key);
          }
        },
      ]),
    );
  }, [draft.cells, draft.columns, rows]);
  const heading = useRef<View>(null);
  const actionHeading = useRef<View>(null);
  const focusFrame = useRef<number | null>(null);
  const dragFrame = useRef<number | null>(null);
  const drag = useRef<(Selection & Point) | null>(null);
  const [dragPosition] = useState(() => new Animated.ValueXY());
  const offset = useRef({ x: 0, y: 0 });
  const maxOffset = useRef({ x: 0, y: 0 });
  const trackWidth = 48;
  const { cellWidth, gridWidth, overflows } = sectionGridMetrics(
    width,
    draft.columns,
    spacing.sm,
    trackWidth,
  );
  const measure = () => {
    const current = ++generation.current;
    viewport.current?.measureInWindow((x, y, width, height) => {
      if (current === generation.current)
        bounds.current = { x, y, width, height };
    });
    gridViewport.current?.measureInWindow((x, y, width, height) => {
      if (current === generation.current)
        horizontalBounds.current = { x, y, width, height };
    });
    nodes.current.forEach((node, key) =>
      node.measureInWindow((x, y, width, height) => {
        if (
          mounted.current &&
          current === generation.current &&
          nodes.current.get(key) === node
        )
          rects.current.set(key, { x, y, width, height });
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
    if (mounted.current) {
      setDragging(null);
      setTarget(null);
    }
  };
  useEffect(() => {
    cancelDrag();
    generation.current += 1;
    rects.current.clear();
  }, [dimensions.width, dimensions.height, dimensions.fontScale, visible]);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") cancelDrag();
    });
    return () => {
      mounted.current = false;
      drag.current = null;
      generation.current += 1;
      subscription.remove();
      if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    };
  }, []);
  const announce = (message: string) =>
    AccessibilityInfo.announceForAccessibilityWithOptions(message, {
      queue: true,
    });
  const change = (next: ButtonLayout) => {
    if (savingRef.current || next === draft) return;
    cancelDrag();
    setDraft(next);
    setReset(false);
    setDirty(true);
    setError(null);
  };
  const finishMove = (source: Selection, to: number) => {
    if (savingRef.current) return;
    change(
      source.kind === "cell"
        ? moveCell(draft, source.index, to)
        : moveTrack(draft, source.kind, source.index, to),
    );
    announce(
      source.kind === "cell"
        ? `Moved to row ${Math.floor(to / draft.columns) + 1}, column ${(to % draft.columns) + 1}.`
        : `Moved ${source.kind} ${source.index + 1} to position ${to + 1}.`,
    );
    setSelected(null);
    setMoving(false);
    focus(
      () => nodes.current.get(keyFor({ kind: source.kind, index: to })) ?? null,
    );
  };
  const locate = (source: Selection, point: Point) =>
    dropTarget(
      source,
      point.absoluteX,
      point.absoluteY,
      bounds.current,
      rects.current,
      draft.columns,
    );
  const updateTarget = (next: DropTarget | null) => {
    setTarget((previous) =>
      previous?.index === next?.index && previous?.boundary === next?.boundary
        ? previous
        : next,
    );
  };
  const tick = () => {
    const current = drag.current;
    const area = bounds.current;
    const across = horizontalBounds.current;
    if (!current || !area) return;
    const dy =
      current.absoluteY < area.y + 56
        ? -6
        : current.absoluteY > area.y + area.height - 56
          ? 6
          : 0;
    const dx =
      across &&
      current.absoluteY >= across.y &&
      current.absoluteY <= across.y + across.height
        ? current.absoluteX < across.x + 40
          ? -6
          : current.absoluteX > across.x + across.width - 40
            ? 6
            : 0
        : 0;
    if (dy) {
      offset.current.y = Math.max(
        0,
        Math.min(maxOffset.current.y, offset.current.y + dy),
      );
      scroll.current?.scrollTo({ y: offset.current.y, animated: false });
    }
    if (dx) {
      offset.current.x = Math.max(
        0,
        Math.min(maxOffset.current.x, offset.current.x + dx),
      );
      horizontal.current?.scrollTo({ x: offset.current.x, animated: false });
    }
    updateTarget(locate(current, current));
    dragFrame.current = requestAnimationFrame(tick);
  };
  const startDrag = (selection: Selection, point: Point) => {
    if (savingRef.current) return;
    cancelDrag();
    measure();
    drag.current = { ...selection, ...point };
    setDragging(selection);
    dragPosition.setValue({ x: point.absoluteX - 80, y: point.absoluteY - 30 });
    dragFrame.current = requestAnimationFrame(tick);
  };
  const updateDrag = (point: Point) => {
    if (!drag.current) return;
    drag.current = { ...drag.current, ...point };
    dragPosition.setValue({ x: point.absoluteX - 80, y: point.absoluteY - 30 });
    updateTarget(locate(drag.current, point));
  };
  const endDrag = (point: Point) => {
    const current = drag.current;
    if (current) {
      const destination = locate(current, point);
      if (destination && destination.index !== current.index)
        finishMove(current, destination.index);
    }
    cancelDrag();
  };
  const select = (selection: Selection) => {
    if (moving && selected) {
      if (selected.kind === selection.kind)
        finishMove(selected, selection.index);
      return;
    }
    if (selection.kind === "cell" && draft.cells[selection.index] === null) {
      cancelDrag();
      setSelected(null);
      setMoving(false);
      setPickerCell(selection.index);
      return;
    }
    setSelected(selection);
    setMoving(false);
    scroll.current?.scrollTo({ y: 0, animated: !reducedMotion });
    focus(() => actionHeading.current);
  };
  const closeActions = () => {
    const previous = selected;
    setSelected(null);
    setMoving(false);
    focus(() =>
      previous
        ? (nodes.current.get(keyFor(previous)) ?? heading.current)
        : heading.current,
    );
  };
  const closePicker = () => {
    const index = pickerCell;
    setPickerCell(null);
    Keyboard.dismiss();
    focus(() =>
      index === null
        ? heading.current
        : (nodes.current.get(`cell-${index}`) ?? heading.current),
    );
  };
  const pickerOptions = controls
    .filter(
      (control) =>
        canPlaceAction(control.id, surface) &&
        !draft.cells.includes(control.id),
    )
    .map((control) => {
      const definition = getAction(control.id)!;
      return (
        control.option ?? {
          id: definition.id,
          name: definition.name,
          category: definition.category,
          keywords: definition.keywords,
        }
      );
    });
  const assignAction = (id: string) => {
    if (
      pickerCell === null ||
      savingRef.current ||
      !visible ||
      draft.cells[pickerCell] !== null ||
      !canPlaceAction(id, surface) ||
      draft.cells.includes(id) ||
      !controls.some((control) => control.id === id)
    ) {
      closePicker();
      return;
    }
    const option = pickerOptions.find((option) => option.id === id);
    change(setCell(draft, pickerCell, id));
    announce(
      `${option?.name ?? "Action"} assigned to row ${Math.floor(pickerCell / draft.columns) + 1}, column ${(pickerCell % draft.columns) + 1}.`,
    );
    closePicker();
  };
  const dismiss = () => {
    if (savingRef.current) return;
    cancelDrag();
    if (dirty)
      Alert.alert(
        "Discard layout changes?",
        "Your saved section will stay as it was.",
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
      // A no-op must not turn an adaptive default into a fixed grid.
      if (dirty) await onSave(reset ? null : draft);
      else if (initiallyCustomized) await onSave(initial);
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
  const resize = (axis: LayoutAxis, index: number, insert: boolean) => {
    const apply = () => {
      if (savingRef.current || !mounted.current) return;
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
        "Removed actions will be available in Choose action again.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: apply },
        ],
      );
    else apply();
  };
  const selectedRow = selected
    ? selected.kind === "row"
      ? selected.index
      : Math.floor(selected.index / draft.columns)
    : 0;
  const selectedColumn = selected
    ? selected.kind === "column"
      ? selected.index
      : selected.index % draft.columns
    : 0;
  const dragLabel = dragging
    ? dragging.kind === "cell"
      ? controls.find((control) => control.id === draft.cells[dragging.index])
          ?.label
      : `${dragging.kind === "row" ? "Row" : "Column"} ${dragging.index + 1}`
    : "";
  return (
    <Modal
      testID="section-editor-modal"
      visible={visible}
      animationType={reducedMotion ? "none" : "slide"}
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={pickerCell === null ? dismiss : closePicker}
      onDismiss={onDismiss}
      onShow={() => focus(() => heading.current)}
    >
      <SafeAreaProvider style={{ flex: 1 }}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaView
            accessibilityViewIsModal={pickerCell === null}
            accessibilityElementsHidden={pickerCell !== null}
            importantForAccessibility={
              pickerCell !== null ? "no-hide-descendants" : "auto"
            }
            pointerEvents={pickerCell !== null ? "none" : "auto"}
            onAccessibilityEscape={dismiss}
            style={{
              flex: 1,
              backgroundColor: colors.background,
            }}
          >
            <View style={{ padding: spacing.md, gap: spacing.sm }}>
              <View ref={heading} accessible accessibilityRole="header">
                <AppText variant="heading">Edit {title}</AppText>
              </View>
              <ResponsiveGrid minItemWidth={120} maxColumns={2}>
                <ControlButton
                  label={saving ? "Saving layout" : "Save layout"}
                  contentLayout="stacked"
                  disabled={saving}
                  onPress={() => void save()}
                />
                <ControlButton
                  label="Cancel"
                  contentLayout="stacked"
                  disabled={saving}
                  onPress={dismiss}
                />
              </ResponsiveGrid>
              {error ? <AppText>{error}</AppText> : null}
            </View>
            <View
              ref={viewport}
              testID="layout-editor-viewport"
              style={{ flex: 1 }}
              onLayout={() => {
                cancelDrag();
                measure();
              }}
            >
              <ScrollView
                ref={scroll}
                testID="layout-editor-scroll"
                pointerEvents={saving ? "none" : "auto"}
                accessibilityElementsHidden={saving}
                importantForAccessibility={
                  saving ? "no-hide-descendants" : "auto"
                }
                onScroll={(event) => {
                  offset.current.y = event.nativeEvent.contentOffset.y;
                  measure();
                }}
                scrollEventThrottle={16}
                onContentSizeChange={(_, height) => {
                  maxOffset.current.y = Math.max(
                    0,
                    height - (bounds.current?.height ?? 0),
                  );
                }}
                contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
              >
                <AppText muted>
                  Hold a button, row handle, or column handle to drag it. Or
                  select it for editing actions. Buttons do not control your PC
                  here.
                </AppText>
                {selected ? (
                  <View style={{ gap: spacing.sm }}>
                    <View
                      ref={actionHeading}
                      accessible
                      accessibilityRole="header"
                    >
                      <AppText variant="heading">
                        {selected.kind === "cell"
                          ? `Row ${selectedRow + 1}, column ${selectedColumn + 1}`
                          : `${selected.kind === "row" ? "Row" : "Column"} ${selected.index + 1}`}
                      </AppText>
                    </View>
                    {moving ? (
                      <AppText>
                        {selected.kind === "cell"
                          ? "Select a destination cell to move or swap this button."
                          : `Select the ${selected.kind} at the final position. Other ${selected.kind}s shift to make room.`}
                      </AppText>
                    ) : (
                      <>
                        {selected.kind !== "cell" ||
                        draft.cells[selected.index] ? (
                          <ControlButton
                            label={`Move ${selected.kind === "cell" ? "button" : selected.kind}`}
                            onPress={() => {
                              setMoving(true);
                              focus(
                                () =>
                                  nodes.current.get(`${selected.kind}-0`) ??
                                  null,
                              );
                            }}
                          />
                        ) : null}
                        {selected.kind === "cell" ? (
                          draft.cells[selected.index] ? (
                            <ControlButton
                              label="Remove button"
                              onPress={() => {
                                change(setCell(draft, selected.index, null));
                                closeActions();
                              }}
                            />
                          ) : null
                        ) : null}
                        {(["row", "column"] as const)
                          .filter((axis) => selected.kind === axis)
                          .map((axis) => {
                            const index =
                              axis === "row" ? selectedRow : selectedColumn;
                            const count = axis === "row" ? rows : draft.columns;
                            return (
                              <View key={axis} style={{ gap: spacing.sm }}>
                                <ControlButton
                                  label={`Insert ${axis} before`}
                                  disabled={
                                    count >=
                                    (axis === "row" ? MAX_ROWS : MAX_COLUMNS)
                                  }
                                  onPress={() => resize(axis, index, true)}
                                />
                                <ControlButton
                                  label={`Insert ${axis} after`}
                                  disabled={
                                    count >=
                                    (axis === "row" ? MAX_ROWS : MAX_COLUMNS)
                                  }
                                  onPress={() => resize(axis, index + 1, true)}
                                />
                                <ControlButton
                                  label={`Remove ${axis}`}
                                  disabled={count <= 1}
                                  onPress={() => resize(axis, index, false)}
                                />
                              </View>
                            );
                          })}
                      </>
                    )}
                    <ControlButton
                      label="Close editing actions"
                      onPress={closeActions}
                    />
                  </View>
                ) : null}
                <View
                  ref={gridViewport}
                  testID="layout-editor-grid-viewport"
                  onLayout={(event) => {
                    setWidth(event.nativeEvent.layout.width);
                    cancelDrag();
                    measure();
                  }}
                >
                  <ScrollView
                    ref={horizontal}
                    horizontal
                    testID="layout-editor-horizontal"
                    keyboardShouldPersistTaps="handled"
                    showsHorizontalScrollIndicator={overflows}
                    onScroll={(event) => {
                      offset.current.x = event.nativeEvent.contentOffset.x;
                      measure();
                    }}
                    scrollEventThrottle={16}
                    onContentSizeChange={(contentWidth) => {
                      maxOffset.current.x = Math.max(0, contentWidth - width);
                    }}
                  >
                    <View
                      style={{ width: gridWidth, gap: spacing.sm }}
                      onLayout={measure}
                    >
                      <View style={{ flexDirection: "row", gap: spacing.sm }}>
                        <View style={{ width: trackWidth }} />
                        {Array.from({ length: draft.columns }, (_, index) => (
                          <DragHandle
                            key={index}
                            selection={{ kind: "column", index }}
                            enabled={!saving && selected === null}
                            start={startDrag}
                            update={updateDrag}
                            end={endDrag}
                            cancel={cancelDrag}
                          >
                            <View style={{ width: cellWidth }}>
                              <ControlButton
                                controlRef={nodeRefs[`column-${index}`]!}
                                label={`${index + 1}`}
                                accessibilityLabel={`Column ${index + 1}`}
                                contentLayout="stacked"
                                icon="drag-indicator"
                                hint="Select for column actions, or hold to drag."
                                selected={
                                  selected?.kind === "column" &&
                                  selected.index === index
                                }
                                disabled={saving}
                                onPress={() =>
                                  select({ kind: "column", index })
                                }
                              />
                            </View>
                          </DragHandle>
                        ))}
                      </View>
                      {Array.from({ length: rows }, (_, row) => (
                        <View
                          key={row}
                          style={{
                            flexDirection: "row",
                            gap: spacing.sm,
                            borderTopWidth: 2,
                            borderTopColor:
                              dragging?.kind === "row" &&
                              target?.boundary === row
                                ? colors.brand
                                : "transparent",
                            borderBottomWidth: 2,
                            borderBottomColor:
                              dragging?.kind === "row" &&
                              target?.boundary === rows &&
                              row === rows - 1
                                ? colors.brand
                                : "transparent",
                          }}
                        >
                          <DragHandle
                            selection={{ kind: "row", index: row }}
                            enabled={!saving && selected === null}
                            start={startDrag}
                            update={updateDrag}
                            end={endDrag}
                            cancel={cancelDrag}
                          >
                            <View style={{ width: trackWidth }}>
                              <ControlButton
                                controlRef={nodeRefs[`row-${row}`]!}
                                label={`${row + 1}`}
                                accessibilityLabel={`Row ${row + 1}`}
                                contentLayout="stacked"
                                icon="drag-indicator"
                                hint="Select for row actions, or hold to drag."
                                selected={
                                  selected?.kind === "row" &&
                                  selected.index === row
                                }
                                disabled={saving}
                                onPress={() =>
                                  select({ kind: "row", index: row })
                                }
                              />
                            </View>
                          </DragHandle>
                          {draft.cells
                            .slice(
                              row * draft.columns,
                              (row + 1) * draft.columns,
                            )
                            .map((id, column) => {
                              const index = row * draft.columns + column;
                              const control = controls.find(
                                (item) => item.id === id,
                              );
                              return (
                                <DragHandle
                                  key={column}
                                  selection={{ kind: "cell", index }}
                                  enabled={!!id && !saving && selected === null}
                                  start={startDrag}
                                  update={updateDrag}
                                  end={endDrag}
                                  cancel={cancelDrag}
                                >
                                  <View
                                    style={{
                                      width: cellWidth,
                                      opacity:
                                        dragging &&
                                        (dragging.kind === "cell"
                                          ? dragging.index === index
                                          : dragging.kind === "row"
                                            ? dragging.index === row
                                            : dragging.index === column)
                                          ? 0.5
                                          : 1,
                                    }}
                                  >
                                    <ControlButton
                                      controlRef={nodeRefs[`cell-${index}`]!}
                                      label={control?.label ?? "Empty"}
                                      contentLayout="stacked"
                                      accessibilityLabel={`Row ${row + 1}, column ${column + 1}: ${control?.accessibilityLabel ?? control?.label ?? "Empty"}`}
                                      selected={
                                        selected?.kind === "cell" &&
                                        selected.index === index
                                      }
                                      disabled={saving}
                                      onPress={() =>
                                        select({ kind: "cell", index })
                                      }
                                    />
                                    <View
                                      pointerEvents="none"
                                      accessible={false}
                                      style={{
                                        position: "absolute",
                                        top: 0,
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        borderWidth: 2,
                                        borderColor:
                                          dragging?.kind === "cell" &&
                                          target?.index === index
                                            ? colors.brand
                                            : "transparent",
                                        borderLeftColor:
                                          dragging?.kind === "column" &&
                                          target?.boundary === column
                                            ? colors.brand
                                            : undefined,
                                        borderRightColor:
                                          dragging?.kind === "column" &&
                                          target?.boundary === draft.columns &&
                                          column === draft.columns - 1
                                            ? colors.brand
                                            : undefined,
                                      }}
                                    />
                                  </View>
                                </DragHandle>
                              );
                            })}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
                <ControlButton
                  label="Add row at end"
                  disabled={saving || rows >= MAX_ROWS}
                  onPress={() => resize("row", rows, true)}
                />
                <ControlButton
                  label="Add column at end"
                  disabled={saving || draft.columns >= MAX_COLUMNS}
                  onPress={() => resize("column", draft.columns, true)}
                />
                <ControlButton
                  label="Reset to default"
                  disabled={saving}
                  onPress={() =>
                    Alert.alert(
                      "Reset section?",
                      "Save to restore this section’s original responsive arrangement.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Reset",
                          onPress: () => {
                            if (savingRef.current || !mounted.current) return;
                            cancelDrag();
                            setDraft(defaultLayout);
                            setReset(true);
                            setDirty(true);
                            setSelected(null);
                            setMoving(false);
                            setError(null);
                            focus(() => heading.current);
                          },
                        },
                      ],
                    )
                  }
                />
              </ScrollView>
            </View>
            {dragging ? (
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
                <AppText>{dragLabel}</AppText>
                <AppText>
                  {target
                    ? dragging.kind === "cell"
                      ? `Row ${Math.floor(target.index / draft.columns) + 1}, column ${(target.index % draft.columns) + 1}`
                      : `Position ${target.index + 1}`
                    : "Move to a destination"}
                </AppText>
              </Animated.View>
            ) : null}
          </SafeAreaView>
          {pickerCell !== null ? (
            <ActionPicker
              row={Math.floor(pickerCell / draft.columns) + 1}
              column={(pickerCell % draft.columns) + 1}
              options={pickerOptions}
              onSelect={assignAction}
              onClose={closePicker}
            />
          ) : null}
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
}
