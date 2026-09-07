import { View } from "react-native";
import { ControlButton } from "@/components/ControlButton";
import { useLayoutEditMode } from "@/layouts/LayoutEditMode";
import type { RemoteSurface } from "@/storage/PreferencesStore";
import { useLayout, useTheme } from "@/theme/ThemeContext";
import { SurfaceSelector } from "./SurfaceSelector";

export function RemoteToolbar({ selected }: { selected: RemoteSurface }) {
  const { enabled, toggle } = useLayoutEditMode();
  const { spacing } = useTheme();
  const { fontScale } = useLayout();
  return (
    <View
      testID="remote-toolbar"
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "stretch",
        gap: spacing.sm,
      }}
    >
      <View style={{ flexGrow: 1, flexBasis: 160, maxWidth: "100%" }}>
        <SurfaceSelector selected={selected} />
      </View>
      {selected !== "forwarding" ? (
        <View
          style={{
            flexBasis: 180 * Math.max(1, fontScale),
            flexGrow: 0,
            maxWidth: "100%",
          }}
        >
          <ControlButton
            label={enabled ? "Done editing" : "Edit layout"}
            accessibilityLabel="Layout edit mode"
            hint={
              enabled
                ? "Hides section editing controls."
                : "Shows section editing controls."
            }
            icon="edit"
            selected={enabled}
            onPress={toggle}
          />
        </View>
      ) : null}
    </View>
  );
}
