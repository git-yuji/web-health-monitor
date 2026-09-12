import { appendFile, mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SiteCheckResult } from "./check-site.js";

const defaultResultsFilePath = resolve(
  process.cwd(),
  "data",
  "check-results.jsonl",
);
const readChunkBytes = 64 * 1024;
let pendingStorageOperation: Promise<unknown> = Promise.resolve();

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

function enqueueStorageOperation<T>(operation: () => Promise<T>): Promise<T> {
  const queuedOperation = pendingStorageOperation.then(operation);
  pendingStorageOperation = queuedOperation.catch(() => undefined);
  return queuedOperation;
}

function parseSiteCheckResult(line: string): SiteCheckResult {
  const result: unknown = JSON.parse(line);

  if (!isSiteCheckResult(result)) {
    throw new Error("保存された診断結果の形式が正しくありません。");
  }

  return result;
}

async function readLatestResults(
  filePath: string,
  limit: number,
  targetUrl?: string,
): Promise<SiteCheckResult[]> {
  if (limit < 1) {
    return [];
  }

  const file = await open(filePath, "r");

  try {
    const { size } = await file.stat();
    const results: SiteCheckResult[] = [];
    let position = size;
    let remainder = Buffer.alloc(0);

    while (position > 0 && results.length < limit) {
      const bytesToRead = Math.min(readChunkBytes, position);
      position -= bytesToRead;
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const { bytesRead } = await file.read(buffer, 0, bytesToRead, position);
      const chunk = buffer.subarray(0, bytesRead);
      const content = Buffer.concat([chunk, remainder]);
      let lineEnd = content.length;

      for (let index = content.length - 1; index >= 0; index -= 1) {
        if (content[index] !== 0x0a) {
          continue;
        }

        const line = content.subarray(index + 1, lineEnd).toString("utf8").trim();
        lineEnd = index;

        if (line === "") {
          continue;
        }

        const result = parseSiteCheckResult(line);

        if (targetUrl === undefined || result.url === targetUrl) {
          results.push(result);

          if (results.length === limit) {
            return results;
          }
        }
      }

      remainder = content.subarray(0, lineEnd);
    }

    const firstLine = remainder.toString("utf8").trim();

    if (firstLine !== "" && results.length < limit) {
      const result = parseSiteCheckResult(firstLine);

      if (targetUrl === undefined || result.url === targetUrl) {
        results.push(result);
      }
    }

    return results;
  } finally {
    await file.close();
  }
}

export async function saveSiteCheckResult(
  result: SiteCheckResult,
  filePath = defaultResultsFilePath,
): Promise<void> {
  const save = enqueueStorageOperation(async () => {
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(result)}\n`, "utf8");
  });

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
  targetUrl?: string,
): Promise<SiteCheckResult[]> {
  try {
    return await enqueueStorageOperation(() =>
      readLatestResults(filePath, limit, targetUrl),
    );
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return [];
    }

    throw new ResultStorageError("診断履歴を読み込めませんでした。", {
      cause: error,
    });
  }
}
