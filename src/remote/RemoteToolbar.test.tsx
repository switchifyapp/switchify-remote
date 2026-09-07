import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { ConnectionManager } from "@/connection/ConnectionManager";
import { LayoutEditModeProvider } from "@/layouts/LayoutEditMode";
import { layoutStore } from "@/layouts/LayoutStore";
import { preferencesStore } from "@/storage/PreferencesStore";
import { MouseSurface } from "./MouseSurface";
import { TypingSurface } from "./TypingSurface";
import { RemoteSession } from "./RemoteSession";
import { RemoteToolbar } from "./RemoteToolbar";

const sessions: RemoteSession[] = [];
function sessionFixture() {
  const send = jest.fn(async () => true);
  const session = new RemoteSession(
    { send } as unknown as ConnectionManager,
    null,
  );
  sessions.push(session);
  return { session, send };
}
afterEach(() => {
  sessions.splice(0).forEach((session) => session.dispose());
  jest.restoreAllMocks();
});

it("keeps normal surfaces clean and reveals section editors only while edit mode is on", async () => {
  const { session, send } = sessionFixture();
  const save = jest.spyOn(layoutStore, "save");
  const preferences = jest.spyOn(preferencesStore, "update");
  const view = await render(
    <LayoutEditModeProvider>
      <RemoteToolbar selected="mouse" />
      <MouseSurface session={session} state={session.snapshot()} />
    </LayoutEditModeProvider>,
  );
  expect(view.getByRole("button", { name: "Surface" })).toBeTruthy();
  expect(view.getByText("Movement")).toBeTruthy();
  expect(view.queryByLabelText("Edit Movement section")).toBeNull();
  expect(view.getByLabelText("Left click")).toBeTruthy();
  expect(
    view.getByLabelText("Layout edit mode").props.accessibilityState.selected,
  ).toBe(false);
  await fireEvent.press(view.getByLabelText("Layout edit mode"));
  expect(
    view.getByLabelText("Layout edit mode").props.accessibilityState.selected,
  ).toBe(true);
  expect(view.getByText("Done editing")).toBeTruthy();
  expect(view.getByLabelText("Edit Movement section")).toBeTruthy();
  expect(view.getByLabelText("Edit Clicks and scroll section")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Layout edit mode"));
  expect(view.queryByLabelText("Edit Movement section")).toBeNull();
  expect(view.getByLabelText("Left click")).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  expect(preferences).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
it("shows editing restrictions only on demand and retains their disabled state", async () => {
  const { session } = sessionFixture();
  const view = await render(
    <LayoutEditModeProvider>
      <RemoteToolbar selected="mouse" />
      <MouseSurface
        session={session}
        state={{ ...session.snapshot(), dragging: true }}
      />
    </LayoutEditModeProvider>,
  );
  expect(view.queryByText(/before editing/)).toBeNull();
  await fireEvent.press(view.getByLabelText("Layout edit mode"));
  expect(view.getAllByText(/before editing/).length).toBeGreaterThan(0);
  expect(
    view.getByLabelText("Edit Movement section").props.accessibilityState
      .disabled,
  ).toBe(true);
  await fireEvent.press(view.getByLabelText("Layout edit mode"));
  expect(view.queryByText(/before editing/)).toBeNull();
});
it("preserves live typing and sends no commands when toggling editing chrome", async () => {
  const { session, send } = sessionFixture();
  jest.spyOn(session, "supports").mockReturnValue(true);
  jest.spyOn(session, "supportsAll").mockReturnValue(true);
  const view = await render(
    <LayoutEditModeProvider>
      <RemoteToolbar selected="typing" />
      <TypingSurface session={session} mode="live" draft="" />
    </LayoutEditModeProvider>,
  );
  await fireEvent.changeText(view.getByLabelText("Live text"), "fixture text");
  await waitFor(() => expect(send).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
  });
  const count = send.mock.calls.length;
  await fireEvent.press(view.getByLabelText("Layout edit mode"));
  expect(view.getByLabelText("Edit PC keys section")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Layout edit mode"));
  expect(view.getByLabelText("Live text").props.value).toBe("fixture text");
  expect(send).toHaveBeenCalledTimes(count);
});
it("omits the layout toggle on Forwarding", async () => {
  const view = await render(
    <LayoutEditModeProvider>
      <RemoteToolbar selected="forwarding" />
    </LayoutEditModeProvider>,
  );
  expect(view.queryByLabelText("Layout edit mode")).toBeNull();
  expect(view.getByRole("button", { name: "Surface" })).toBeTruthy();
});
