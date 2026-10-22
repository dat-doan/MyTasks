import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import i18n, { resources } from "./index";

const STORAGE_KEY = "settings.language";
export type AppLanguage = keyof typeof resources;
export type LanguagePreference = AppLanguage | "system";

const supportedLanguages = Object.keys(resources);

function isAppLanguage(value: string | null): value is AppLanguage {
  return value !== null && supportedLanguages.includes(value);
}

function resolveLanguage(preference: LanguagePreference): AppLanguage {
  if (preference !== "system") {
    return preference;
  }
  return (
    getLocales()
      .map((e) => e.languageCode)
      .find(isAppLanguage) ?? "vi"
  );
}

export async function restoreLanguage(): Promise<LanguagePreference> {
  const saved = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
  const preference: LanguagePreference = isAppLanguage(saved)
    ? saved
    : "system";
  await i18n.changeLanguage(resolveLanguage(preference));
  return preference;
}

export async function setLanguage(
  preference: LanguagePreference,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, preference);
  await i18n.changeLanguage(resolveLanguage(preference));
}
