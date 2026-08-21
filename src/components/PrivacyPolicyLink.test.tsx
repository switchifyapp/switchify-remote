import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert, Linking, StyleSheet } from "react-native";

import {
  PrivacyPolicyLink,
  REMOTE_PRIVACY_POLICY_URL,
} from "./PrivacyPolicyLink";

describe("PrivacyPolicyLink", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("opens the Remote privacy policy from an accessible minimum-size action", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const view = await render(<PrivacyPolicyLink />);
    const action = view.getByRole("button", { name: "Privacy policy" });

    expect(action.props.accessibilityHint).toBe("Opens in your browser.");
    expect(
      StyleSheet.flatten(action.props.style).minHeight,
    ).toBeGreaterThanOrEqual(48);

    fireEvent.press(action);

    await waitFor(() =>
      expect(openURL).toHaveBeenCalledWith(REMOTE_PRIVACY_POLICY_URL),
    );
  });

  it("shows a sanitized recovery message when the browser cannot open", async () => {
    jest
      .spyOn(Linking, "openURL")
      .mockRejectedValue(new Error("private native details"));
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const view = await render(<PrivacyPolicyLink />);

    fireEvent.press(view.getByRole("button", { name: "Privacy policy" }));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Unable to open privacy policy",
        `Open ${REMOTE_PRIVACY_POLICY_URL} in your browser.`,
      ),
    );
    expect(JSON.stringify(alert.mock.calls)).not.toContain(
      "private native details",
    );
  });
});
