import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SiteCheckResult } from "./check-site.js";

const defaultResultsFilePath = resolve(
  process.cwd(),
  "data",
  "check-results.jsonl",
);

export class ResultStorageError extends Error {
  override name = "ResultStorageError";
}

export async function saveSiteCheckResult(
  result: SiteCheckResult,
  filePath = defaultResultsFilePath,
): Promise<void> {
  try {
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(result)}\n`, "utf8");
  } catch (error) {
    throw new ResultStorageError("診断結果を保存できませんでした。", {
      cause: error,
    });
  }
}
