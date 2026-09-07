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
  const repeatingKey = state.repeat === "keyboard.key";
  const stopLabel = repeatingKey ? "Stop repeating" : "Stop movement";
  useAccessibilityAnnouncement(
    state.repeat
      ? repeatingKey
        ? "Key is repeating."
        : "Pointer movement is repeating."
      : null,
  );
  const capabilities = session.profile?.capabilities;
  const repeatUnavailableWarning =
    (capabilities?.mouseRepeat.supported && capabilities.mouseRepeat.enabled) ||
    (capabilities?.keyRepeat.supported && capabilities.keyRepeat.enabled);
  return (
    <>
      {state.repeat ? (
        <>
          <ActionButton
            icon="stop-circle"
            label={stopLabel}
            tone="danger"
            onPress={() => void session.stopRepeat()}
          />
          <StatusBadge
            icon="autorenew"
            label={`${repeatingKey ? "A key is" : "Movement is"} repeating. Use ${stopLabel} or another control to stop.`}
            tone="warning"
          />
        </>
      ) : null}
      {Platform.OS === "android" &&
      !physicalSwitchStopAvailable &&
      repeatUnavailableWarning ? (
        <Card>
          <AppText muted>
            Switchify is unavailable. Use a Remote control to stop a repeat.
          </AppText>
        </Card>
      ) : null}
    </>
  );
}
