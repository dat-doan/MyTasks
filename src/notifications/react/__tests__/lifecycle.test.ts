import { expect, it, jest } from "@jest/globals";
import { attachNotificationLifecycle } from "../lifecycle";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

function setup() {
  const start = deferred<void>();
  const service = {
    start: jest.fn(() => start.promise),
    stop: jest.fn(),
    reconcile: jest.fn(async () => undefined),
  };
  const unsubscribe = jest.fn();
  const subscribeToActive = jest.fn((_onActive: () => void) => unsubscribe);
  return { start, service, unsubscribe, subscribeToActive };
}

it("does not start headless sessions or mounts disposed before the headless check", async () => {
  const context = setup();
  attachNotificationLifecycle({ ...context, isHeadless: async () => true });
  await Promise.resolve();
  expect(context.service.start).not.toHaveBeenCalled();

  const headless = deferred<boolean>();
  const cleanup = attachNotificationLifecycle({
    ...context,
    isHeadless: () => headless.promise,
  });
  cleanup();
  headless.resolve(false);
  await Promise.resolve();
  expect(context.service.start).not.toHaveBeenCalled();
  expect(context.service.stop).not.toHaveBeenCalled();
});

it("does not let an old startup completion stop a newer mount", async () => {
  const context = setup();
  const cleanupOld = attachNotificationLifecycle({ ...context, isHeadless: async () => false });
  await Promise.resolve();
  expect(context.service.start).toHaveBeenCalledTimes(1);
  cleanupOld();
  expect(context.service.stop).toHaveBeenCalledTimes(1);

  const cleanupNew = attachNotificationLifecycle({ ...context, isHeadless: async () => false });
  await Promise.resolve();
  expect(context.service.start).toHaveBeenCalledTimes(2);
  context.start.resolve();
  await Promise.resolve();
  expect(context.service.stop).toHaveBeenCalledTimes(1);
  cleanupNew();
  expect(context.service.stop).toHaveBeenCalledTimes(2);
  expect(context.unsubscribe).toHaveBeenCalledTimes(2);
});

it("refreshes on activation only while mounted and cleans up idempotently", async () => {
  const context = setup();
  const cleanup = attachNotificationLifecycle({ ...context, isHeadless: async () => false });
  await Promise.resolve();
  const [onActive] = context.subscribeToActive.mock.calls[0];
  onActive();
  expect(context.service.reconcile).toHaveBeenCalledTimes(1);
  cleanup();
  cleanup();
  onActive();
  expect(context.service.reconcile).toHaveBeenCalledTimes(1);
  expect(context.service.stop).toHaveBeenCalledTimes(1);
  expect(context.unsubscribe).toHaveBeenCalledTimes(1);
  context.start.resolve();
});
