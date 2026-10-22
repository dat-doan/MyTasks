import { useEffect, useLayoutEffect, useRef } from "react";
import { ActionSheetIOS } from "react-native";

import type { ActionSheetProps } from "./types";

let currentPresentation: symbol | null = null;

export default function NativeActionSheet<Value extends string>(
  props: ActionSheetProps<Value>,
) {
  const latestProps = useRef(props);
  const { visible } = props;

  useLayoutEffect(() => {
    latestProps.current = props;
  }, [props]);

  useEffect(() => {
    if (!visible) return;

    const presentation = Symbol("native-action-sheet");
    let active = true;
    let shown = false;

    // Defer presentation so Strict Mode can cancel its initial effect replay.
    const timer = setTimeout(() => {
      const { options, value, title, message, cancelLabel, anchor, tintColor } =
        latestProps.current;
      const shownOptions = [...options];

      shown = true;
      currentPresentation = presentation;

      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          anchor,
          tintColor,
          options: [
            ...shownOptions.map((option) =>
              option.value === value ? `✓ ${option.label}` : option.label,
            ),
            cancelLabel,
          ],
          cancelButtonIndex: shownOptions.length,
          disabledButtonIndices: shownOptions.flatMap((option, index) =>
            option.disabled ? [index] : [],
          ),
          destructiveButtonIndex: shownOptions.flatMap((option, index) =>
            option.destructive ? [index] : [],
          ),
        },
        (index) => {
          if (!active) return;

          active = false;
          if (currentPresentation === presentation) {
            currentPresentation = null;
          }

          const option = shownOptions[index];
          const callbacks = latestProps.current;

          try {
            if (option && !option.disabled) callbacks.onSelect(option.value);
          } finally {
            callbacks.onClose();
          }
        },
      );
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);

      // A hidden or older instance must not dismiss another instance's sheet.
      if (shown && currentPresentation === presentation) {
        currentPresentation = null;
        ActionSheetIOS.dismissActionSheet();
      }
    };
  }, [visible]);

  return null;
}
