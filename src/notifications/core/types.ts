export type NotificationPermission =
  | "unknown"
  | "not-determined"
  | "denied"
  | "granted"
  | "provisional"
  | "unsupported";

export type PushEndpoint = Readonly<{
  provider: "fcm";
  kind: "fid";
  value: string;
}>;

export type RawPushMessage = Readonly<{
  data?: unknown;
  title?: string;
  body?: string;
  messageId?: string;
}>;

type PayloadBase = Readonly<{
  schemaVersion: "1";
  eventId: string;
  /** ISO 8601 timestamp, including a timezone. */
  expiresAt?: string;
}>;

export type NotificationPayload = PayloadBase &
  (
    | Readonly<{ type: "task.reminder" | "task.updated"; taskId: string }>
    | Readonly<{ type: "announcement"; taskId?: never }>
  );

export type PushNotification = Readonly<{
  payload: NotificationPayload;
  title?: string;
  body?: string;
  messageId?: string;
}>;

export type DeviceRegistration = Readonly<{
  installationId: string;
  endpoint: PushEndpoint | null;
  enabled: boolean;
  userId: string | null;
  /** Increasing revision of this installation's desired registration. */
  revision: number;
}>;

export type RegistrationRetry = Readonly<{
  attempts: number;
  nextAttemptAt: number;
}>;

export type NotificationPersistence = Readonly<{
  version: 1;
  installationId: string;
  enabled: boolean;
  endpoint: PushEndpoint | null;
  pendingRegistration: DeviceRegistration | null;
  syncedRegistration: DeviceRegistration | null;
  retry: RegistrationRetry | null;
  pendingOpens: readonly PushNotification[];
}>;

export interface NotificationStorage {
  /** Creates a stable local installationId and defaults when absent. */
  load(): Promise<NotificationPersistence>;
  save(state: NotificationPersistence): Promise<void>;
  /** Atomically claims an unfinished/expired lease; null means already claimed/done. */
  claimEvent(key: string, now: number, leaseMs: number): Promise<string | null>;
  /** Complete/release must compare claimId, so an old lease cannot modify a new one. */
  completeEvent(key: string, claimId: string, retainUntil: number): Promise<void>;
  releaseEvent(key: string, claimId: string): Promise<void>;
  isEventComplete(key: string, now: number): Promise<boolean>;
}

export type TransportListeners = Readonly<{
  onMessage(message: RawPushMessage): void;
  onOpen(message: RawPushMessage): void;
  onEndpointChanged(endpoint: PushEndpoint): void;
  onError(error: unknown): void;
}>;

export interface NotificationTransport {
  readonly supported: boolean;
  getPermission(): Promise<NotificationPermission>;
  requestPermission(): Promise<NotificationPermission>;
  getEndpoint(): Promise<PushEndpoint>;
  /** Stops native automatic registration; enabling may register again. */
  unregister(): Promise<void>;
  listen(listeners: TransportListeners): () => void;
  getInitialNotification(): Promise<RawPushMessage | null>;
}

export interface NotificationRegistrationApi {
  /** Idempotent upsert, atomically replacing the installation's user binding. */
  sync(registration: DeviceRegistration): Promise<void>;
}

export type NotificationSnapshot = Readonly<{
  supported: boolean;
  enabled: boolean;
  permission: NotificationPermission;
  registration: "idle" | "registering" | "registered" | "error";
  backend: "not-configured" | "pending" | "synced" | "error";
  busy: boolean;
  error: string | null;
  endpoint: PushEndpoint | null;
  foregroundNotification: PushNotification | null;
}>;

export type ReceiptContext = Readonly<{ source: "foreground" | "background" }>;

export type NotificationHandlers = Readonly<{
  onReceive?: (
    notification: PushNotification,
    context: ReceiptContext,
  ) => void | Promise<void>;
  onOpen: (notification: PushNotification) => void | Promise<void>;
}>;

export type NotificationServiceOptions = NotificationHandlers &
  Readonly<{
    transport: NotificationTransport;
    storage: NotificationStorage;
    registrationApi?: NotificationRegistrationApi | null;
    now?: () => number;
    retryBaseMs?: number;
    retryMaxMs?: number;
    maxAutomaticAttempts?: number;
  }>;

export interface NotificationService {
  getSnapshot(): NotificationSnapshot;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  stop(): void;
  enable(): Promise<void>;
  disable(): Promise<void>;
  /** Reads current OS permission; never prompts. Safe to call on app foreground. */
  reconcile(): Promise<void>;
  retry(): Promise<void>;
  setSession(userId: string | null): Promise<void>;
  setReady(ready: boolean): void;
  openForeground(): Promise<void>;
  dismissForeground(): void;
}
