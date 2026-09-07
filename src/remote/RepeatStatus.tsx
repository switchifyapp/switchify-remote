import { Platform } from "react-native";
import { ActionButton } from "@/components/ActionButton";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { useAccessibilityAnnouncement } from "@/components/useAccessibilityAnnouncement";
import type { RemoteSession, RemoteSessionState } from "./RemoteSession";

export function RepeatStatus({
  session,
  state,
  physicalSwitchStopAvailable = true,
}: {
  session: RemoteSession;
  state: RemoteSessionState;
  physicalSwitchStopAvailable?: boolean;
}) {
  useAccessibilityAnnouncement(
    state.repeat ? "Pointer movement is repeating." : null,
  );
  return (
    <>
      {state.repeat ? (
        <>
          <ActionButton
            icon="stop-circle"
            label="Stop movement"
            tone="danger"
            onPress={() => void session.stopRepeat()}
          />
          <StatusBadge
            icon="autorenew"
            label="Movement is repeating. Use Stop movement or another control to stop."
            tone="warning"
          />
        </>
      ) : null}
      {Platform.OS === "android" &&
      !physicalSwitchStopAvailable &&
      session.profile?.capabilities.mouseRepeat.supported &&
      session.profile.capabilities.mouseRepeat.enabled ? (
        <Card>
          <AppText muted>
            Switchify is unavailable. Use a Remote control to stop movement
            repeat.
          </AppText>
        </Card>
      ) : null}
    </>
  );
}
