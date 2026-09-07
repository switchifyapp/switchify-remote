import { fireEvent, render, act } from "@testing-library/react-native";
import { getAction } from "@/remote/actions/catalog";
import { focusAccessibilityTarget } from "@/components/accessibilityFocus";
import { Alert, AccessibilityInfo } from "react-native";
import { LayoutEditor } from "./LayoutEditor";
import { initialLayout } from "./model";
const mockDimensions = { width: 320, height: 640, scale: 1, fontScale: 1 };
const mockScrollTo = jest.fn();
jest.mock("@/components/accessibilityFocus", () => ({
  focusAccessibilityTarget: jest.fn(),
}));

jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native");
  const React = jest.requireActual("react");
  const mocked = Object.create(actual);
  Object.defineProperty(mocked, "useWindowDimensions", {
    value: () => mockDimensions,
  });
  Object.defineProperty(mocked, "ScrollView", {
    value: React.forwardRef(function MockScrollView(
      props: Record<string, unknown>,
      ref: unknown,
    ) {
      React.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }), []);
      return React.createElement(actual.ScrollView, props);
    }),
  });
  Object.defineProperty(mocked, "View", {
    value: React.forwardRef(function MockView(
      props: Record<string, unknown>,
      ref: unknown,
    ) {
      React.useImperativeHandle(
        ref,
        () => ({
          measureInWindow: (done: (...values: number[]) => void) =>
            done(0, 0, 300, 500),
        }),
        [],
      );
      return React.createElement(actual.View, props);
    }),
  });
  return mocked;
});

jest.mock("react-native-gesture-handler", () => {
  const React = jest.requireActual("react");
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
      g[name] = (value: unknown) => {
        g[`_${name}`] = value;
        return g;
      };
    return g;
  };
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({
      gesture,
      children,
    }: {
      gesture: unknown;
      children: unknown;
    }) =>
      React.createElement(
        View,
        { testID: "layout-drag-cell", gesture },
        children,
      ),
    Gesture: { Pan: gesture },
  };
});

jest.mock("@/components/ControlButton", () => {
  const React = jest.requireActual("react");
  const actual = jest.requireActual("@/components/ControlButton");
  return {
    ControlButton: (props: Record<string, unknown>) => {
      React.useImperativeHandle(
        props.controlRef,
        () => ({
          measureInWindow: (done: (...values: number[]) => void) => {
            const match = String(props.accessibilityLabel).match(
              /Row (\d+), column (\d+)/,
            );
            done(
              match ? (Number(match[2]) - 1) * 100 : 0,
              match ? Number(match[1]) * 100 : 0,
              90,
              60,
            );
          },
        }),
        [props.accessibilityLabel],
      );
      return React.createElement(actual.ControlButton, {
        ...props,
        controlRef: undefined,
      });
    },
  };
});

const command = jest.fn();
const controls = [
  { id: "click.double", label: "Click", onPress: command },
  { id: "key.Enter", label: "Enter", onPress: command },
];
const setup = async (onSave = jest.fn().mockResolvedValue(undefined)) => {
  const onClose = jest.fn();
  const view = await render(
    <LayoutEditor
      surface="mouse"
      title="Test section"
      defaultLayout={initialLayout(["click.double", "key.Enter"])}
      initiallyCustomized
      visible
      controls={controls}
      initial={initialLayout(["click.double", "key.Enter"])}
      onSave={onSave}
      onClose={onClose}
      onDismiss={jest.fn()}
    />,
  );
  return { ...view, onSave, onClose };
};
beforeEach(() => {
  jest.clearAllMocks();
  mockDimensions.width = 320;
  mockDimensions.height = 640;
});
it("keeps measured drop targets through drag-start rendering and swaps on drop", async () => {
  const view = await setup();
  const gesture = () =>
    view.getAllByTestId("layout-drag-cell")[4]!.props.gesture;
  await act(async () => {
    gesture()._onStart({ absoluteX: 45, absoluteY: 130 });
  });
  await act(async () => {
    gesture()._onEnd({ absoluteX: 145, absoluteY: 130 }, true);
  });
  await fireEvent.press(view.getByText("Save layout"));
  expect(view.onSave).toHaveBeenCalledWith({
    columns: 3,
    cells: ["key.Enter", "click.double", null],
  });
  expect(command).not.toHaveBeenCalled();
});
it.each(["outside", "rotation", "cancel"] as const)(
  "does not save a move after %s interrupts dragging",
  async (reason) => {
    const view = await setup();
    const gesture = () =>
      view.getAllByTestId("layout-drag-cell")[4]!.props.gesture;
    await act(async () => {
      gesture()._onStart({ absoluteX: 45, absoluteY: 130 });
    });
    if (reason === "rotation") {
      mockDimensions.width = 640;
      mockDimensions.height = 320;
      await view.rerender(
        <LayoutEditor
          surface="mouse"
          title="Test section"
          defaultLayout={initialLayout(["click.double", "key.Enter"])}
          initiallyCustomized
          visible
          controls={controls}
          initial={initialLayout(["click.double", "key.Enter"])}
          onSave={view.onSave}
          onClose={view.onClose}
          onDismiss={jest.fn()}
        />,
      );
    }
    if (reason === "cancel")
      await act(async () => {
        gesture()._onFinalize();
      });
    await act(async () => {
      gesture()._onEnd(
        {
          absoluteX: reason === "outside" ? 900 : 145,
          absoluteY: 130,
        },
        true,
      );
    });
    await fireEvent.press(view.getByText("Save layout"));
    expect(view.onSave).toHaveBeenCalledWith(
      initialLayout(["click.double", "key.Enter"]),
    );
  },
);
it("auto-scrolls near an edge and cancels its animation frame on drag cancellation", async () => {
  const frames: FrameRequestCallback[] = [];
  const frame = jest
    .spyOn(globalThis, "requestAnimationFrame")
    .mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
  const cancel = jest
    .spyOn(globalThis, "cancelAnimationFrame")
    .mockImplementation(() => undefined);
  const view = await setup();
  const gesture = () =>
    view.getAllByTestId("layout-drag-cell")[4]!.props.gesture;
  await act(async () => {
    gesture()._onStart({ absoluteX: 45, absoluteY: 130 });
  });
  await fireEvent(
    view.getByTestId("layout-editor-scroll"),
    "contentSizeChange",
    300,
    2000,
  );
  await act(async () => {
    gesture()._onUpdate({ absoluteX: 45, absoluteY: 490 });
    frames.shift()!(16);
  });
  expect(mockScrollTo).toHaveBeenCalledWith({ y: 6, animated: false });
  await act(async () => {
    gesture()._onFinalize();
  });
  expect(cancel).toHaveBeenCalled();
  await view.unmount();
  frame.mockRestore();
  cancel.mockRestore();
});
it("moves and swaps using accessible cells without dispatching a command", async () => {
  const view = await setup();
  await fireEvent.press(view.getByLabelText("Row 1, column 1: Click"));
  await fireEvent.press(view.getByText("Move button"));
  await fireEvent.press(view.getByLabelText("Row 1, column 2: Enter"));
  await fireEvent.press(view.getByText("Save layout"));
  expect(view.onSave).toHaveBeenCalledWith({
    columns: 3,
    cells: ["key.Enter", "click.double", null],
  });
  expect(command).not.toHaveBeenCalled();
});
it("removes a control and restores it from an empty cell", async () => {
  const view = await setup();
  await fireEvent.press(view.getByLabelText("Row 1, column 1: Click"));
  await fireEvent.press(view.getByText("Remove button"));
  await fireEvent.press(view.getByLabelText("Row 1, column 3: Empty"));
  await fireEvent.press(view.getByText("Double click"));
  await fireEvent.press(view.getByText("Save layout"));
  expect(view.onSave).toHaveBeenCalledWith({
    columns: 3,
    cells: [null, "key.Enter", "click.double"],
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
  await fireEvent.press(view.getByText("Row 1"));
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

it.each(["row", "column"] as const)(
  "reorders a whole %s using handles without commands",
  async (axis) => {
    const view = await setup();
    await fireEvent.press(view.getByText("Add row at end"));
    await fireEvent.press(
      view.getByText(axis === "row" ? "Row 1" : "Column 1"),
    );
    await fireEvent.press(view.getByText(`Move ${axis}`));
    await fireEvent.press(
      view.getByText(axis === "row" ? "Row 2" : "Column 3"),
    );
    await fireEvent.press(view.getByText("Save layout"));
    expect(view.onSave).toHaveBeenCalledWith({
      columns: 3,
      cells:
        axis === "row"
          ? [null, null, null, "click.double", "key.Enter", null]
          : ["key.Enter", null, "click.double", null, null, null],
    });
    expect(command).not.toHaveBeenCalled();
  },
);
it.each(["row", "column"] as const)(
  "drags a whole %s into a new position",
  async (axis) => {
    const view = await setup();
    await fireEvent.press(view.getByText("Add row at end"));
    const gesture = () =>
      view.getAllByTestId("layout-drag-cell")[axis === "row" ? 3 : 0]!.props
        .gesture;
    await act(async () => {
      gesture()._onStart({ absoluteX: 45, absoluteY: 130 });
    });
    await act(async () => {
      gesture()._onUpdate({
        absoluteX: axis === "row" ? 45 : 260,
        absoluteY: axis === "row" ? 250 : 130,
      });
    });
    await act(async () => {
      gesture()._onEnd(
        {
          absoluteX: axis === "row" ? 45 : 260,
          absoluteY: axis === "row" ? 250 : 130,
        },
        true,
      );
    });
    await fireEvent.press(view.getByText("Save layout"));
    expect(view.onSave).toHaveBeenCalledWith({
      columns: 3,
      cells:
        axis === "row"
          ? [null, null, null, "click.double", "key.Enter", null]
          : ["key.Enter", null, "click.double", null, null, null],
    });
  },
);
it("inserts after a selected track and confirms occupied column removal", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  const view = await setup();
  await fireEvent.press(view.getByText("Column 1"));
  await fireEvent.press(view.getByText("Insert column after"));
  await fireEvent.press(view.getByText("Column 1"));
  await fireEvent.press(view.getByText("Remove column"));
  expect(alert).toHaveBeenLastCalledWith(
    "Remove column?",
    expect.any(String),
    expect.any(Array),
  );
  await act(async () => {
    alert.mock.calls
      .at(-1)?.[2]
      ?.find((button) => button.text === "Remove")
      ?.onPress?.();
  });
  await fireEvent.press(view.getByText("Save layout"));
  expect(view.onSave).toHaveBeenCalledWith({
    columns: 3,
    cells: [null, "key.Enter", null],
  });
  alert.mockRestore();
});
it("leaves adaptive defaults untouched on an unchanged Save", async () => {
  const onSave = jest.fn();
  const onClose = jest.fn();
  const view = await render(
    <LayoutEditor
      surface="mouse"
      title="Keys"
      visible
      controls={controls}
      initial={initialLayout(["click.double", "key.Enter"])}
      defaultLayout={initialLayout(["click.double", "key.Enter"])}
      initiallyCustomized={false}
      onSave={onSave}
      onClose={onClose}
      onDismiss={jest.fn()}
    />,
  );
  await fireEvent.press(view.getByText("Save layout"));
  expect(onSave).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
});

it.each(["row", "column", "cell"] as const)(
  "does not commit a cancelled active %s gesture when native onEnd arrives before finalize",
  async (kind) => {
    const view = await setup();
    await fireEvent.press(view.getByText("Add row at end"));
    const gesture = () =>
      view.getAllByTestId("layout-drag-cell")[
        kind === "column" ? 0 : kind === "row" ? 3 : 4
      ]!.props.gesture;
    await act(async () => {
      gesture()._onStart({ absoluteX: 45, absoluteY: 130 });
    });
    await act(async () => {
      gesture()._onUpdate({ absoluteX: 145, absoluteY: 250 });
    });
    await act(async () => {
      gesture()._onEnd({ absoluteX: 145, absoluteY: 250 }, false);
      gesture()._onFinalize();
    });
    await fireEvent.press(view.getByText("Save layout"));
    expect(view.onSave).toHaveBeenCalledWith({
      columns: 3,
      cells: ["click.double", "key.Enter", null, null, null, null],
    });
  },
);

it("opens a contained picker, filters placed actions and assigns a cross-surface action only to the draft", async () => {
  const extra = {
    id: "window.closeFocused",
    label: "Close",
    onPress: command,
    disabled: true,
    option: {
      ...getAction("window.closeFocused")!,
      explanation: "Not supported by this PC.",
    },
  };
  const onSave = jest.fn(async () => undefined);
  const view = await render(
    <LayoutEditor
      surface="mouse"
      title="Test"
      defaultLayout={initialLayout(["click.double", "key.Enter"])}
      initiallyCustomized
      visible
      controls={[...controls, extra]}
      initial={initialLayout(["click.double", "key.Enter"])}
      onSave={onSave}
      onClose={jest.fn()}
      onDismiss={jest.fn()}
    />,
  );
  await fireEvent.press(view.getByLabelText("Row 1, column 3: Empty"));
  expect(view.getByText("Choose action")).toBeTruthy();
  expect(view.queryByText("Save layout")).toBeNull();
  expect(view.queryByLabelText("Double click")).toBeNull();
  expect(view.getByText("Not supported by this PC.")).toBeTruthy();
  await fireEvent.changeText(
    view.getByLabelText("Search actions"),
    "close window",
  );
  await fireEvent.press(view.getByLabelText("Close window"));
  expect(view.queryByText("Choose action")).toBeNull();
  expect(view.getByLabelText("Row 1, column 3: Close")).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
  expect(command).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText("Save layout"));
  expect(onSave).toHaveBeenCalledWith({
    columns: 3,
    cells: ["click.double", "key.Enter", "window.closeFocused"],
  });
});
it("Android Back closes the picker without closing the editor or changing its cell", async () => {
  const view = await setup();
  await fireEvent.press(view.getByLabelText("Row 1, column 3: Empty"));
  await fireEvent(view.getByTestId("section-editor-modal"), "requestClose");
  expect(view.queryByText("Choose action")).toBeNull();
  expect(view.getByLabelText("Row 1, column 3: Empty")).toBeTruthy();
  expect(view.onClose).not.toHaveBeenCalled();
  expect(command).not.toHaveBeenCalled();
});
it("uses an empty cell as a move destination before considering the picker", async () => {
  const view = await setup();
  await fireEvent.press(view.getByLabelText("Row 1, column 1: Click"));
  await fireEvent.press(view.getByText("Move button"));
  await fireEvent.press(view.getByLabelText("Row 1, column 3: Empty"));
  expect(view.queryByText("Choose action")).toBeNull();
  expect(view.getByLabelText("Row 1, column 3: Click")).toBeTruthy();
  expect(command).not.toHaveBeenCalled();
});
it("restores focus to the filled cell and announces its assignment after the picker closes", async () => {
  const frames: FrameRequestCallback[] = [];
  const frame = jest
    .spyOn(globalThis, "requestAnimationFrame")
    .mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
  const announce = jest.spyOn(
    AccessibilityInfo,
    "announceForAccessibilityWithOptions",
  );
  const view = await setup();
  await fireEvent.press(view.getByLabelText("Row 1, column 1: Click"));
  await fireEvent.press(view.getByText("Remove button"));
  await fireEvent.press(view.getByLabelText("Row 1, column 3: Empty"));
  await fireEvent.press(view.getByLabelText("Double click"));
  await act(async () => {
    frames.at(-1)?.(0);
  });
  expect(announce).toHaveBeenLastCalledWith(
    "Double click assigned to row 1, column 3.",
    { queue: true },
  );
  const target = jest.mocked(focusAccessibilityTarget).mock.calls.at(-1)?.[0];
  const measured = jest.fn();
  target?.measureInWindow(measured);
  expect(measured).toHaveBeenCalledWith(200, 100, 90, 60);
  expect(view.queryByText("Choose action")).toBeNull();
  frame.mockRestore();
  announce.mockRestore();
});
