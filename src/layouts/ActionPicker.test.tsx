import { fireEvent, render } from "@testing-library/react-native";
import { ActionPicker } from "./ActionPicker";
import { actionCatalog } from "@/remote/actions/catalog";

it("searches descriptive names, categories and keywords without invoking an action", async () => {
  const select = jest.fn();
  const view = await render(
    <ActionPicker
      row={2}
      column={3}
      options={actionCatalog}
      onSelect={select}
      onClose={jest.fn()}
    />,
  );
  expect(view.getByText("Row 2, column 3")).toBeTruthy();
  expect(view.getByLabelText("Search actions").props.disableFullscreenUI).toBe(
    true,
  );
  await fireEvent.changeText(
    view.getByLabelText("Search actions"),
    "ARROW LEFT",
  );
  expect(view.getByLabelText("Arrow left key")).toBeTruthy();
  expect(view.queryByLabelText("Move pointer left")).toBeNull();
  await fireEvent.changeText(view.getByLabelText("Search actions"), "display");
  expect(view.getByLabelText("Move pointer to monitor left")).toBeTruthy();
  await fireEvent.changeText(
    view.getByLabelText("Search actions"),
    "no such action",
  );
  expect(view.getByText("No actions match your search.")).toBeTruthy();
  expect(select).not.toHaveBeenCalled();
});
it("keeps unsupported results selectable, with explanations and one immediate assignment", async () => {
  const select = jest.fn();
  const view = await render(
    <ActionPicker
      row={1}
      column={1}
      options={[
        {
          ...actionCatalog.find((a) => a.id === "monitor.left")!,
          explanation: "Requires multiple monitors.",
        },
      ]}
      onSelect={select}
      onClose={jest.fn()}
    />,
  );
  const result = view.getByLabelText("Move pointer to monitor left");
  expect(result.props.accessibilityHint).toContain(
    "You can still add this action.",
  );
  expect(view.getByText("Requires multiple monitors.")).toBeTruthy();
  await fireEvent.press(result);
  await fireEvent.press(result);
  expect(select.mock.calls).toEqual([["monitor.left"]]);
  expect(
    view.getByTestId("action-picker-results").props.keyboardShouldPersistTaps,
  ).toBe("handled");
});
it.each(["Close", "scrim", "escape"])(
  "dismisses using %s without assignment",
  async (method) => {
    const select = jest.fn();
    const close = jest.fn();
    const view = await render(
      <ActionPicker
        row={1}
        column={1}
        options={[]}
        onSelect={select}
        onClose={close}
      />,
    );
    expect(
      view.getByText("All available actions are already in this section."),
    ).toBeTruthy();
    if (method === "Close") await fireEvent.press(view.getByLabelText("Close"));
    else if (method === "scrim")
      await fireEvent.press(
        view.getByTestId("action-picker-scrim", {
          includeHiddenElements: true,
        }),
      );
    else
      await fireEvent(
        view.getByTestId("action-picker-dialog"),
        "accessibilityEscape",
      );
    expect(close).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
  },
);
