import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Platform, View } from "react-native";
import { ControlButton } from "@/components/ControlButton";
import { AppText } from "@/components/AppText";
import { focusAccessibilityTarget } from "@/components/accessibilityFocus";
import { useTheme } from "@/theme/ThemeContext";
import { layoutStore } from "./LayoutStore";
import { LayoutEditor } from "./LayoutEditor";
import { initialLayout, type LayoutSurface } from "./model";

export type LayoutControl = ComponentProps<typeof ControlButton> & {
  id: string;
};
export function SurfaceLayout({
  surface,
  controls,
  blocked,
  children,
  customStatus,
}: {
  surface: LayoutSurface;
  controls: LayoutControl[];
  blocked?: string | null;
  children: ReactNode;
  customStatus?: ReactNode;
}) {
  const layouts = useSyncExternalStore(
    layoutStore.subscribe,
    layoutStore.snapshot,
    layoutStore.snapshot,
  );
  const [editing, setEditing] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const trigger = useRef<View>(null);
  const frame = useRef<number | null>(null);
  const mounted = useRef(true);
  const opening = useRef(false);
  const blockedRef = useRef(blocked);
  useEffect(() => { blockedRef.current = blocked; }, [blocked]);
  const { spacing } = useTheme();
  useEffect(() => {
    mounted.current = true;
    void layoutStore.load();
    return () => {
      mounted.current = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);
  const stored = layouts[surface];
  const layout = stored?.cells.every(
    (id) => id === null || controls.some((control) => control.id === id),
  )
    ? stored
    : undefined;
  const restore = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      focusAccessibilityTarget(trigger.current);
    });
  };
  return (
    <View style={{ gap: spacing.md }}>
      <ControlButton
        controlRef={trigger}
        label="Edit layout"
        icon="edit"
        disabled={!!blocked}
        onPress={() => {
          if (opening.current || blockedRef.current) return;
          opening.current = true;
          void layoutStore.load().then(() => {
            opening.current = false;
            if (!mounted.current || blockedRef.current) return;
            setEditorSession((value) => value + 1);
            setEditing(true);
          });
        }}
      />
      {blocked ? <AppText muted>{blocked}</AppText> : null}
      {layout ? customStatus : null}
      {layout ? (
        <View style={{ gap: spacing.sm }}>
          {Array.from(
            { length: layout.cells.length / layout.columns },
            (_, row) => (
              <View
                key={row}
                testID="surface-layout-row"
                style={{
                  flexDirection: "row",
                  alignItems: "stretch",
                  minHeight: 58,
                  gap: spacing.sm,
                }}
              >
                {layout.cells
                  .slice(row * layout.columns, (row + 1) * layout.columns)
                  .map((id, column) => {
                    const control = controls.find((item) => item.id === id);
                    return (
                      <View key={column} style={{ flex: 1, minWidth: 48 }}>
                        {control ? <ControlButton {...control} /> : null}
                      </View>
                    );
                  })}
              </View>
            ),
          )}
        </View>
      ) : (
        children
      )}
      {editorSession > 0 ? (
        <LayoutEditor
          key={editorSession}
          visible={editing}
          controls={controls}
          initial={
            layout ?? initialLayout(controls.map((control) => control.id))
          }
          onSave={(next) => layoutStore.save(surface, next)}
          onDismiss={restore}
          onClose={() => {
            setEditing(false);
            if (Platform.OS === "android") restore();
          }}
        />
      ) : null}
    </View>
  );
}
