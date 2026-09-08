import { View } from "react-native";
import { SurfaceLayout } from "@/layouts/SurfaceLayout";
import { useLayout, useTheme } from "@/theme/ThemeContext";
import type { PcPlatform } from "@/domain/protocol/types";
import { useRemoteActions } from "./actions/useRemoteActions";
import { RepeatStatus, repeatStopLabel } from "./RepeatStatus";
import type { RemoteSession, RemoteSessionState } from "./RemoteSession";

export function MouseSurface({
  session,
  state,
  physicalSwitchStopAvailable = true,
  platform = "windows",
}: {
  session: RemoteSession;
  state: RemoteSessionState;
  physicalSwitchStopAvailable?: boolean;
  platform?: PcPlatform;
}) {
  const profile = session.profile;
  const speed = profile?.capabilities.pointerSpeed;
  const display = profile?.capabilities.displayNavigation;
  const { isExpanded, isLandscape, isLargeText, isMedium } = useLayout();
  const { spacing } = useTheme();
  const twoPane = (isExpanded || (isMedium && isLandscape)) && !isLargeText;
  const blocked =
    state.repeat || state.dragging || state.modifiers.length
      ? `${repeatStopLabel(state.repeat)}, end dragging, and release modifiers before editing.`
      : null;
  const controls = useRemoteActions({ surface: "mouse", session, platform });
  return (
    <View style={{ gap: spacing.md }}>
      <RepeatStatus
        session={session}
        state={state}
        physicalSwitchStopAvailable={physicalSwitchStopAvailable}
      />
      <View
        style={{
          alignItems: "flex-start",
          flexDirection: twoPane ? "row" : "column",
          gap: spacing.xl,
        }}
      >
        <View
          testID="mouse-movement"
          style={{
            flex: twoPane ? 1 : undefined,
            maxWidth: twoPane ? 400 : undefined,
            minWidth: twoPane ? 320 : undefined,
            width: "100%",
          }}
        >
          <SurfaceLayout
            surface="mouse"
            section="movement"
            controls={controls}
            blocked={blocked}
          />
        </View>
        <View
          testID="mouse-secondary"
          style={{
            flex: 1,
            gap: spacing.md,
            minWidth: twoPane ? 300 : undefined,
            width: twoPane ? undefined : "100%",
          }}
        >
          <SurfaceLayout
            surface="mouse"
            section="clicks"
            controls={controls}
            blocked={blocked}
          />
          {speed?.supported ? (
            <SurfaceLayout
              surface="mouse"
              section="speed"
              title={`Pointer speed · ${speed.scalePercent}%`}
              controls={controls}
              blocked={blocked}
            />
          ) : null}
          {display?.supported && display.displayCount > 1 ? (
            <SurfaceLayout
              surface="mouse"
              section="monitors"
              controls={controls}
              blocked={blocked}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}
