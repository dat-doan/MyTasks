import { beforeEach, expect, it, jest } from "@jest/globals";
import { notificationService } from "@/features/notifications/runtime";
import { render } from "@testing-library/react-native";
import { useRootNavigationState } from "expo-router";
import { attachNotificationLifecycle } from "../lifecycle";
import NotificationBootstrap from "../NotificationBootstrap";

jest.mock("@/features/notifications/runtime", () => ({
  notificationService: { setReady: jest.fn() },
  isNotificationHeadless: jest.fn(),
}));
jest.mock("expo-router", () => ({ useRootNavigationState: jest.fn() }));
jest.mock("../lifecycle", () => ({ attachNotificationLifecycle: jest.fn() }));
jest.mock("../NotificationBanner", () => ({ __esModule: true, default: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useRootNavigationState).mockReturnValue(
    undefined as unknown as ReturnType<typeof useRootNavigationState>,
  );
});

function readyNavigator(key = "root") {
  jest.mocked(useRootNavigationState).mockReturnValue({
    stale: false, type: "stack", key, routeNames: [], routes: [], index: 0,
  });
}

it("waits for Router and marks it ready before starting slow registration", async () => {
  const detach = jest.fn();
  jest.mocked(attachNotificationLifecycle).mockReturnValue(detach);
  const view = await render(<NotificationBootstrap />);
  expect(attachNotificationLifecycle).not.toHaveBeenCalled();

  readyNavigator();
  await view.rerender(<NotificationBootstrap />);
  expect(notificationService.setReady).toHaveBeenLastCalledWith(true);
  expect(attachNotificationLifecycle).toHaveBeenCalledTimes(1);
  const readyCall = jest.mocked(notificationService.setReady).mock.invocationCallOrder.at(-1)!;
  const startCall = jest.mocked(attachNotificationLifecycle).mock.invocationCallOrder[0];
  expect(readyCall).toBeLessThan(startCall);

  await view.unmount();
  expect(detach).toHaveBeenCalledTimes(1);
  expect(notificationService.setReady).toHaveBeenLastCalledWith(false);
});

it("keeps one lifecycle as the ready navigator updates", async () => {
  const detach = jest.fn();
  jest.mocked(attachNotificationLifecycle).mockReturnValue(detach);
  readyNavigator();
  const view = await render(<NotificationBootstrap />);
  readyNavigator("updated-root");
  await view.rerender(<NotificationBootstrap />);
  expect(attachNotificationLifecycle).toHaveBeenCalledTimes(1);
  expect(detach).not.toHaveBeenCalled();
  await view.unmount();
});
