import { useTranslation } from "react-i18next";
import { Monitor, Moon, Sun } from "lucide-react";
import type { SettingsFormState } from "@/hooks/useSettings";
import { useTheme } from "@/components/theme-provider";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppToggleGroup } from "@/components/common/AppToggleGroup";
import { APP_IDS, DEFAULT_VISIBLE_APPS } from "@/config/appConfig";
import type { AppId } from "@/lib/api/types";
import {
  SettingsBlock,
  SettingsCard,
  SettingsRow,
} from "@/components/settings/SettingsLayout";

type Language = SettingsFormState["language"];

const LANGUAGES: { value: Language; labelKey: string }[] = [
  { value: "zh", labelKey: "settings.languageOptionChinese" },
  { value: "zh-TW", labelKey: "settings.languageOptionTraditionalChinese" },
  { value: "en", labelKey: "settings.languageOptionEnglish" },
  { value: "ja", labelKey: "settings.languageOptionJapanese" },
  { value: "tr", labelKey: "settings.languageOptionTurkish" },
];

interface GeneralSectionProps {
  settings: SettingsFormState;
  onAutoSave: (updates: Partial<SettingsFormState>) => Promise<boolean>;
}

/**
 * 通用设置：只保留在浏览器/便携版里真实生效的项。
 * 语言与主题保存在 localStorage；侧栏应用开关写入设置对象，
 * 由 App 实时读取。依赖桌面后端的开机自启、托盘、工具更新检查不在此页。
 */
export function GeneralSection({ settings, onAutoSave }: GeneralSectionProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const visibleApps = settings.visibleApps ?? DEFAULT_VISIBLE_APPS;

  const toggleApp = (app: AppId, enabled: boolean) => {
    void onAutoSave({
      visibleApps: { ...visibleApps, [app]: enabled },
    });
  };

  return (
    <>
      <SettingsBlock title={t("settings.general.appearance")}>
        <SettingsCard>
          <SettingsRow
            label={t("settings.language")}
            control={
              <Select
                value={settings.language}
                onValueChange={(value) =>
                  void onAutoSave({ language: value as Language })
                }
              >
                <SelectTrigger
                  className="h-8 w-[160px]"
                  aria-label={t("settings.language")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((language) => (
                    <SelectItem key={language.value} value={language.value}>
                      {t(language.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <SettingsRow
            label={t("settings.theme")}
            control={
              <SegmentedControl
                size="sm"
                aria-label={t("settings.theme")}
                value={theme}
                onValueChange={setTheme}
                items={[
                  {
                    value: "system",
                    label: t("settings.themeSystem"),
                    icon: Monitor,
                  },
                  {
                    value: "light",
                    label: t("settings.themeLight"),
                    icon: Sun,
                  },
                  {
                    value: "dark",
                    label: t("settings.themeDark"),
                    icon: Moon,
                  },
                ]}
              />
            }
          />
        </SettingsCard>
      </SettingsBlock>

      <SettingsBlock title={t("settings.general.sidebarAndHeader")}>
        <SettingsCard>
          <SettingsRow
            label={t("settings.general.visibleApps")}
            control={
              <AppToggleGroup
                apps={visibleApps}
                onToggle={toggleApp}
                appIds={APP_IDS}
              />
            }
          />
        </SettingsCard>
      </SettingsBlock>
    </>
  );
}
