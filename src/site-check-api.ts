export type SiteCheckResult = {
  url: string;
  status: number;
  statusText: string;
  responseTimeMs: number;
  sslCertificate: {
    expiresAt: string;
    daysRemaining: number;
    valid: boolean;
    validationError: string | null;
  } | null;
  checkedAt: string;
};

function isSslCertificateInfo(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const certificate = value as Record<string, unknown>;

  return (
    typeof certificate.expiresAt === "string" &&
    typeof certificate.daysRemaining === "number" &&
    typeof certificate.valid === "boolean" &&
    (certificate.validationError === null ||
      typeof certificate.validationError === "string")
  );
}

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
    (result.sslCertificate === null || isSslCertificateInfo(result.sslCertificate)) &&
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

export async function requestSiteCheckHistory(): Promise<SiteCheckResult[]> {
  const response = await fetch("/api/results");
  let responseBody: unknown;

  try {
    responseBody = await response.json();
  } catch {
    throw new Error("診断履歴APIから読み取れないレスポンスを受信しました。");
  }

  if (!response.ok) {
    throw new Error(getApiErrorMessage(responseBody) ?? "診断履歴を取得できませんでした。");
  }

  if (
    typeof responseBody !== "object" ||
    responseBody === null ||
    !("results" in responseBody) ||
    !Array.isArray(responseBody.results) ||
    !responseBody.results.every(isSiteCheckResult)
  ) {
    throw new Error("診断履歴APIから不正なレスポンスを受信しました。");
  }

  return responseBody.results;
}
