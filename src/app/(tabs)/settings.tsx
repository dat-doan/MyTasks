import ActionSheet from "@/components/ActionSheet";
import SettingsRow from "@/components/SettingsRow";
import NotificationSettings from "@/features/notifications/NotificationSettings";
import type { AppLanguage } from "@/i18n/language";
import { setLanguage } from "@/i18n/language";
import { useEffect, useState } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function Settings({ t, i18n }: WithTranslation<"common">) {
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(() =>
    i18n.resolvedLanguage?.startsWith("en") ? "en" : "vi",
  );
  const [selectedTheme, setSelectedTheme] = useState<"light" | "dark">("light");
  const [activeSheet, setActiveSheet] = useState<"language" | "theme" | null>(
    null,
  );

  const languageOptions = [
    { value: "vi", label: t(($) => $.settings.language.vietnamese) },
    { value: "en", label: t(($) => $.settings.language.english) },
  ] as const;
  const themeOptions = [
    { value: "light", label: t(($) => $.settings.theme.light) },
    { value: "dark", label: t(($) => $.settings.theme.dark) },
  ] as const;

  // TODO: Cần check lại khi xảy ra đồng bộ
  useEffect(() => {
    const updater = async () => {
      await setLanguage(selectedLanguage);
    };
    updater();
  }, [selectedLanguage]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          {t(($) => $.navigation.settings)}
        </Text>
        <View style={styles.list}>
          <SettingsRow
            icon={{ ios: "globe", android: "language", web: "language" }}
            title={t(($) => $.settings.language.title)}
            description={
              languageOptions.find(
                (option) => option.value === selectedLanguage,
              )!.label
            }
            onPress={() => setActiveSheet("language")}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon={{
              ios: "circle.lefthalf.filled",
              android: "contrast",
              web: "contrast",
            }}
            title={t(($) => $.settings.theme.title)}
            description={
              themeOptions.find((option) => option.value === selectedTheme)!
                .label
            }
            onPress={() => setActiveSheet("theme")}
          />
        </View>
        <NotificationSettings />
      </ScrollView>
      <ActionSheet
        visible={activeSheet === "language"}
        title={t(($) => $.settings.language.title)}
        cancelLabel={t(($) => $.actions.cancel)}
        options={languageOptions}
        value={selectedLanguage}
        onSelect={setSelectedLanguage}
        onClose={() => setActiveSheet(null)}
        tintColor="#4F46E5"
      />
      <ActionSheet
        visible={activeSheet === "theme"}
        title={t(($) => $.settings.theme.title)}
        cancelLabel={t(($) => $.actions.cancel)}
        options={themeOptions}
        value={selectedTheme}
        onSelect={setSelectedTheme}
        onClose={() => setActiveSheet(null)}
        tintColor="#4F46E5"
      />
    </SafeAreaView>
  );
}

export default withTranslation("common")(Settings);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F9FB",
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 24,
  },
  list: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E2E8F0",
    marginLeft: 70,
    marginRight: 16,
  },
});
