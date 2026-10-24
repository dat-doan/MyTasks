import type { NotificationRegistrationApi } from "@/notifications/core/types";

export type RegistrationApiOptions = {
  /** API root, e.g. https://api.example.com/push. Empty means not configured. */
  baseUrl?: string;
  platform: string;
  /** Resolve credentials for this session, never for a subsequently signed-in user. */
  getAccessToken?: (userId: string | null) => Promise<string | null>;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/**
 * PUT installations/:id is an idempotent upsert, including disabled registrations.
 * Server must enforce increasing revision and derive user binding from credentials.
 */
export function createHttpRegistrationApi({
  baseUrl,
  platform,
  getAccessToken,
  fetch: request = fetch,
  timeoutMs = 15_000,
}: RegistrationApiOptions): NotificationRegistrationApi | null {
  if (!baseUrl?.trim()) return null;
  const root = baseUrl.trim().replace(/\/+$/, "");

  return {
    async sync(registration) {
      const token = (await getAccessToken?.(registration.userId)) ?? null;
      if (registration.userId && !token) {
        throw new Error("Push registration requires session credentials.");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await request(
          `${root}/installations/${encodeURIComponent(registration.installationId)}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              endpoint: registration.endpoint,
              enabled: registration.enabled,
              revision: registration.revision,
              platform,
            }),
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          // Do not include response bodies, endpoint IDs or credentials in errors.
          throw new Error(`Push registration failed (HTTP ${response.status}).`);
        }
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
