import { View } from "react-native";
import { IconButton } from "@/components/IconButton";
import { useLayoutEditMode } from "@/layouts/LayoutEditMode";
import type { RemoteSurface } from "@/storage/PreferencesStore";
import { useTheme } from "@/theme/ThemeContext";
import { SurfaceSelector } from "./SurfaceSelector";

export function RemoteToolbar({ selected }: { selected: RemoteSurface }) {
  const { enabled, toggle } = useLayoutEditMode();
  const { spacing } = useTheme();
  return (
    <View
      testID="remote-toolbar"
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        gap: spacing.sm,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <SurfaceSelector selected={selected} />
      </View>
      {selected !== "forwarding" ? (
        <IconButton
          accessibilityLabel={enabled ? "Done editing" : "Edit layout"}
          hint={
            enabled
              ? "Hides section editing controls."
              : "Shows section editing controls."
          }
          icon={enabled ? "check" : "edit"}
          selected={enabled}
          onPress={toggle}
        />
      ) : null}
    </View>
  );
}
