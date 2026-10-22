# ActionSheet

Reusable controlled action sheet for React Native, Expo, and React Native Web.
Copy this entire folder into another project. It depends only on `react`,
`react-native`, and `react-native-safe-area-context`; it has no dependency on
Expo Symbols, navigation, translations, or this app's settings.

The app must have a `SafeAreaProvider` above the component. Expo Router already
provides one. Metro resolves the `.ios.tsx` implementation on iOS.

```tsx
import { useState } from "react";
import { Button } from "react-native";
import ActionSheet from "./components/ActionSheet";

export default function Example() {
  const [visible, setVisible] = useState(false);
  const [language, setLanguage] = useState<"vi" | "en">("vi");

  return (
    <>
      <Button title="Language" onPress={() => setVisible(true)} />
      <ActionSheet
        visible={visible}
        title="Language"
        cancelLabel="Cancel"
        options={[
          { value: "vi", label: "Tiếng Việt" },
          { value: "en", label: "English" },
        ]}
        value={language}
        onSelect={setLanguage}
        onClose={() => setVisible(false)}
      />
    </>
  );
}
```

## Contract

- `visible` is controlled by the parent. Keep the component mounted while
  changing `visible` so the custom exit animation can finish.
- `onSelect(value)` runs once for an enabled option, followed by `onClose()`.
- `onClose()` requests that the parent set `visible=false`. Cancel, backdrop,
  Android Back, web Escape, and accessibility escape do not select an option.
- Each option has a unique string `value` and a `label`. Optional `disabled`
  prevents selection; `destructive` uses a destructive text color.
- `value` marks the current selection. Omit it to show a list of actions instead
  of a single-choice list.
- `title`, `message`, and `tintColor` are optional. Pass translated strings from
  the calling app; there are no hardcoded user-facing labels.
- `anchor` accepts the native view handle for an iPad popover, as supported by
  `ActionSheetIOS`.
- `presentation="custom"` forces the custom implementation, including on iOS,
  for previewing or when the same custom UI is wanted on every platform.

## Presentation

iOS uses `ActionSheetIOS`, so the OS controls its appearance and animation.
The API accepts text labels only: the current selection gets a `✓` prefix.
Only one native action sheet should be visible at a time. Its displayed labels
and options are captured when it opens; close and reopen to refresh them.

Android and web use a transparent `Modal` with `animationType="none"`.
A stationary backdrop fades in over 200 ms while the measured panel slides
up over 320 ms with cubic easing. Closing fades the backdrop and slides the
panel down over 220 ms before removing the modal. Interrupted transitions
resume from the current position. Reduced motion skips these animations.

This follows the iOS pattern of independent backdrop and panel transitions;
it does not reproduce UIKit's exact motion or glass appearance, which can
change between OS versions. Custom colors are light by default; applying
the app's actual theme and persisting selections belong to the caller.
