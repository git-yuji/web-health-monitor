import type { MonitorEvent } from "./monitor-event-store.js";

const webhookTimeoutMs = 5_000;

export function parseMonitorWebhookUrl(value: string | undefined): URL | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("MONITOR_WEBHOOK_URLには有効なHTTPS URLを指定してください。");
  }

  if (url.protocol !== "https:") {
    throw new Error("MONITOR_WEBHOOK_URLにはHTTPS URLを指定してください。");
  }

  if (url.username || url.password) {
    throw new Error("MONITOR_WEBHOOK_URLに認証情報を含めることはできません。");
  }

  if (url.href.includes("#")) {
    throw new Error("MONITOR_WEBHOOK_URLにフラグメントを含めることはできません。");
  }

  return url;
}

export function createWebhookNotifier(
  webhookUrl: URL | undefined,
  request: typeof fetch = fetch,
): (event: MonitorEvent) => Promise<void> {
  return async (event) => {
    if (webhookUrl === undefined || event.outcome === "healthy") {
      return;
    }

    let response: Response;

    try {
      response = await request(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "WebHealthMonitor/0.1",
        },
        body: JSON.stringify({
          event: "monitor.alert",
          source: "web-health-monitor",
          ...event,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(webhookTimeoutMs),
      });
    } catch {
      // Webhook URLに含まれるトークンをエラー出力へ漏らさない。
      throw new Error("Webhookへの通知に失敗しました。");
    }

    await response.body?.cancel().catch(() => undefined);

    if (!response.ok) {
      throw new Error(`Webhookへの通知に失敗しました（HTTP ${response.status}）。`);
    }
  };
}
