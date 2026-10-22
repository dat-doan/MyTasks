import { Platform } from "react-native";
import CustomActionSheet from "./CustomActionSheet";
import NativeActionSheet from "./NativeActionSheet";
import type { ActionSheetProps } from "./types";

export type { ActionSheetOption, ActionSheetProps } from "./types";

export default function ActionSheet<Value extends string>({
  presentation = "automatic",
  ...props
}: ActionSheetProps<Value>) {
  if (Platform.OS === "ios" && presentation === "automatic") {
    return <NativeActionSheet {...props} />;
  }

  return <CustomActionSheet {...props} />;
}
