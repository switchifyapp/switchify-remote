import {
  type ComponentProps,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Platform, ScrollView, View } from "react-native";
import { ControlButton } from "@/components/ControlButton";
import { AppText } from "@/components/AppText";
import { ResponsiveGrid } from "@/components/ResponsiveGrid";
import { focusAccessibilityTarget } from "@/components/accessibilityFocus";
import { useLayout, useTheme } from "@/theme/ThemeContext";
import { useLayoutEditMode } from "./LayoutEditMode";
import { layoutStore } from "./LayoutStore";
import type { ActionOption } from "@/remote/actions/catalog";
import { sectionGridMetrics } from "./gridMetrics";
import { LayoutEditor } from "./LayoutEditor";
import { type ButtonLayout, type LayoutSurface } from "./model";
import { getSection, sectionDefault, validSectionLayout } from "./sections";

export type LayoutControl = ComponentProps<typeof ControlButton> & {
  id: string;
  option?: ActionOption;
};

/** Owns only one section; cards, surface structure and safety controls stay mounted. */
export function SurfaceLayout({
  surface,
  section,
  controls,
  blocked,
  title,
}: {
  surface: LayoutSurface;
  section: string;
  controls: LayoutControl[];
  blocked?: string | null;
  title?: string;
}) {
  const { enabled: editing } = useLayoutEditMode();
  const layouts = useSyncExternalStore(
    layoutStore.subscribe,
    layoutStore.snapshot,
    layoutStore.snapshot,
  );
  const [editor, setEditor] = useState<{
    initial: ButtonLayout;
    defaults: ButtonLayout;
    customized: boolean;
  } | null>(null);
  const [visible, setVisible] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [width, setWidth] = useState(0);
  const trigger = useRef<View>(null);
  const frame = useRef<number | null>(null);
  const mounted = useRef(true);
  const opening = useRef(false);
  const editableRef = useRef(editing && !blocked);
  useEffect(() => {
    editableRef.current = editing && !blocked;
  }, [blocked, editing]);
  const { spacing } = useTheme();
  const { fontScale } = useLayout();
  useEffect(() => {
    mounted.current = true;
    void layoutStore.load();
    return () => {
      mounted.current = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);
  const definition = getSection(surface, section);
  if (!definition) return null;
  const stored = layouts[surface]?.[section];
  const layout = validSectionLayout(surface, section, stored)
    ? stored
    : undefined;
  const restore = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (mounted.current) focusAccessibilityTarget(trigger.current);
    });
  };
  const { cellWidth, gridWidth, overflows } = sectionGridMetrics(
    width,
    layout?.columns ?? 1,
    spacing.sm,
  );
  return (
    <View
      testID={`section-${surface}-${section}`}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ gap: spacing.sm }}
    >
      <AppText accessibilityRole="header" variant="heading">
        {title ?? definition.title}
      </AppText>
      {editing ? (
        <ControlButton
          controlRef={trigger}
          label="Edit section"
          accessibilityLabel={`Edit ${definition.title} section`}
          icon="edit"
          compact
          disabled={!!blocked}
          onPress={() => {
            if (opening.current || !editableRef.current) return;
            opening.current = true;
            void layoutStore.load().then(() => {
              opening.current = false;
              if (!mounted.current || !editableRef.current) return;
              const defaults = sectionDefault(
                definition,
                width,
                fontScale,
                spacing.sm,
              );
              const current = layoutStore.snapshot()[surface]?.[section];
              const customized = validSectionLayout(surface, section, current);
              setEditor({
                initial: customized ? current : defaults,
                defaults,
                customized,
              });
              setEditorSession((value) => value + 1);
              setVisible(true);
            });
          }}
        />
      ) : null}
      {editing && blocked ? <AppText muted>{blocked}</AppText> : null}
      {layout ? (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          testID="section-grid-scroll"
          showsHorizontalScrollIndicator={overflows}
          contentContainerStyle={{ width: gridWidth }}
        >
          <View style={{ gap: spacing.sm }}>
            {Array.from(
              { length: layout.cells.length / layout.columns },
              (_, row) => (
                <View
                  key={row}
                  testID="surface-layout-row"
                  style={{
                    flexDirection: "row",
                    minHeight: 58,
                    gap: spacing.sm,
                  }}
                >
                  {layout.cells
                    .slice(row * layout.columns, (row + 1) * layout.columns)
                    .map((id, column) => {
                      const control = controls.find((item) => item.id === id);
                      return (
                        <View
                          key={column}
                          style={{ width: cellWidth, minWidth: 48 }}
                        >
                          {control ? (
                            <ControlButton
                              {...control}
                              contentLayout="stacked"
                            />
                          ) : null}
                        </View>
                      );
                    })}
                </View>
              ),
            )}
          </View>
        </ScrollView>
      ) : (
        definition.groups.map((group, index) => (
          <ResponsiveGrid
            key={index}
            testID={`default-${surface}-${section}-${index}`}
            minItemWidth={group.minItemWidth}
            {...(group.gap === undefined ? {} : { gap: group.gap })}
            {...(group.maxColumns === undefined
              ? {}
              : { maxColumns: group.maxColumns })}
            {...(group.exactColumns === undefined
              ? {}
              : { exactColumns: group.exactColumns })}
          >
            {group.ids.map((id) => {
              const control = controls.find((item) => item.id === id);
              return control ? <ControlButton key={id} {...control} /> : null;
            })}
          </ResponsiveGrid>
        ))
      )}
      {editor ? (
        <LayoutEditor
          key={editorSession}
          title={definition.title}
          surface={surface}
          visible={visible}
          controls={controls}
          initial={editor.initial}
          defaultLayout={editor.defaults}
          initiallyCustomized={editor.customized}
          onSave={(next) => layoutStore.save(surface, section, next)}
          onDismiss={restore}
          onClose={() => {
            setVisible(false);
            if (Platform.OS === "android") restore();
          }}
        />
      ) : null}
    </View>
  );
}
