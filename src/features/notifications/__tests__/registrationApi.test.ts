import type { DeviceRegistration } from "@/notifications/core/types";
import { expect, it, jest } from "@jest/globals";
import { createHttpRegistrationApi } from "../registrationApi";

const registration: DeviceRegistration = {
  installationId: "installation/123",
  endpoint: { provider: "fcm", kind: "fid", value: "firebase-installation" },
  enabled: true,
  userId: null,
  revision: 2,
};

function setup(options: Partial<Parameters<typeof createHttpRegistrationApi>[0]> = {}) {
  const request = jest.fn(async () => ({ ok: true, status: 204 }) as Response);
  const api = createHttpRegistrationApi({
    baseUrl: "https://api.example.com/push/",
    platform: "android",
    fetch: request,
    ...options,
  });
  if (!api) throw new Error("Expected configured API.");
  return { api, request };
}

it("reports an absent backend instead of silently succeeding", () => {
  expect(createHttpRegistrationApi({ platform: "ios" })).toBeNull();
  expect(createHttpRegistrationApi({ baseUrl: "  ", platform: "ios" })).toBeNull();
});

it("upserts an encoded installation with revision and no user identity in the body", async () => {
  const { api, request } = setup();
  await api.sync(registration);
  expect(request).toHaveBeenCalledWith(
    "https://api.example.com/push/installations/installation%2F123",
    expect.objectContaining({ method: "PUT" }),
  );
  const [, init] = request.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toEqual({
    endpoint: registration.endpoint,
    enabled: true,
    revision: 2,
    platform: "android",
  });
});

it("sends disabling as a revisioned tombstone", async () => {
  const { api, request } = setup();
  await api.sync({ ...registration, enabled: false, revision: 3 });
  expect(request).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      method: "PUT",
      body: expect.stringContaining('"enabled":false'),
    }),
  );
});

it("obtains credentials for the captured session and requires them for user binding", async () => {
  const getAccessToken = jest.fn(async () => "session-token");
  const { api, request } = setup({ getAccessToken });
  await api.sync({ ...registration, userId: "user-123" });
  expect(getAccessToken).toHaveBeenCalledWith("user-123");
  expect(request).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer session-token" }),
    }),
  );

  const anonymous = setup();
  await expect(anonymous.api.sync({ ...registration, userId: "user-123" }))
    .rejects.toThrow("session credentials");
  expect(anonymous.request).not.toHaveBeenCalled();
});

it("reports failed HTTP status without exposing response bodies or endpoint IDs", async () => {
  const request = jest.fn(async () => ({ ok: false, status: 503 }) as Response);
  const { api } = setup({ fetch: request });
  await expect(api.sync(registration)).rejects.toThrow("Push registration failed (HTTP 503).");
});
