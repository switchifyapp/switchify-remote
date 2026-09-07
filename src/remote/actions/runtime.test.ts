import { act, renderHook } from "@testing-library/react-native";
import type { ConnectionManager } from "@/connection/ConnectionManager";
import type { PointerProfile } from "@/domain/protocol/types";
import { preferencesStore } from "@/storage/PreferencesStore";
import { RemoteSession } from "../RemoteSession";
import { executeAction, resolveActions, type ActionContext } from "./runtime";
import { getAction } from "./catalog";
import { useRemoteActions } from "./useRemoteActions";

const sessions: RemoteSession[] = [];
function setup(
  commands = [
    "mouse.move",
    "mouse.click",
    "mouse.doubleClick",
    "mouse.rightClick",
    "mouse.dragStart",
    "mouse.dragEnd",
    "mouse.scroll",
    "pointer.speed.set",
    "pointer.display.move",
    "keyboard.modifierDown",
    "keyboard.modifierUp",
    "keyboard.shortcut",
    "window.control",
    "keyboard.key",
    "keyboard.typeText",
    "keyboard.textStream.open",
    "keyboard.textStream.chunk",
    "keyboard.textStream.key",
    "keyboard.textStream.close",
  ],
) {
  const send = jest.fn(async (_type: string, _payload?: unknown) => true);
  const profile: PointerProfile = {
    displayId: "fixture",
    scaleFactor: 1,
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    maxDelta: 128,
    recommendedDeltas: { small: 32, medium: 64, large: 128 },
    capabilities: {
      noAckCommands: [],
      noAckMouseMove: false,
      supportedCommands: commands,
      mouseRepeat: {
        supported: false,
        enabled: false,
        intervalMs: 250,
        minIntervalMs: 100,
        maxIntervalMs: 2000,
      },
      pointerSpeed: {
        supported: true,
        setSupported: true,
        scalePercent: 100,
        minScalePercent: 5,
        maxScalePercent: 225,
        stepPercent: 5,
        baseMoveDelta: 64,
        effectiveMoveDelta: 64,
      },
      displayNavigation: { supported: true, displayCount: 2 },
    },
  };
  const session = new RemoteSession(
    { send } as unknown as ConnectionManager,
    profile,
  );
  sessions.push(session);
  const context: ActionContext = {
    session,
    surface: "mouse",
    platform: "windows",
  };
  return { send, session, profile, context };
}
afterEach(() => {
  sessions.splice(0).forEach((session) => session.dispose());
});
it("shares monitor execution and availability across surfaces", async () => {
  const { context, send } = setup();
  for (const surface of ["mouse", "typing", "window"] as const)
    await executeAction(getAction("monitor.left")!, { ...context, surface });
  expect(send.mock.calls).toHaveLength(3);
  expect(
    send.mock.calls.every(
      ([type, payload]) =>
        type === "pointer.display.move" &&
        JSON.stringify(payload) === '{"direction":"left"}',
    ),
  ).toBe(true);
});
it.each([
  ["move.2.0", "mouse.move", { dx: 64, dy: -64 }],
  ["move.1.1", "mouse.click", { button: "left" }],
  ["click.double", "mouse.doubleClick", {}],
  ["click.right", "mouse.rightClick", {}],
  ["scroll.up", "mouse.scroll", { dx: 0, dy: 5 }],
  ["speed.faster", "pointer.speed.set", { scalePercent: 105 }],
  ["window.maximizeFocused", "window.control", { action: "maximizeFocused" }],
  ["key.Enter", "keyboard.key", { key: "Enter" }],
] as const)(
  "executes %s on a different surface through the shared session",
  async (id, type, payload) => {
    const { context, send } = setup();
    await executeAction(getAction(id)!, { ...context, surface: "window" });
    expect(send.mock.calls).toContainEqual(
      expect.arrayContaining([type, expect.objectContaining(payload)]),
    );
  },
);
it("retains live Enter submission and uses the stream for other live keys", async () => {
  const { context, session, send } = setup();
  const submitLive = jest.fn(async () => undefined);
  const live: ActionContext = {
    ...context,
    surface: "typing",
    typing: { mode: "live", draft: "", submitting: false, submitLive },
  };
  await executeAction(getAction("key.Enter")!, live);
  expect(submitLive).toHaveBeenCalledTimes(1);
  expect(send).not.toHaveBeenCalled();
  const stream = jest.spyOn(session, "streamKey");
  await executeAction(getAction("key.Backspace")!, live);
  expect(stream).toHaveBeenCalledWith("Backspace");
  await executeAction(getAction("key.Enter")!, {
    ...live,
    typing: { ...live.typing!, submitting: true },
  });
  expect(submitLive).toHaveBeenCalledTimes(1);
});
it("prevents draft actions outside Typing and respects draft mode and text", async () => {
  const { context, send } = setup();
  const typing = {
    mode: "draft" as const,
    draft: "fixture",
    submitting: false,
    submitLive: jest.fn(async () => undefined),
  };
  await preferencesStore.update({ draft: "fixture" });
  await executeAction(getAction("draft.send")!, { ...context, typing });
  expect(send).not.toHaveBeenCalled();
  await executeAction(getAction("draft.clear")!, { ...context, typing });
  expect(preferencesStore.snapshot().draft).toBe("fixture");
  await executeAction(getAction("draft.send")!, {
    ...context,
    surface: "typing",
    typing,
  });
  expect(send.mock.calls[0]).toEqual(
    expect.arrayContaining(["keyboard.typeText", { text: "fixture" }]),
  );
  expect(preferencesStore.snapshot().draft).toBe("");
  const actions = resolveActions({
    ...context,
    surface: "typing",
    typing: { ...typing, mode: "live" },
  });
  expect(actions.find((action) => action.id === "draft.send")?.disabled).toBe(
    true,
  );
});
it("does not clear a newer draft after an asynchronous send completes", async () => {
  const { context, send } = setup();
  let finish!: (value: boolean) => void;
  send.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await preferencesStore.update({ draft: "fixture one" });
  const pending = executeAction(getAction("draft.send")!, {
    ...context,
    surface: "typing",
    typing: {
      mode: "draft",
      draft: "fixture one",
      submitting: false,
      submitLive: jest.fn(),
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  await preferencesStore.update({ draft: "fixture two" });
  finish(true);
  await pending;
  expect(preferencesStore.snapshot().draft).toBe("fixture two");
});
it("updates labels and capability explanations without removing catalog options", async () => {
  const { context, profile, session } = setup();
  await executeAction(getAction("modifier.Meta")!, context);
  const actions = resolveActions({ ...context, platform: "macos" });
  expect(actions.find((action) => action.id === "modifier.Meta")).toMatchObject(
    { label: "Command", selected: true },
  );
  expect(actions.find((action) => action.id === "shortcut.C")?.label).toBe(
    "Command+C",
  );
  profile.capabilities.displayNavigation.displayCount = 1;
  expect(
    resolveActions(context).find((action) => action.id === "monitor.left"),
  ).toMatchObject({
    disabled: true,
    option: { explanation: "Requires a PC with multiple monitors." },
  });
  profile.capabilities.pointerSpeed.scalePercent = 225;
  expect(
    resolveActions(context).find((action) => action.id === "speed.faster")
      ?.disabled,
  ).toBe(true);
  await session.toggleDrag();
  expect(
    resolveActions(context).find((action) => action.id === "drag.toggle"),
  ).toMatchObject({ label: "End drag", selected: true });
});
it("rechecks support at execution instead of dispatching stale enabled actions", async () => {
  const { context, send, profile } = setup();
  const resolved = resolveActions(context).find(
    (action) => action.id === "key.Enter",
  )!;
  profile.capabilities.supportedCommands = [];
  resolved.onPress();
  await Promise.resolve();
  expect(send).not.toHaveBeenCalled();
});
it("binds callbacks to the current session after reconnecting", async () => {
  const first = setup();
  const second = setup();
  const view = await renderHook(({ context }: { context: ActionContext }) => useRemoteActions(context), {
    initialProps: { context: first.context },
  });
  const button = view.result.current.find(
    (action) => action.id === "key.Enter",
  )!;
  await view.rerender({ context: second.context });
  await act(async () => {
    button.onPress();
  });
  expect(first.send).not.toHaveBeenCalled();
  expect(second.send).toHaveBeenCalled();
});
