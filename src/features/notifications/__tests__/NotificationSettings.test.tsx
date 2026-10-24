import { beforeEach, expect, it, jest } from "@jest/globals";
import mockCommon from "@/i18n/locales/en/common.json";
import { useNotifications } from "@/notifications/react/useNotifications";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import NotificationSettings from "../NotificationSettings";

jest.mock("@/notifications/react/useNotifications", () => ({ useNotifications: jest.fn() }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (select: (strings: typeof mockCommon) => string) => select(mockCommon),
  }),
}));

const actions = {
  enable: jest.fn(async () => undefined),
  disable: jest.fn(async () => undefined),
  retry: jest.fn(async () => undefined),
  reconcile: jest.fn(async () => undefined),
  openForeground: jest.fn(async () => undefined),
  dismissForeground: jest.fn<() => void>(),
};

const initialState: ReturnType<typeof useNotifications> = {
  ...actions,
  supported: true,
  enabled: false,
  permission: "not-determined",
  registration: "idle",
  backend: "not-configured",
  busy: false,
  error: null,
  endpoint: null,
  foregroundNotification: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useNotifications).mockReturnValue(initialState);
});

it("keeps permission opt-in and distinguishes native registration from server availability", async () => {
  await render(<NotificationSettings />);
  expect(actions.enable).not.toHaveBeenCalled();
  expect(screen.getByText(/notification service is not connected yet/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Enable notifications" }));
  expect(actions.enable).toHaveBeenCalledTimes(1);
});

it("offers system settings after permission denial and allows disabling registration", async () => {
  const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  jest.mocked(useNotifications).mockReturnValue({
    ...initialState, enabled: true, permission: "denied",
  });
  await render(<NotificationSettings />);
  await fireEvent.press(screen.getByRole("button", { name: "Open device settings" }));
  expect(openSettings).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole("button", { name: "Disable notifications" }));
  expect(actions.disable).toHaveBeenCalledTimes(1);
  openSettings.mockRestore();
});

it("exposes retry after a server failure without displaying internal error details", async () => {
  jest.mocked(useNotifications).mockReturnValue({
    ...initialState,
    enabled: true,
    registration: "registered",
    backend: "error",
    error: "secret endpoint details",
  });
  await render(<NotificationSettings />);
  expect(screen.queryByText("secret endpoint details")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  expect(actions.retry).toHaveBeenCalledTimes(1);
});
