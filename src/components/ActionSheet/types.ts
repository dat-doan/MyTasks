export type ActionSheetOption<Value extends string> = {
  value: Value;
  label: string;
  disabled?: boolean;
  destructive?: boolean;
};

export type ActionSheetProps<Value extends string> = {
  visible: boolean;
  title?: string;
  message?: string;
  cancelLabel: string;
  options: readonly ActionSheetOption<Value>[];
  value?: Value;
  onSelect: (value: Value) => void;
  /** Set visible=false here. Also called after selecting an option. */
  onClose: () => void;
  /** Native iPad popover anchor, obtained from findNodeHandle. */
  anchor?: number;
  tintColor?: string;
  /** Use custom to preview the fallback on iOS. Defaults to automatic. */
  presentation?: "automatic" | "custom";
};
