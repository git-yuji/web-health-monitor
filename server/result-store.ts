import { createHash } from "node:crypto";
import { access, appendFile, mkdir, open, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { SiteCheckResult } from "./check-site.js";

const defaultResultsFilePath = resolve(
  process.cwd(),
  "data",
  "check-results.jsonl",
);
const readChunkBytes = 64 * 1024;
const urlHistoryLimit = 20;
const urlResultsDirectoryName = "url-results";
const urlResultsIndexMarkerName = ".initialized";
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

function getUrlResultsDirectory(filePath: string): string {
  return join(dirname(filePath), urlResultsDirectoryName);
}

function getUrlResultsFilePath(filePath: string, url: string): string {
  const urlHash = createHash("sha256").update(url).digest("hex");
  return join(getUrlResultsDirectory(filePath), `${urlHash}.jsonl`);
}

function getUrlResultsIndexMarkerPath(filePath: string): string {
  return join(getUrlResultsDirectory(filePath), urlResultsIndexMarkerName);
}

function addToUrlIndex(
  resultsByUrl: Map<string, SiteCheckResult[]>,
  result: SiteCheckResult,
): void {
  const results = resultsByUrl.get(result.url) ?? [];
  results.push(result);

  if (results.length > urlHistoryLimit) {
    results.shift();
  }

  resultsByUrl.set(result.url, results);
}

async function readResultsByUrl(
  filePath: string,
): Promise<Map<string, SiteCheckResult[]>> {
  const file = await open(filePath, "r");

  try {
    const resultsByUrl = new Map<string, SiteCheckResult[]>();
    const { size } = await file.stat();
    let position = 0;
    let remainder = Buffer.alloc(0);

    while (position < size) {
      const bytesToRead = Math.min(readChunkBytes, size - position);
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const { bytesRead } = await file.read(buffer, 0, bytesToRead, position);

      if (bytesRead === 0) {
        break;
      }

      position += bytesRead;
      const content = Buffer.concat([remainder, buffer.subarray(0, bytesRead)]);
      let lineStart = 0;

      for (let index = 0; index < content.length; index += 1) {
        if (content[index] !== 0x0a) {
          continue;
        }

        const line = content.subarray(lineStart, index).toString("utf8").trim();
        lineStart = index + 1;

        if (line !== "") {
          addToUrlIndex(resultsByUrl, parseSiteCheckResult(line));
        }
      }

      remainder = content.subarray(lineStart);
    }

    const finalLine = remainder.toString("utf8").trim();

    if (finalLine !== "") {
      addToUrlIndex(resultsByUrl, parseSiteCheckResult(finalLine));
    }

    return resultsByUrl;
  } finally {
    await file.close();
  }
}

async function initializeUrlResultsIndex(filePath: string): Promise<void> {
  const directoryPath = getUrlResultsDirectory(filePath);
  const markerPath = getUrlResultsIndexMarkerPath(filePath);

  try {
    await access(markerPath);
    return;
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  let resultsByUrl = new Map<string, SiteCheckResult[]>();

  try {
    resultsByUrl = await readResultsByUrl(filePath);
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  await mkdir(directoryPath, { recursive: true });

  for (const [url, results] of resultsByUrl) {
    const content = `${results.map((result) => JSON.stringify(result)).join("\n")}\n`;
    await writeFile(getUrlResultsFilePath(filePath, url), content, "utf8");
  }

  await writeFile(markerPath, "1\n", "utf8");
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
    await initializeUrlResultsIndex(filePath);
    await mkdir(dirname(filePath), { recursive: true });
    const line = `${JSON.stringify(result)}\n`;
    await appendFile(filePath, line, "utf8");

    try {
      await appendFile(getUrlResultsFilePath(filePath, result.url), line, "utf8");
    } catch (error) {
      await rm(getUrlResultsIndexMarkerPath(filePath), { force: true });
      throw error;
    }
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
    return await enqueueStorageOperation(async () => {
      if (targetUrl === undefined) {
        return readLatestResults(filePath, limit);
      }

      await initializeUrlResultsIndex(filePath);

      try {
        return await readLatestResults(
          getUrlResultsFilePath(filePath, targetUrl),
          limit,
        );
      } catch (error) {
        if (isFileNotFoundError(error)) {
          return [];
        }

        throw error;
      }
    });
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return [];
    }

    throw new ResultStorageError("診断履歴を読み込めませんでした。", {
      cause: error,
    });
  }
}
