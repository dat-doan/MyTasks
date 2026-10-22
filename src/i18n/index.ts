import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import enTasks from "./locales/en/tasks.json";
import viCommon from "./locales/vi/common.json";
import viTasks from "./locales/vi/tasks.json";

export const defaultNs = "common";
export const resources = {
  vi: {
    common: viCommon,
    tasks: viTasks,
  },
  en: {
    common: enCommon,
    tasks: enTasks,
  },
} as const;

const supportedLngs = Object.keys(resources);
const language =
  getLocales()
    .map((e) => e.languageCode)
    .find((e) => e !== null && supportedLngs.includes(e)) ?? "vi";

void i18n.use(initReactI18next).init({
  resources,
  lng: language,
  supportedLngs,
  fallbackLng: "vi",
  ns: ["common", "tasks"],
  defaultNS: defaultNs,
  initAsync: false,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
