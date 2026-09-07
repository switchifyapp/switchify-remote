import {
  act,
  fireEvent,
  render as renderNative,
} from "@testing-library/react-native";
import type { ReactElement } from "react";
import { LayoutEditModeContext } from "./LayoutEditMode";
import { Alert, StyleSheet } from "react-native";
import { MouseSurface } from "@/remote/MouseSurface";
import { WindowSurface } from "@/remote/WindowSurface";
import type { PointerProfile } from "@/domain/protocol/types";
import { SurfaceLayout } from "./SurfaceLayout";
import { layoutStore } from "./LayoutStore";
import { sectionDefinitions } from "./sections";
import { TypingSurface } from "@/remote/TypingSurface";
import { RemoteSession } from "@/remote/RemoteSession";
import type { ConnectionManager } from "@/connection/ConnectionManager";
jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual("react-native");
  const gesture = () => {
    const g: Record<string, unknown> = {};
    for (const name of [
      "enabled",
      "activateAfterLongPress",
      "runOnJS",
      "onStart",
      "onUpdate",
      "onEnd",
      "onFinalize",
    ])
      g[name] = () => g;
    return g;
  };
  return {
    GestureHandlerRootView: View,
    GestureDetector: View,
    Gesture: { Pan: gesture },
  };
});

const render = (element: ReactElement) =>
  renderNative(element, {
    wrapper: ({ children }) => (
      <LayoutEditModeContext.Provider
        value={{ enabled: true, toggle: jest.fn() }}
      >
        {children}
      </LayoutEditModeContext.Provider>
    ),
  });

beforeEach(async () => {
  for (const surface of ["mouse", "typing", "window"] as const)
    for (const section of Object.keys(sectionDefinitions[surface]))
      await layoutStore.save(surface, section, null);
});
const command = jest.fn();
const clicks = [
  { id: "click.double", label: "Double click", onPress: command },
  { id: "drag.toggle", label: "Start drag", onPress: command },
];
it("preserves empty leading, middle and trailing rows without extra scan stops", async () => {
  await layoutStore.save("mouse", "clicks", {
    columns: 1,
    cells: [null, "click.double", null, "drag.toggle", null],
  });
  const view = await render(
    <SurfaceLayout surface="mouse" section="clicks" controls={clicks} />,
  );
  expect(view.getAllByTestId("surface-layout-row")).toHaveLength(5);
  for (const row of view.getAllByTestId("surface-layout-row"))
    expect(
      StyleSheet.flatten(row.props.style).minHeight,
    ).toBeGreaterThanOrEqual(48);
  expect(view.getAllByRole("button")).toHaveLength(3);
  expect(view.getByRole("header", { name: "Clicks and scroll" })).toBeTruthy();
});
it("no-op Save leaves the default responsive presentation intact", async () => {
  const view = await render(
    <SurfaceLayout surface="mouse" section="clicks" controls={clicks} />,
  );
  await fireEvent.press(view.getByLabelText("Edit Clicks and scroll section"));
  await fireEvent.press(view.getByText("Save layout"));
  expect(layoutStore.snapshot().mouse?.clicks).toBeUndefined();
  expect(view.getByTestId("default-mouse-clicks-0")).toBeTruthy();
});
it("keeps original actions and updates dynamic labels and availability", async () => {
  await layoutStore.save("mouse", "clicks", {
    columns: 2,
    cells: ["drag.toggle", "click.double"],
  });
  const view = await render(
    <SurfaceLayout surface="mouse" section="clicks" controls={clicks} />,
  );
  await fireEvent.press(view.getByText("Double click"));
  expect(command).toHaveBeenCalled();
  await view.rerender(
    <SurfaceLayout
      surface="mouse"
      section="clicks"
      controls={[
        clicks[0]!,
        { ...clicks[1]!, label: "End drag", selected: true, disabled: true },
      ]}
    />,
  );
  expect(
    view.getByLabelText("End drag").props.accessibilityState,
  ).toMatchObject({ selected: true, disabled: true });
});
it("Save preserves neighboring section cards, headings, help and default grids", async () => {
  const session = new RemoteSession(
    { send: jest.fn(async () => true) } as unknown as ConnectionManager,
    null,
  );
  const view = await render(
    <WindowSurface
      session={session}
      state={session.snapshot()}
      platform="macos"
    />,
  );
  await fireEvent.press(view.getByLabelText("Edit Windows section"));
  await fireEvent.press(view.getByText("Add row at end"));
  await fireEvent.press(view.getByText("Save layout"));
  for (const name of ["Modifiers", "Windows", "Shortcuts"])
    expect(view.getByRole("header", { name })).toBeTruthy();
  expect(view.getByText(/Held modifiers stay active/)).toBeTruthy();
  expect(view.getByTestId("default-window-modifiers-0")).toBeTruthy();
  expect(view.getByTestId("default-window-shortcuts-0")).toBeTruthy();
  expect(view.getByTestId("section-window-windows")).toBeTruthy();
  expect(layoutStore.snapshot().window?.windows).toBeDefined();
  expect(layoutStore.snapshot().window?.modifiers).toBeUndefined();
  await view.unmount();
  session.dispose();
});
it("keeps speed status and other Mouse sections after saving, hides unavailable sections without losing layouts", async () => {
  const profile: PointerProfile = {
    displayId: "display",
    scaleFactor: 1,
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    maxDelta: 128,
    recommendedDeltas: { small: 32, medium: 64, large: 128 },
    capabilities: {
      noAckCommands: [],
      noAckMouseMove: false,
      supportedCommands: ["pointer.speed.set"],
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
      displayNavigation: { supported: false, displayCount: 1 },
    },
  };
  await layoutStore.save("mouse", "speed", {
    columns: 1,
    cells: ["speed.faster", null, "speed.slower"],
  });
  const session = new RemoteSession(
    { send: jest.fn(async () => true) } as unknown as ConnectionManager,
    profile,
  );
  const view = await render(
    <MouseSurface session={session} state={session.snapshot()} />,
  );
  expect(view.getByText("Pointer speed · 100%")).toBeTruthy();
  expect(view.getByText("Movement")).toBeTruthy();
  expect(view.getByText("Clicks and scroll")).toBeTruthy();
  profile.capabilities.pointerSpeed.scalePercent = 50;
  await view.rerender(
    <MouseSurface session={session} state={session.snapshot()} />,
  );
  expect(view.getByText("Pointer speed · 50%")).toBeTruthy();
  profile.capabilities.pointerSpeed.supported = false;
  await view.rerender(
    <MouseSurface session={session} state={session.snapshot()} />,
  );
  expect(view.queryByTestId("section-mouse-speed")).toBeNull();
  expect(layoutStore.snapshot().mouse?.speed?.cells).toEqual([
    "speed.faster",
    null,
    "speed.slower",
  ]);
  profile.capabilities.pointerSpeed.supported = true;
  await view.rerender(
    <MouseSurface session={session} state={session.snapshot()} />,
  );
  expect(view.getAllByTestId("surface-layout-row")).toHaveLength(3);
  await view.unmount();
  session.dispose();
});
it("reset restores only the selected section defaults after Save", async () => {
  await layoutStore.save("mouse", "clicks", {
    columns: 1,
    cells: ["click.double"],
  });
  await layoutStore.save("mouse", "speed", {
    columns: 1,
    cells: ["speed.slower"],
  });
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  const view = await render(
    <SurfaceLayout surface="mouse" section="clicks" controls={clicks} />,
  );
  await fireEvent.press(view.getByLabelText("Edit Clicks and scroll section"));
  await fireEvent.press(view.getByText("Reset to default"));
  await act(async () => {
    alert.mock.calls
      .at(-1)?.[2]
      ?.find((button) => button.text === "Reset")
      ?.onPress?.();
  });
  expect(layoutStore.snapshot().mouse?.clicks).toBeDefined();
  await fireEvent.press(view.getByText("Save layout"));
  expect(layoutStore.snapshot().mouse?.clicks).toBeUndefined();
  expect(layoutStore.snapshot().mouse?.speed).toBeDefined();
  expect(view.getByTestId("default-mouse-clicks-0")).toBeTruthy();
  alert.mockRestore();
});
it("blocks editing during active input", async () => {
  const view = await render(
    <SurfaceLayout
      surface="mouse"
      section="clicks"
      controls={clicks}
      blocked="Stop movement first."
    />,
  );
  expect(
    view.getByLabelText("Edit Clicks and scroll section").props
      .accessibilityState.disabled,
  ).toBe(true);
});
it("keeps live typing mounted and sends no commands while editing or saving keys", async () => {
  const send = jest.fn(async () => true);
  const session = new RemoteSession(
    { send } as unknown as ConnectionManager,
    null,
  );
  jest.spyOn(session, "supports").mockReturnValue(true);
  jest.spyOn(session, "supportsAll").mockReturnValue(true);
  const view = await render(
    <TypingSurface session={session} mode="live" draft="" />,
  );
  await fireEvent.changeText(view.getByLabelText("Live text"), "fixture text");
  await act(async () => {
    await Promise.resolve();
  });
  const count = send.mock.calls.length;
  await fireEvent.press(view.getByLabelText("Edit PC keys section"));
  await fireEvent.press(view.getByText("Add row at end"));
  await fireEvent.press(
    view.getAllByLabelText(/Row \d+, column \d+: Empty/)[0]!,
  );
  await fireEvent.changeText(
    view.getByLabelText("Search actions"),
    "close window",
  );
  await fireEvent.press(view.getByLabelText("Close window"));
  expect(send).toHaveBeenCalledTimes(count);
  await fireEvent.press(view.getByText("Save layout"));
  expect(view.getByLabelText("Live text").props.value).toBe("fixture text");
  expect(send).toHaveBeenCalledTimes(count);
  expect(view.queryByTestId("section-typing-draft")).toBeNull();
  await view.rerender(
    <TypingSurface session={session} mode="draft" draft="fixture" />,
  );
  expect(view.getByTestId("section-typing-draft")).toBeTruthy();
  await view.unmount();
  session.dispose();
});
it.each(["typing", "window"] as const)(
  "keeps repeat stop outside customized %s grids",
  async (surface) => {
    const send = jest.fn(async () => true);
    const session = new RemoteSession(
      { send } as unknown as ConnectionManager,
      null,
    );
    const stop = jest.spyOn(session, "stopRepeat").mockResolvedValue();
    jest.spyOn(session, "snapshot").mockReturnValue({
      repeat: "mouse.scroll",
      dragging: false,
      modifiers: [],
      streamOpen: false,
    });
    const view = await render(
      surface === "typing" ? (
        <TypingSurface session={session} mode="draft" draft="fixture" />
      ) : (
        <WindowSurface
          session={session}
          state={session.snapshot()}
          platform="windows"
        />
      ),
    );
    expect(view.getByText(/Movement is repeating/)).toBeTruthy();
    const edit = view
      .getAllByRole("button")
      .filter((button) =>
        String(button.props.accessibilityLabel).startsWith("Edit "),
      );
    expect(edit.length).toBeGreaterThan(0);
    expect(
      edit.every((button) => button.props.accessibilityState.disabled),
    ).toBe(true);
    await fireEvent.press(view.getByLabelText("Stop movement"));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    await view.unmount();
    session.dispose();
  },
);

it("lets the first keyboard tap reach a customized Typing action", async () => {
  await layoutStore.save("typing", "keys", { columns: 1, cells: ["key.Enter"] });
  const enter = jest.fn();
  const view = await render(
    <SurfaceLayout surface="typing" section="keys" controls={[
      { id: "key.Enter", label: "Enter", onPress: enter },
    ]} />,
  );
  // The nested native responder must not consume the first tap to dismiss text input.
  expect(view.getByTestId("section-grid-scroll").props.keyboardShouldPersistTaps).toBe("handled");
  expect(enter).not.toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText("Enter"));
  expect(enter).toHaveBeenCalledTimes(1);
});
