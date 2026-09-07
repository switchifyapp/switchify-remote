import { View } from "react-native";
import { SurfaceLayout } from "@/layouts/SurfaceLayout";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import type { PcPlatform } from "@/domain/protocol/types";
import { useTheme } from "@/theme/ThemeContext";
import { useRemoteActions } from "./actions/useRemoteActions";
import { RepeatStatus, repeatStopLabel } from "./RepeatStatus";
import type { RemoteSession, RemoteSessionState } from "./RemoteSession";

export function WindowSurface({
  session,
  state,
  platform,
  physicalSwitchStopAvailable = true,
}: {
  session: RemoteSession;
  state: RemoteSessionState;
  platform: PcPlatform;
  physicalSwitchStopAvailable?: boolean;
}) {
  const { spacing } = useTheme();
  const blocked =
    state.repeat || state.dragging || state.modifiers.length
      ? `${repeatStopLabel(state.repeat)}, end dragging, and release modifiers before editing.`
      : null;
  const controls = useRemoteActions({ surface: "window", session, platform });
  return (
    <View style={{ gap: spacing.md }}>
      <RepeatStatus
        session={session}
        state={state}
        physicalSwitchStopAvailable={physicalSwitchStopAvailable}
      />
      <Card>
        <SurfaceLayout
          surface="window"
          section="modifiers"
          controls={controls}
          blocked={blocked}
        />
        <AppText muted variant="caption">
          Held modifiers stay active until selected again, used in a shortcut,
          or the remote disconnects.
        </AppText>
      </Card>
      <Card>
        <SurfaceLayout
          surface="window"
          section="windows"
          controls={controls}
          blocked={blocked}
        />
      </Card>
      <Card>
        <SurfaceLayout
          surface="window"
          section="shortcuts"
          controls={controls}
          blocked={blocked}
        />
      </Card>
      {session.profile?.capabilities.displayNavigation.supported &&
      session.profile.capabilities.displayNavigation.displayCount > 1 ? (
        <Card>
          <SurfaceLayout
            surface="window"
            section="monitors"
            controls={controls}
            blocked={blocked}
          />
        </Card>
      ) : null}
    </View>
  );
}
