import type { defaultNs, resources } from "@/i18n";
import "i18next";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNs;
    resources: (typeof resources)["vi"];
    enableSelector: true;
  }
}
