import { fireEvent, render, act } from "@testing-library/react-native";
import { Alert } from "react-native";
import { LayoutEditor } from "./LayoutEditor";
import { initialLayout } from "./model";
const mockDimensions = { width: 320, height: 640, scale: 1, fontScale: 1 };
const mockScrollTo = jest.fn();

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  const mocked = Object.create(actual);
  Object.defineProperty(mocked, 'useWindowDimensions', { value: () => mockDimensions });
  Object.defineProperty(mocked, 'ScrollView', { value: React.forwardRef(function MockScrollView(props: Record<string, unknown>, ref: unknown) {
    React.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }), []);
    return React.createElement(actual.ScrollView, props);
  }) });
  Object.defineProperty(mocked, 'View', { value: React.forwardRef(function MockView(props: Record<string, unknown>, ref: unknown) {
    React.useImperativeHandle(ref, () => ({ measureInWindow: (done: (...values: number[]) => void) => done(0, 0, 300, 500) }), []);
    return React.createElement(actual.View, props);
  }) });
  return mocked;
});

jest.mock("react-native-gesture-handler", () => {
  const React = jest.requireActual('react');
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
      g[name] = (value: unknown) => { g[`_${name}`] = value; return g; };
    return g;
  };
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ gesture, children }: { gesture: unknown; children: unknown }) => React.createElement(View, { testID: 'layout-drag-cell', gesture }, children),
    Gesture: { Pan: gesture },
  };
});

jest.mock('@/components/ControlButton', () => {
  const React = jest.requireActual('react');
  const actual = jest.requireActual('@/components/ControlButton');
  return { ControlButton: (props: Record<string, unknown>) => {
    React.useImperativeHandle(props.controlRef, () => ({ measureInWindow: (done: (...values: number[]) => void) => {
      const match = String(props.accessibilityLabel).match(/Row (\d+), column (\d+)/);
      done(match ? (Number(match[2]) - 1) * 100 : 0, match ? Number(match[1]) * 100 : 0, 90, 60);
    } }), [props.accessibilityLabel]);
    return React.createElement(actual.ControlButton, { ...props, controlRef: undefined });
  } };
});

const command = jest.fn();
const controls = [
  { id: "a", label: "Click", onPress: command },
  { id: "b", label: "Enter", onPress: command },
];
const setup = async (onSave = jest.fn().mockResolvedValue(undefined)) => {
  const onClose = jest.fn();
  const view = await render(
    <LayoutEditor
      visible
      controls={controls}
      initial={initialLayout(["a", "b"])}
      onSave={onSave}
      onClose={onClose}
      onDismiss={jest.fn()}
    />,
  );
  return { ...view, onSave, onClose };
};
beforeEach(() => { jest.clearAllMocks(); mockDimensions.width = 320; mockDimensions.height = 640; });
it('keeps measured drop targets through drag-start rendering and swaps on drop', async () => {
  const view = await setup();
  const gesture = () => view.getAllByTestId('layout-drag-cell')[0]!.props.gesture;
  await act(async () => { gesture()._onStart({ absoluteX: 45, absoluteY: 130 }); });
  await act(async () => { gesture()._onEnd({ absoluteX: 145, absoluteY: 130 }); });
  await fireEvent.press(view.getByText('Save layout'));
  expect(view.onSave).toHaveBeenCalledWith({ columns: 3, cells: ['b', 'a', null] });
  expect(command).not.toHaveBeenCalled();
});
it.each(['outside', 'rotation', 'cancel'] as const)('does not save a move after %s interrupts dragging', async (reason) => {
  const view = await setup();
  const gesture = () => view.getAllByTestId('layout-drag-cell')[0]!.props.gesture;
  await act(async () => { gesture()._onStart({ absoluteX: 45, absoluteY: 130 }); });
  if (reason === 'rotation') {
    mockDimensions.width = 640; mockDimensions.height = 320;
    await view.rerender(<LayoutEditor visible controls={controls} initial={initialLayout(['a', 'b'])} onSave={view.onSave} onClose={view.onClose} onDismiss={jest.fn()} />);
  }
  if (reason === 'cancel') await act(async () => { gesture()._onFinalize(); });
  await act(async () => { gesture()._onEnd({ absoluteX: reason === 'outside' ? 900 : 145, absoluteY: 130 }); });
  await fireEvent.press(view.getByText('Save layout'));
  expect(view.onSave).toHaveBeenCalledWith(initialLayout(['a', 'b']));
});
it('auto-scrolls near an edge and cancels its animation frame on drag cancellation', async () => {
  const frames: FrameRequestCallback[] = [];
  const frame = jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => { frames.push(callback); return frames.length; });
  const cancel = jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
  const view = await setup();
  const gesture = () => view.getAllByTestId('layout-drag-cell')[0]!.props.gesture;
  await act(async () => { gesture()._onStart({ absoluteX: 45, absoluteY: 130 }); });
  await fireEvent(view.getByTestId('layout-editor-scroll'), 'contentSizeChange', 300, 2000);
  await act(async () => { gesture()._onUpdate({ absoluteX: 45, absoluteY: 490 }); frames.shift()!(16); });
  expect(mockScrollTo).toHaveBeenCalledWith({ y: 6, animated: false });
  await act(async () => { gesture()._onFinalize(); });
  expect(cancel).toHaveBeenCalled();
  await view.unmount(); frame.mockRestore(); cancel.mockRestore();
});
it("moves and swaps using accessible cells without dispatching a command", async () => {
  const view = await setup();
  await fireEvent.press(view.getByLabelText("Row 1, column 1: Click"));
  await fireEvent.press(view.getByText("Move button"));
  await fireEvent.press(view.getByLabelText("Row 1, column 2: Enter"));
  await fireEvent.press(view.getByText("Save layout"));
  expect(view.onSave).toHaveBeenCalledWith({
    columns: 3,
    cells: ["b", "a", null],
  });
  expect(command).not.toHaveBeenCalled();
});
it("removes a control and restores it from an empty cell", async () => {
  const view = await setup();
  await fireEvent.press(view.getByLabelText("Row 1, column 1: Click"));
  await fireEvent.press(view.getByText("Remove button"));
  await fireEvent.press(view.getByLabelText("Row 1, column 3: Empty"));
  await fireEvent.press(view.getByText("Add Click"));
  await fireEvent.press(view.getByText("Save layout"));
  expect(view.onSave).toHaveBeenCalledWith({
    columns: 3,
    cells: [null, "b", "a"],
  });
});
it("keeps the draft after a sanitized save failure and retries", async () => {
  const save = jest
    .fn()
    .mockRejectedValueOnce(new Error("private"))
    .mockResolvedValueOnce(undefined);
  const view = await setup(save);
  await fireEvent.press(view.getByText("Add row at end"));
  await fireEvent.press(view.getByText("Save layout"));
  expect(view.getByText("Layout could not be saved. Try again.")).toBeTruthy();
  expect(view.queryByText("private")).toBeNull();
  expect(view.onClose).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText("Save layout"));
  expect(save.mock.calls[0]).toEqual(save.mock.calls[1]);
  expect(view.onClose).toHaveBeenCalledTimes(1);
});
it("confirms discarding edits and removing occupied rows", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  const view = await setup();
  await fireEvent.press(view.getByText("Add row at end"));
  await fireEvent.press(view.getByLabelText("Row 1, column 1: Click"));
  await fireEvent.press(view.getByText("Remove row"));
  expect(alert).toHaveBeenLastCalledWith(
    "Remove row?",
    expect.any(String),
    expect.any(Array),
  );
  await fireEvent.press(view.getByText("Cancel"));
  expect(alert).toHaveBeenLastCalledWith(
    "Discard layout changes?",
    expect.any(String),
    expect.any(Array),
  );
  expect(view.onSave).not.toHaveBeenCalled();
  alert.mockRestore();
});
it("blocks duplicate saves and handles unmount during saving", async () => {
  let resolve!: () => void;
  const view = await setup(
    jest.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    ),
  );
  await fireEvent.press(view.getByText("Save layout"));
  await fireEvent.press(view.getByText("Saving layout"));
  expect(view.onSave).toHaveBeenCalledTimes(1);
  await view.unmount();
  await act(async () => resolve());
  expect(view.onClose).not.toHaveBeenCalled();
});
