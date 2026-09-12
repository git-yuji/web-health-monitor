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

async function readLatestLines(filePath: string, limit: number): Promise<string[]> {
  const file = await open(filePath, "r");

  try {
    const { size } = await file.stat();
    const chunks: Buffer[] = [];
    let position = size;
    let newlineCount = 0;

    while (position > 0 && newlineCount <= limit) {
      const bytesToRead = Math.min(readChunkBytes, position);
      position -= bytesToRead;
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const { bytesRead } = await file.read(buffer, 0, bytesToRead, position);
      const chunk = buffer.subarray(0, bytesRead);
      chunks.push(chunk);

      for (const byte of chunk) {
        if (byte === 0x0a) {
          newlineCount += 1;
        }
      }
    }

    const lines = Buffer.concat(chunks.reverse()).toString("utf8").split("\n");

    if (position > 0) {
      lines.shift();
    }

    return lines.filter((line) => line.trim() !== "").slice(-limit);
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
): Promise<SiteCheckResult[]> {
  try {
    const results = await enqueueStorageOperation(async () => {
      const lines = await readLatestLines(filePath, limit);
      return lines.map((line) => JSON.parse(line) as unknown);
    });

    if (!results.every(isSiteCheckResult)) {
      throw new Error("保存された診断結果の形式が正しくありません。");
    }

    return results.reverse();
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return [];
    }

    throw new ResultStorageError("診断履歴を読み込めませんでした。", {
      cause: error,
    });
  }
}
