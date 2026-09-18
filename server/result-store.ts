import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  open,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { normalizeTargetUrl } from "../src/url-validation.js";
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

interface ResultFileState {
  size: string;
  modifiedAtNanoseconds: string | null;
  device: string | null;
  inode: string | null;
}

export class ResultStorageError extends Error {
  override name = "ResultStorageError";
}

class InvalidStoredResultError extends Error {
  override name = "InvalidStoredResultError";
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

function tryParseSiteCheckResult(line: string): SiteCheckResult | undefined {
  let result: unknown;

  try {
    result = JSON.parse(line);
  } catch {
    return undefined;
  }

  if (!isSiteCheckResult(result)) {
    return undefined;
  }

  try {
    const normalizedUrl = normalizeTargetUrl(new URL(result.url)).href;
    return normalizedUrl === result.url ? result : { ...result, url: normalizedUrl };
  } catch {
    return result;
  }
}

function getUrlResultsDirectory(filePath: string): string {
  const fileHash = createHash("sha256").update(resolve(filePath)).digest("hex");
  return join(dirname(filePath), urlResultsDirectoryName, fileHash);
}

function getUrlResultsFilePath(filePath: string, url: string): string {
  const urlHash = createHash("sha256").update(url).digest("hex");
  return join(getUrlResultsDirectory(filePath), `${urlHash}.jsonl`);
}

function getUrlResultsIndexMarkerPath(filePath: string): string {
  return join(getUrlResultsDirectory(filePath), urlResultsIndexMarkerName);
}

async function invalidateUrlResultsIndex(filePath: string): Promise<void> {
  try {
    await rm(getUrlResultsIndexMarkerPath(filePath), { force: true });
  } catch {
    // 本体の保存結果を優先し、索引の無効化失敗は次回の状態比較で検出する。
  }
}

async function getFileState(filePath: string): Promise<ResultFileState> {
  try {
    const fileStat = await stat(filePath, { bigint: true });

    return {
      size: fileStat.size.toString(),
      modifiedAtNanoseconds: fileStat.mtimeNs.toString(),
      device: fileStat.dev.toString(),
      inode: fileStat.ino.toString(),
    };
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return {
        size: "0",
        modifiedAtNanoseconds: null,
        device: null,
        inode: null,
      };
    }

    throw error;
  }
}

function isResultFileState(value: unknown): value is ResultFileState {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const state = value as Record<string, unknown>;

  return (
    typeof state.size === "string" &&
    (state.modifiedAtNanoseconds === null ||
      typeof state.modifiedAtNanoseconds === "string") &&
    (state.device === null || typeof state.device === "string") &&
    (state.inode === null || typeof state.inode === "string")
  );
}

async function readIndexedFileState(
  markerPath: string,
): Promise<ResultFileState | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(markerPath, "utf8"));

    return isResultFileState(value) ? value : undefined;
  } catch (error) {
    if (isFileNotFoundError(error) || error instanceof SyntaxError) {
      return undefined;
    }

    throw error;
  }
}

function isSameFileState(
  firstState: ResultFileState | undefined,
  secondState: ResultFileState,
): boolean {
  return (
    firstState?.size === secondState.size &&
    firstState.modifiedAtNanoseconds === secondState.modifiedAtNanoseconds &&
    firstState.device === secondState.device &&
    firstState.inode === secondState.inode
  );
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
          const result = tryParseSiteCheckResult(line);

          if (result) {
            addToUrlIndex(resultsByUrl, result);
          }
        }
      }

      remainder = content.subarray(lineStart);
    }

    const finalLine = remainder.toString("utf8").trim();

    if (finalLine !== "") {
      const result = tryParseSiteCheckResult(finalLine);

      if (result) {
        addToUrlIndex(resultsByUrl, result);
      }
    }

    return resultsByUrl;
  } finally {
    await file.close();
  }
}

async function initializeUrlResultsIndex(filePath: string): Promise<void> {
  const directoryPath = getUrlResultsDirectory(filePath);
  const markerPath = getUrlResultsIndexMarkerPath(filePath);
  const fileState = await getFileState(filePath);
  const indexedFileState = await readIndexedFileState(markerPath);

  if (isSameFileState(indexedFileState, fileState)) {
    return;
  }

  let resultsByUrl = new Map<string, SiteCheckResult[]>();

  try {
    resultsByUrl = await readResultsByUrl(filePath);
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  await rm(directoryPath, { recursive: true, force: true });
  await mkdir(directoryPath, { recursive: true });

  for (const [url, results] of resultsByUrl) {
    const content = `${results.map((result) => JSON.stringify(result)).join("\n")}\n`;
    await writeFile(getUrlResultsFilePath(filePath, url), content, "utf8");
  }

  await writeFile(markerPath, `${JSON.stringify(fileState)}\n`, "utf8");
}

function parseSiteCheckResult(line: string): SiteCheckResult {
  const result = tryParseSiteCheckResult(line);

  if (!result) {
    throw new InvalidStoredResultError(
      "保存された診断結果の形式が正しくありません。",
    );
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

async function rebuildUrlResultsFile(
  filePath: string,
  url: string,
): Promise<SiteCheckResult[]> {
  let resultsByUrl = new Map<string, SiteCheckResult[]>();

  try {
    resultsByUrl = await readResultsByUrl(filePath);
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  const results = resultsByUrl.get(url) ?? [];
  const content =
    results.length === 0
      ? ""
      : `${results.map((item) => JSON.stringify(item)).join("\n")}\n`;
  await writeFile(getUrlResultsFilePath(filePath, url), content, "utf8");

  return results;
}

async function updateUrlResultsIndex(
  filePath: string,
  result: SiteCheckResult,
): Promise<void> {
  const urlResultsFilePath = getUrlResultsFilePath(filePath, result.url);
  let previousResults: SiteCheckResult[] = [];

  try {
    previousResults = await readLatestResults(
      urlResultsFilePath,
      urlHistoryLimit - 1,
    );
  } catch (error) {
    if (
      isFileNotFoundError(error) ||
      error instanceof InvalidStoredResultError
    ) {
      await rebuildUrlResultsFile(filePath, result.url);
      return;
    }

    throw error;
  }

  const results = [...previousResults.reverse(), result];
  const content = `${results.map((item) => JSON.stringify(item)).join("\n")}\n`;
  await writeFile(urlResultsFilePath, content, "utf8");
}

export async function saveSiteCheckResult(
  result: SiteCheckResult,
  filePath = defaultResultsFilePath,
): Promise<void> {
  const save = enqueueStorageOperation(async () => {
    await mkdir(dirname(filePath), { recursive: true });
    let urlResultsIndexReady = true;

    try {
      await initializeUrlResultsIndex(filePath);
    } catch {
      urlResultsIndexReady = false;
    }

    const line = `${JSON.stringify(result)}\n`;
    await appendFile(filePath, line, "utf8");

    if (!urlResultsIndexReady) {
      await invalidateUrlResultsIndex(filePath);
      return;
    }

    try {
      await updateUrlResultsIndex(filePath, result);
      await writeFile(
        getUrlResultsIndexMarkerPath(filePath),
        `${JSON.stringify(await getFileState(filePath))}\n`,
        "utf8",
      );
    } catch {
      await invalidateUrlResultsIndex(filePath);
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
        if (
          isFileNotFoundError(error) ||
          error instanceof InvalidStoredResultError
        ) {
          const rebuiltResults = await rebuildUrlResultsFile(filePath, targetUrl);
          return rebuiltResults.slice(-limit).reverse();
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
