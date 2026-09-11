export type SiteCheckResult = {
  url: string;
  status: number;
  statusText: string;
  responseTimeMs: number;
  checkedAt: string;
};

function isSiteCheckResult(value: unknown): value is SiteCheckResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const result = value as Partial<SiteCheckResult>;

  return (
    typeof result.url === "string" &&
    typeof result.status === "number" &&
    typeof result.statusText === "string" &&
    typeof result.responseTimeMs === "number" &&
    typeof result.checkedAt === "string"
  );
}

function getApiErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("message" in value)) {
    return undefined;
  }

  return typeof value.message === "string" ? value.message : undefined;
}

export async function requestSiteCheck(url: string): Promise<SiteCheckResult> {
  const response = await fetch("/api/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });

  let responseBody: unknown;

  try {
    responseBody = await response.json();
  } catch {
    throw new Error("診断APIから読み取れないレスポンスを受信しました。");
  }

  if (!response.ok) {
    throw new Error(getApiErrorMessage(responseBody) ?? "サイトの確認に失敗しました。");
  }

  if (!isSiteCheckResult(responseBody)) {
    throw new Error("診断APIから不正なレスポンスを受信しました。");
  }

  return responseBody;
}
