import type { NotificationSnapshot } from "@/notifications/core/types";
import { useNotifications } from "@/notifications/react/useNotifications";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function NotificationSettings() {
  const state = useNotifications();
  const { t } = useTranslation("common");
  const [settingsFailed, setSettingsFailed] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);

  const permissionLabels: Record<NotificationSnapshot["permission"], string> = {
    unknown: t(($) => $.settings.notifications.permissionUnknown),
    "not-determined": t(($) => $.settings.notifications.permissionUndetermined),
    denied: t(($) => $.settings.notifications.permissionDenied),
    granted: t(($) => $.settings.notifications.permissionGranted),
    provisional: t(($) => $.settings.notifications.permissionProvisional),
    unsupported: t(($) => $.settings.notifications.permissionUnsupported),
  };
  const registrationLabels: Record<NotificationSnapshot["registration"], string> = {
    idle: t(($) => $.settings.notifications.registrationIdle),
    registering: t(($) => $.settings.notifications.registrationRegistering),
    registered: t(($) => $.settings.notifications.registrationRegistered),
    error: t(($) => $.settings.notifications.registrationError),
  };
  const backendLabels: Record<NotificationSnapshot["backend"], string> = {
    "not-configured": t(($) => $.settings.notifications.deliveryUnconfigured),
    pending: t(($) => $.settings.notifications.deliveryPending),
    synced: t(($) => $.settings.notifications.deliverySynced),
    error: t(($) => $.settings.notifications.deliveryError),
  };

  const run = async (action: () => Promise<void>) => {
    setActionFailed(false);
    try {
      await action();
    } catch {
      setActionFailed(true);
    }
  };
  const openSettings = async () => {
    setSettingsFailed(false);
    try {
      await Linking.openSettings();
    } catch {
      setSettingsFailed(true);
    }
  };

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {t(($) => $.settings.notifications.title)}
      </Text>
      <Text style={styles.description}>
        {t(($) => $.settings.notifications.description)}
      </Text>
      <Text style={styles.status}>
        {t(($) => $.settings.notifications.permission)}:{" "}
        {permissionLabels[state.permission]}
      </Text>
      {state.supported ? (
        <>
          <Text style={styles.status}>
            {t(($) => $.settings.notifications.registration)}:{" "}
            {registrationLabels[state.registration]}
          </Text>
          <Text style={styles.description}>
            {t(($) => $.settings.notifications.delivery)}:{" "}
            {backendLabels[state.backend]}
          </Text>
          {(state.error || actionFailed) ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(($) => $.settings.notifications.error)}
            </Text>
          ) : null}
          {settingsFailed ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(($) => $.settings.notifications.settingsError)}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: state.busy, busy: state.busy }}
              disabled={state.busy}
              style={({ pressed }) => [
                styles.button,
                (pressed || state.busy) && styles.dimmed,
              ]}
              onPress={() => void run(state.enabled ? state.disable : state.enable)}
            >
              {state.busy ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text style={styles.buttonLabel}>
                {state.busy
                  ? t(($) => $.settings.notifications.busy)
                  : state.enabled
                    ? t(($) => $.settings.notifications.disable)
                    : t(($) => $.settings.notifications.enable)}
              </Text>
            </Pressable>
            {state.error || actionFailed || state.backend === "error" || state.backend === "pending" ? (
              <Pressable
                accessibilityRole="button"
                disabled={state.busy}
                accessibilityState={{ disabled: state.busy }}
                style={styles.secondaryButton}
                onPress={() => void run(state.retry)}
              >
                <Text style={styles.secondaryLabel}>
                  {t(($) => $.settings.notifications.retry)}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {state.permission === "denied" ? (
            <Pressable
              accessibilityRole="button"
              style={styles.secondaryButton}
              onPress={() => void openSettings()}
            >
              <Text style={styles.secondaryLabel}>
                {t(($) => $.settings.notifications.openSettings)}
              </Text>
            </Pressable>
          ) : null}
          <Text style={styles.hint}>
            {t(($) => $.settings.notifications.disabledHelp)}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    padding: 18,
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  title: { color: "#0F172A", fontSize: 18, fontWeight: "600" },
  description: { color: "#64748B", fontSize: 14, lineHeight: 21 },
  status: { color: "#334155", fontSize: 14, lineHeight: 21 },
  error: { color: "#B91C1C", fontSize: 14, lineHeight: 21 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  button: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#4F46E5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  dimmed: { opacity: 0.6 },
  secondaryButton: {
    alignSelf: "flex-start",
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  secondaryLabel: { color: "#4F46E5", fontSize: 14, fontWeight: "600" },
  hint: { color: "#64748B", fontSize: 12, lineHeight: 18 },
});
