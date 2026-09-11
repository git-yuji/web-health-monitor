import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SiteCheckResult } from "./check-site.js";

const defaultResultsFilePath = resolve(
  process.cwd(),
  "data",
  "check-results.jsonl",
);
let pendingSave: Promise<void> = Promise.resolve();

export class ResultStorageError extends Error {
  override name = "ResultStorageError";
}

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

  const result = value as Record<string, unknown>;

  return (
    typeof result.url === "string" &&
    typeof result.status === "number" &&
    typeof result.statusText === "string" &&
    typeof result.responseTimeMs === "number" &&
    (result.sslCertificate === null || isSslCertificateInfo(result.sslCertificate)) &&
    typeof result.checkedAt === "string"
  );
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export async function saveSiteCheckResult(
  result: SiteCheckResult,
  filePath = defaultResultsFilePath,
): Promise<void> {
  const save = pendingSave.then(async () => {
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(result)}\n`, "utf8");
  });
  pendingSave = save.catch(() => undefined);

  try {
    await save;
  } catch (error) {
    throw new ResultStorageError("診断結果を保存できませんでした。", {
      cause: error,
    });
  }
}

export async function loadSiteCheckResults(
  filePath = defaultResultsFilePath,
  limit = 20,
): Promise<SiteCheckResult[]> {
  await pendingSave;

  try {
    const content = await readFile(filePath, "utf8");
    const results = content
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as unknown);

    if (!results.every(isSiteCheckResult)) {
      throw new Error("保存された診断結果の形式が正しくありません。");
    }

    return results
      .sort((left, right) => right.checkedAt.localeCompare(left.checkedAt))
      .slice(0, limit);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return [];
    }

    throw new ResultStorageError("診断履歴を読み込めませんでした。", {
      cause: error,
    });
  }
}
