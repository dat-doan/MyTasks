import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ActionSheetOption, ActionSheetProps } from "./types";

export default function CustomActionSheet<Value extends string>({
  visible,
  title,
  message,
  cancelLabel,
  options,
  value,
  onSelect,
  onClose,
  tintColor = "#007AFF",
}: ActionSheetProps<Value>) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [presented, setPresented] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const backdropProgress = useRef(new Animated.Value(0)).current;
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const visibleRef = useRef(visible);
  const closingRef = useRef(false);
  visibleRef.current = visible;

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      setMounted(true);
    }
  }, [visible]);

  useEffect(() => {
    // Wait for the native modal and the panel measurement before entering.
    if (!presented || (visible && sheetHeight === 0)) return;

    const useNativeDriver = Platform.OS !== "web";
    const animation = Animated.parallel([
      Animated.timing(backdropProgress, {
        toValue: visible ? 1 : 0,
        duration: reduceMotion ? 0 : 200,
        easing: Easing.linear,
        useNativeDriver,
      }),
      Animated.timing(sheetProgress, {
        toValue: visible ? 1 : 0,
        duration: reduceMotion ? 0 : visible ? 320 : 220,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished && !visibleRef.current) {
        setMounted(false);
        setPresented(false);
      }
    });
    return () => animation.stop();
  }, [
    visible,
    presented,
    sheetHeight,
    reduceMotion,
    backdropProgress,
    sheetProgress,
  ]);

  function requestClose(option?: ActionSheetOption<Value>) {
    if (!visibleRef.current || closingRef.current || option?.disabled) return;
    closingRef.current = true;
    try {
      if (option) onSelect(option.value);
    } finally {
      onClose();
    }
  }

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      aria-label={
        Platform.OS === "web" ? title ?? message ?? cancelLabel : undefined
      }
      onShow={() => setPresented(true)}
      onRequestClose={() => requestClose()}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
        accessibilityViewIsModal
        onAccessibilityEscape={() => requestClose()}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.backdrop,
            { opacity: backdropProgress },
          ]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          accessible={false}
          focusable={false}
          onPress={() => requestClose()}
        />
        <Animated.View
          onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              opacity: sheetHeight > 0 ? 1 : 0,
              transform: [
                {
                  translateY: sheetProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [sheetHeight, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <ScrollView
            style={styles.options}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {(title || message) && (
              <View style={styles.heading}>
                {title && (
                  <Text style={styles.title} accessibilityRole="header">
                    {title}
                  </Text>
                )}
                {message && <Text style={styles.message}>{message}</Text>}
              </View>
            )}
            {options.map((option, index) => {
              const selected = option.value === value;
              const color = option.destructive ? "#DC2626" : tintColor;

              return (
                <Pressable
                  key={option.value}
                  disabled={option.disabled}
                  accessibilityRole={value === undefined ? "button" : "radio"}
                  accessibilityLabel={option.label}
                  accessibilityState={{
                    disabled: option.disabled,
                    ...(value === undefined ? {} : { checked: selected }),
                  }}
                  aria-checked={value === undefined ? undefined : selected}
                  aria-disabled={option.disabled}
                  onPress={() => requestClose(option)}
                  style={({ pressed }) => [
                    styles.option,
                    (index > 0 || !!title || !!message) && styles.separator,
                    pressed && styles.pressed,
                    option.disabled && styles.disabled,
                  ]}
                >
                  <Text style={[styles.label, { color }]}>{option.label}</Text>
                  {selected && (
                    <Text style={[styles.checkmark, { color }]} accessible={false}>
                      ✓
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={() => requestClose()}
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.cancelLabel, { color: tintColor }]}>
              {cancelLabel}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "100%",
    alignSelf: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  options: {
    flexGrow: 0,
    flexShrink: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
  },
  heading: {
    padding: 18,
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  separator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  label: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
  },
  checkmark: {
    fontSize: 20,
    lineHeight: 24,
  },
  cancelButton: {
    minHeight: 56,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  cancelLabel: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
  },
  pressed: {
    backgroundColor: "#F1F5F9",
  },
  disabled: {
    opacity: 0.4,
  },
});
