import { checkSite, type SiteCheckResult } from "./check-site.js";
import { loadMonitorTargets, type MonitorTarget } from "./monitor-target-store.js";
import { saveMonitorEvent, type MonitorEvent } from "./monitor-event-store.js";
import { saveSiteCheckResult } from "./result-store.js";
import { validateTargetUrl } from "../src/url-validation.js";

const defaultIntervalMs = 5 * 60 * 1_000;

export function parseMonitorInterval(value: string | undefined): number {
  if (value === undefined) return defaultIntervalMs;
  if (!/^\d+$/.test(value)) {
    throw new Error("MONITOR_INTERVAL_MSには0または1000以上の整数を指定してください。");
  }
  const interval = Number(value);
  if (interval !== 0 && (interval < 1_000 || interval > 2_147_483_647)) {
    throw new Error("MONITOR_INTERVAL_MSには0または1000〜2147483647を指定してください。");
  }
  return interval;
}

export function classifyMonitorResult(result: SiteCheckResult): MonitorEvent {
  const reasons: string[] = [];
  if (result.status < 200 || result.status >= 400) {
    reasons.push(`HTTP ${result.status} ${result.statusText}`.trim());
  }
  if (result.sslCertificate) {
    if (!result.sslCertificate.valid) {
      reasons.push(`SSL検証エラー: ${result.sslCertificate.validationError ?? "不明"}`);
    }
    if (result.sslCertificate.daysRemaining <= 30) {
      reasons.push(`SSL証明書の残日数: ${result.sslCertificate.daysRemaining}日`);
    }
  }
  return {
    url: result.url,
    checkedAt: result.checkedAt,
    outcome: reasons.length === 0 ? "healthy" : "unhealthy",
    message: reasons.length === 0 ? "正常応答" : reasons.join(" / "),
  };
}

type Dependencies = {
  loadTargets: () => Promise<MonitorTarget[]>;
  check: (url: URL) => Promise<SiteCheckResult>;
  saveResult: (result: SiteCheckResult) => Promise<void>;
  saveEvent: (event: MonitorEvent) => Promise<void>;
  onEvent: (event: MonitorEvent) => void;
  onError: (error: unknown) => void;
};

export function createMonitorRunner(
  intervalMs: number,
  overrides: Partial<Dependencies> = {},
): { start: () => void; run: () => Promise<void>; stop: () => Promise<void> } {
  // setTimeoutの範囲を超える値による高速ループを防ぐ。
  parseMonitorInterval(String(intervalMs));
  const dependencies: Dependencies = {
    loadTargets: loadMonitorTargets,
    check: checkSite,
    saveResult: saveSiteCheckResult,
    saveEvent: saveMonitorEvent,
    onEvent: (event) => {
      if (event.outcome !== "healthy") {
        console.warn(`[監視 ${event.outcome}] ${event.url}: ${event.message}`);
      }
    },
    onError: (error) => console.error("定期監視の処理に失敗しました。", error),
    ...overrides,
  };
  let active: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  let stopped = false;

  async function checkTarget(target: MonitorTarget): Promise<void> {
    let result: SiteCheckResult;
    try {
      const validation = validateTargetUrl(target.url);
      if (!validation.valid) throw new Error(validation.message);
      if (validation.url.username || validation.url.password) {
        throw new Error("認証情報を含むURLは指定できません。");
      }
      result = await dependencies.check(validation.url);
    } catch (error) {
      const event: MonitorEvent = {
        url: target.url,
        checkedAt: new Date().toISOString(),
        outcome: "error",
        message: error instanceof Error ? error.message : "サイトの確認に失敗しました。",
      };
      await dependencies.saveEvent(event);
      dependencies.onEvent(event);
      return;
    }
    // 保存失敗をサイトの通信障害として扱わない。
    await dependencies.saveResult(result);
    const event = classifyMonitorResult(result);
    await dependencies.saveEvent(event);
    dependencies.onEvent(event);
  }

  async function cycle(): Promise<void> {
    try {
      const targets = await dependencies.loadTargets();
      for (const target of targets) {
        if (stopped) break;
        try {
          await checkTarget(target);
        } catch (error) {
          dependencies.onError(error);
        }
      }
    } catch (error) {
      dependencies.onError(error);
    }
  }

  function run(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (active) return active;
    active = cycle().finally(() => { active = undefined; });
    return active;
  }

  async function tick(): Promise<void> {
    await run();
    if (!stopped) timer = setTimeout(() => { void tick(); }, intervalMs);
  }

  return {
    run,
    start: () => {
      if (started || stopped || intervalMs === 0) return;
      started = true;
      void tick();
    },
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await active;
    },
  };
}
