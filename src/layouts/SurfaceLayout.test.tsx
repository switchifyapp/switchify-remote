import { act, fireEvent, render } from "@testing-library/react-native";
import { Text, StyleSheet } from "react-native";
import { MouseSurface } from '@/remote/MouseSurface';
import type { PointerProfile } from '@/domain/protocol/types';
import { SurfaceLayout } from "./SurfaceLayout";
import { layoutStore } from "./LayoutStore";
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
beforeEach(async () => {
  await layoutStore.save("mouse", null);
  await layoutStore.save("typing", null);
});
it('preserves empty leading, middle and trailing rows without adding scan stops', async () => {
  await layoutStore.save('mouse', { columns: 1, cells: [null, 'a', null, 'b', null] });
  const view = await render(<SurfaceLayout surface="mouse" controls={[{ id: 'a', label: 'Click', onPress: jest.fn() }, { id: 'b', label: 'Enter', onPress: jest.fn() }]}><Text>Default</Text></SurfaceLayout>);
  expect(view.getAllByTestId('surface-layout-row')).toHaveLength(5);
  for (const row of view.getAllByTestId('surface-layout-row')) expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(48);
  expect(view.getAllByRole('button')).toHaveLength(3);
});
it('keeps current pointer speed visible after customization and updates it', async () => {
  await layoutStore.save('mouse', { columns: 1, cells: ['speed.slower', 'speed.faster'] });
  const profile: PointerProfile = { displayId: 'display', scaleFactor: 1, bounds: { x: 0, y: 0, width: 100, height: 100 }, maxDelta: 128, recommendedDeltas: { small: 32, medium: 64, large: 128 }, capabilities: { noAckCommands: [], noAckMouseMove: false, supportedCommands: ['pointer.speed.set'], mouseRepeat: { supported: false, enabled: false, intervalMs: 250, minIntervalMs: 100, maxIntervalMs: 2000 }, pointerSpeed: { supported: true, setSupported: true, scalePercent: 100, minScalePercent: 5, maxScalePercent: 225, stepPercent: 5, baseMoveDelta: 64, effectiveMoveDelta: 64 }, displayNavigation: { supported: false, displayCount: 1 } } };
  const session = new RemoteSession({ send: jest.fn(async () => true) } as unknown as ConnectionManager, profile);
  const view = await render(<MouseSurface session={session} state={session.snapshot()} />);
  expect(view.getByText('Pointer speed · 100%')).toBeTruthy();
  profile.capabilities.pointerSpeed.scalePercent = 50;
  await view.rerender(<MouseSurface session={session} state={session.snapshot()} />);
  expect(view.getByText('Pointer speed · 50%')).toBeTruthy();
  profile.capabilities.pointerSpeed.supported = false;
  await view.rerender(<MouseSurface session={session} state={session.snapshot()} />);
  expect(view.queryByText('Pointer speed · 50%')).toBeNull();
  expect(view.getByLabelText('Slower').props.accessibilityState.disabled).toBe(true);
  await view.unmount(); session.dispose();
});
it("preserves custom positions, labels, availability and original action handlers", async () => {
  await layoutStore.save("mouse", { columns: 3, cells: ["b", null, "a"] });
  const a = jest.fn();
  const b = jest.fn();
  const controls = [
    { id: "a", label: "Start drag", onPress: a },
    { id: "b", label: "Click", onPress: b },
  ];
  const view = await render(
    <SurfaceLayout surface="mouse" controls={controls}>
      <Text>Default arrangement</Text>
    </SurfaceLayout>,
  );
  expect(view.queryByText("Default arrangement")).toBeNull();
  expect(
    view
      .getAllByRole("button")
      .map((button) => button.props.accessibilityLabel),
  ).toEqual(["Edit layout", "Click", "Start drag"]);
  await fireEvent.press(view.getByText("Click"));
  expect(b).toHaveBeenCalledTimes(1);
  await view.rerender(
    <SurfaceLayout
      surface="mouse"
      controls={[
        { ...controls[0]!, label: "End drag", selected: true },
        { ...controls[1]!, disabled: true },
      ]}
    >
      <Text>Default arrangement</Text>
    </SurfaceLayout>,
  );
  expect(
    view.getByLabelText("End drag").props.accessibilityState.selected,
  ).toBe(true);
  expect(view.getByLabelText("Click").props.accessibilityState.disabled).toBe(
    true,
  );
  expect(view.getAllByRole("button")).toHaveLength(3);
});
it("uses defaults for unknown saved controls and blocks editing during active input", async () => {
  await layoutStore.save("mouse", { columns: 1, cells: ["obsolete"] });
  const view = await render(
    <SurfaceLayout surface="mouse" controls={[]} blocked="Stop movement first.">
      <Text>Default arrangement</Text>
    </SurfaceLayout>,
  );
  expect(view.getByText("Default arrangement")).toBeTruthy();
  expect(
    view.getByLabelText("Edit layout").props.accessibilityState.disabled,
  ).toBe(true);
});
it("keeps live text mounted and unchanged while editing and saving its key layout", async () => {
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
  await fireEvent.press(view.getByText("Edit layout"));
  await fireEvent.press(view.getByText("Add row at end"));
  await fireEvent.press(view.getByText("Save layout"));
  expect(view.getByLabelText("Live text").props.value).toBe("fixture text");
  expect(send).toHaveBeenCalledTimes(count);
  await view.unmount();
  session.dispose();
});
