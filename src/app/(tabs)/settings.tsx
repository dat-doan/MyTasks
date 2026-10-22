import { withTranslation, type WithTranslation } from "react-i18next";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function Settings({ t }: WithTranslation<"common">) {
  return (
    <SafeAreaView style={{ flex: 1, padding: 20 }}>
      <Text>{t(($) => $.navigation.settings)}</Text>
    </SafeAreaView>
  );
}

export default withTranslation("common")(Settings);