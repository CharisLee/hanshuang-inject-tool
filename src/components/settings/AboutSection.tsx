import { useEffect, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { Badge } from "@/components/ui/badge";
import appLogo from "@/assets/icons/hanshuang-logo.png";

interface AboutSectionProps {
  isPortable: boolean;
}

// 应用自身版本（getVersion，本地毫秒级、无网络）也缓存一份，纯为重挂时免去 loading 闪烁。
let appVersionCache: string | null = null;

/**
 * 设置 → 关于：品牌、版本、便携模式。
 * 命令行应用的安装与升级在侧栏「应用」页。
 */
export function AboutSection({ isPortable }: AboutSectionProps) {
  const { t } = useTranslation();
  // 惰性初始化自模块缓存：重挂时首帧即渲染上次的值，避免 loading 闪烁；首次挂载缓存
  // 为空则回退到原始初值（null / loading）。
  const [version, setVersion] = useState<string | null>(() => appVersionCache);
  const [isLoadingVersion, setIsLoadingVersion] = useState(
    () => appVersionCache === null,
  );

  useEffect(() => {
    let active = true;
    const loadAppVersion = async () => {
      try {
        const appVersion = await getVersion();
        appVersionCache = appVersion;
        if (active) {
          setVersion(appVersion);
        }
      } catch (error) {
        console.error("[AboutSection] Failed to load app version", error);
        if (active) {
          setVersion(null);
        }
      } finally {
        if (active) {
          setIsLoadingVersion(false);
        }
      }
    };

    void loadAppVersion();
    return () => {
      active = false;
    };
  }, []);

  const displayVersion = version ?? t("common.unknown");

  return (
    <div className="overflow-hidden rounded-panel border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-4 px-5 py-6">
        <img
          src={appLogo}
          alt=""
          draggable={false}
          className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-border"
        />
        <div className="min-w-0 flex-1">
          <div className="text-title text-fg-1">寒霜注入工具</div>
          <p className="mt-1 text-caption text-fg-2">
            网关注入 · 本机提示词注入
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-caption text-fg-2">
            {isLoadingVersion ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <span className="tabular-nums">
                {`${t("common.version")} v${displayVersion}`}
              </span>
            )}
            {isPortable && (
              <Badge
                variant="secondary"
                className="gap-1 px-1.5 py-0 text-badge"
              >
                <Info className="h-3 w-3" />
                {t("settings.portableMode")}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
