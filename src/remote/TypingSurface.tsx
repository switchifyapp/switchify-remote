import { useEffect, useMemo, useRef, useState } from "react";
import { TextInput, View } from "react-native";

import { ControlButton } from "@/components/ControlButton";
import { StatusBadge } from "@/components/StatusBadge";
import { preferencesStore, type TypingMode } from "@/storage/PreferencesStore";
import { useTheme } from "@/theme/ThemeContext";
import { scheduleLiveTextInputFocus } from "./focusLiveTextInput";
import { LiveTypingController } from "./LiveTypingController";
import { SurfaceLayout } from "@/layouts/SurfaceLayout";
import type { PcPlatform } from "@/domain/protocol/types";
import { useRemoteActions } from "./actions/useRemoteActions";
import { RepeatStatus } from "./RepeatStatus";
import type { RemoteSession } from "./RemoteSession";

export function TypingSurface({
  session,
  mode,
  draft,
  platform = "windows",
  physicalSwitchStopAvailable = true,
}: {
  session: RemoteSession;
  mode: TypingMode;
  draft: string;
  platform?: PcPlatform;
  physicalSwitchStopAvailable?: boolean;
}) {
  const [liveText, setLiveText] = useState("");
  const [liveFailure, setLiveFailure] = useState<"text" | "enter" | null>(null);
  const [liveSubmitting, setLiveSubmitting] = useState(false);
  const cancelLiveFocus = useRef<(() => void) | null>(null);
  const liveFocusPending = useRef(false);
  const liveRevision = useRef(0);
  const liveSubmittingRef = useRef(false);
  const liveInputRef = useRef<TextInput>(null);
  const latestMode = useRef(mode);
  const latestSession = useRef(session);
  const mounted = useRef(true);
  const live = useMemo(() => new LiveTypingController(session), [session]);
  const { colors, radii, spacing, typography } = useTheme();
  const liveSupported = session.supportsAll(
    "keyboard.textStream.open",
    "keyboard.textStream.chunk",
    "keyboard.textStream.key",
    "keyboard.textStream.close",
  );
  const draftSupported = session.supports("keyboard.typeText");
  const reconcileLive = (next: string) => {
    const revision = ++liveRevision.current;
    setLiveFailure(null);
    void live.update(next).then((sent) => {
      if (revision === liveRevision.current)
        setLiveFailure(sent ? null : "text");
    });
  };
  const changeLive = (next: string) => {
    if (liveSubmittingRef.current) return;
    setLiveText(next);
    reconcileLive(next);
  };
  const submitLive = async () => {
    if (!liveSupported || liveSubmittingRef.current) return;
    cancelLiveFocus.current?.();
    cancelLiveFocus.current = null;
    liveFocusPending.current = false;
    liveSubmittingRef.current = true;
    const submittingSession = session;
    const revision = ++liveRevision.current;
    setLiveFailure(null);
    setLiveSubmitting(true);
    const sent = await live.submitLine();
    if (!mounted.current) return;
    if (revision === liveRevision.current) {
      if (sent) setLiveText("");
      else setLiveFailure("enter");
    }
    liveSubmittingRef.current = false;
    setLiveSubmitting(false);
    liveFocusPending.current =
      latestMode.current === "live" &&
      latestSession.current === submittingSession;
  };
  useEffect(() => {
    cancelLiveFocus.current?.();
    cancelLiveFocus.current = null;
    if (liveSubmitting || !liveFocusPending.current || mode !== "live") return;
    liveFocusPending.current = false;
    const cancel = scheduleLiveTextInputFocus(() => liveInputRef.current);
    cancelLiveFocus.current = cancel;
    return () => {
      if (cancelLiveFocus.current !== cancel) return;
      cancel();
      cancelLiveFocus.current = null;
    };
  }, [liveSubmitting, mode, session]);
  useEffect(() => {
    const changed =
      latestMode.current !== mode || latestSession.current !== session;
    latestMode.current = mode;
    latestSession.current = session;
    if (!changed) return;
    cancelLiveFocus.current?.();
    cancelLiveFocus.current = null;
    liveFocusPending.current = false;
  }, [mode, session]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelLiveFocus.current?.();
      cancelLiveFocus.current = null;
      liveFocusPending.current = false;
      liveRevision.current += 1;
      liveSubmittingRef.current = false;
    };
  }, []);
  const controls = useRemoteActions({
    surface: "typing",
    session,
    platform,
    typing: { mode, draft, submitting: liveSubmitting, submitLive },
  });
  const sessionState = session.snapshot();
  const blocked = liveSubmitting
    ? "Finish sending Enter before editing."
    : sessionState.repeat ||
        sessionState.dragging ||
        sessionState.modifiers.length
      ? "Stop movement, end dragging, and release modifiers before editing."
      : null;
  return (
    <View style={{ gap: spacing.md }}>
      <RepeatStatus
        session={session}
        state={sessionState}
        physicalSwitchStopAvailable={physicalSwitchStopAvailable}
      />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ControlButton
          label="Type live"
          disabled={!liveSupported}
          selected={mode === "live"}
          onPress={() => void preferencesStore.update({ typingMode: "live" })}
        />
        <ControlButton
          label="Write a draft"
          disabled={!draftSupported}
          selected={mode === "draft"}
          onPress={() => {
            void session.closeStream();
            void preferencesStore.update({ typingMode: "draft" });
          }}
        />
      </View>
      <TextInput
        ref={liveInputRef}
        accessibilityLabel={mode === "live" ? "Live text" : "Draft text"}
        editable={
          mode === "live" ? liveSupported && !liveSubmitting : draftSupported
        }
        maxLength={2000}
        multiline
        submitBehavior={mode === "live" ? "submit" : "newline"}
        placeholder={
          mode === "live"
            ? "Type on your PC"
            : "Nothing is sent until you choose Send"
        }
        placeholderTextColor={colors.textMuted}
        style={[
          typography.body,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.lg,
            borderWidth: 1,
            color: colors.text,
            minHeight: 150,
            padding: spacing.lg,
            textAlignVertical: "top",
          },
        ]}
        value={mode === "live" ? liveText : draft}
        onChangeText={
          mode === "live"
            ? changeLive
            : (text) => void preferencesStore.update({ draft: text })
        }
        onSubmitEditing={mode === "live" ? () => void submitLive() : undefined}
      />
      {mode === "live" ? (
        <View style={{ gap: spacing.sm }}>
          <StatusBadge
            icon={liveFailure ? "error-outline" : "check-circle"}
            label={
              !liveSupported
                ? "Live typing is not supported by this PC."
                : liveFailure === "enter"
                  ? "Enter has not reached your PC."
                  : liveFailure === "text"
                    ? "Some text has not reached your PC."
                    : liveSubmitting
                      ? "Sending Enter"
                      : "Live · sent as you type"
            }
            tone={liveFailure ? "danger" : "success"}
          />
          {liveFailure === "text" ? (
            <ControlButton
              label="Retry unsent text"
              onPress={() => reconcileLive(liveText)}
            />
          ) : liveFailure === "enter" ? (
            <ControlButton
              label="Retry Enter"
              onPress={() => void submitLive()}
            />
          ) : null}
        </View>
      ) : null}
      {mode === "draft" ? (
        <SurfaceLayout
          surface="typing"
          section="draft"
          controls={controls}
          blocked={blocked}
        />
      ) : null}
      <SurfaceLayout
        surface="typing"
        section="keys"
        controls={controls}
        blocked={blocked}
      />
    </View>
  );
}
