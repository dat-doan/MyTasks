import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotifications } from "./useNotifications";

export default function NotificationBanner() {
  const { foregroundNotification, openForeground, dismissForeground } =
    useNotifications();
  const { t } = useTranslation("common");
  const insets = useSafeAreaInsets();
  const [failedEventId, setFailedEventId] = useState<string | null>(null);
  const [openingEventId, setOpeningEventId] = useState<string | null>(null);

  if (!foregroundNotification) return null;
  const { payload, title, body } = foregroundNotification;
  const opening = openingEventId !== null;
  const failed = failedEventId === payload.eventId;

  const open = async () => {
    setOpeningEventId(payload.eventId);
    setFailedEventId(null);
    try {
      await openForeground();
    } catch {
      setFailedEventId(payload.eventId);
    } finally {
      setOpeningEventId(null);
    }
  };

  return (
    <View style={[styles.container, { top: insets.top + 12 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[
          t(($) => $.notifications.open),
          title || t(($) => $.notifications.title),
          body,
        ].filter(Boolean).join(". ")}
        accessibilityState={{ disabled: opening, busy: opening }}
        disabled={opening}
        style={({ pressed }) => [styles.message, pressed && styles.pressed]}
        onPress={() => void open()}
      >
        <Text style={styles.title} numberOfLines={2}>
          {title || t(($) => $.notifications.title)}
        </Text>
        {body ? (
          <Text style={styles.body} numberOfLines={3}>{body}</Text>
        ) : null}
        {failed ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {t(($) => $.notifications.openError)}
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(($) => $.notifications.dismiss)}
        hitSlop={4}
        onPress={dismissForeground}
        style={styles.dismiss}
      >
        <Text style={styles.dismissLabel} accessible={false}>
          ×
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 1000,
    elevation: 8,
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderColor: "#C7D2FE",
    borderWidth: 1,
    borderRadius: 16,
    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.15)",
    overflow: "hidden",
  },
  message: { flex: 1, padding: 16, gap: 5, minHeight: 72 },
  pressed: { backgroundColor: "#EEF2FF" },
  title: { color: "#0F172A", fontSize: 16, fontWeight: "600" },
  body: { color: "#475569", fontSize: 14, lineHeight: 20 },
  error: { color: "#B91C1C", fontSize: 13, lineHeight: 18 },
  dismiss: {
    width: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissLabel: { fontSize: 26, color: "#64748B" },
});
