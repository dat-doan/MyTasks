import type { NotificationService } from "../core/types";

type Dependencies = {
  service: Pick<NotificationService, "start" | "stop" | "reconcile">;
  isHeadless: () => Promise<boolean>;
  subscribeToActive: (onActive: () => void) => () => void;
};

/** One effect owns one startup attempt and its app-state subscription. */
export function attachNotificationLifecycle({
  service,
  isHeadless,
  subscribeToActive,
}: Dependencies): () => void {
  let active = true;
  let started = false;
  let unsubscribe: (() => void) | undefined;

  void (async () => {
    if ((await isHeadless()) || !active) return;
    started = true;
    unsubscribe = subscribeToActive(() => {
      if (active) void service.reconcile().catch(() => undefined);
    });
    // The service reports startup errors through its snapshot.
    await service.start();
    // Cleanup owns stop; a late completion must not stop a later mount.
  })().catch(() => undefined);

  return () => {
    if (!active) return;
    active = false;
    unsubscribe?.();
    if (started) service.stop();
  };
}
