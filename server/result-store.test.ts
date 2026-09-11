import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { SiteCheckResult } from "./check-site.js";
import {
  loadSiteCheckResults,
  ResultStorageError,
  saveSiteCheckResult,
} from "./result-store.js";

const firstResult: SiteCheckResult = {
  url: "https://example.com/",
  status: 200,
  statusText: "OK",
  responseTimeMs: 120,
  sslCertificate: {
    expiresAt: "2026-12-31T23:59:59.000Z",
    daysRemaining: 111,
    valid: true,
    validationError: null,
  },
  checkedAt: "2026-09-11T00:00:00.000Z",
};

const secondResult: SiteCheckResult = {
  ...firstResult,
  responseTimeMs: 98,
  checkedAt: "2026-09-11T00:05:00.000Z",
};

test("同時に受け取った診断結果を呼び出し順に追記保存する", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-result-store-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "data", "results.jsonl");

  await Promise.all([
    saveSiteCheckResult(firstResult, filePath),
    saveSiteCheckResult(secondResult, filePath),
  ]);

  const lines = (await readFile(filePath, "utf8")).trim().split("\n");

  assert.deepEqual(lines.map((line) => JSON.parse(line)), [firstResult, secondResult]);
  assert.deepEqual(await loadSiteCheckResults(filePath), [secondResult, firstResult]);
});

test("診断履歴を指定件数まで読み込む", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-result-history-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "results.jsonl");

  await saveSiteCheckResult(firstResult, filePath);
  await saveSiteCheckResult(secondResult, filePath);

  assert.deepEqual(await loadSiteCheckResults(filePath, 1), [secondResult]);
});

test("保存ファイルがない場合は空の診断履歴を返す", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-empty-history-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));

  assert.deepEqual(
    await loadSiteCheckResults(join(temporaryDirectory, "missing.jsonl")),
    [],
  );
});

test("不正な形式の診断履歴を拒否する", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-invalid-history-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "results.jsonl");
  await writeFile(filePath, '{"url":"https://example.com/"}\n', "utf8");

  await assert.rejects(loadSiteCheckResults(filePath), ResultStorageError);
});

test("保存できない場合は専用エラーを返す", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-result-store-error-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const blockingFilePath = join(temporaryDirectory, "file");
  await writeFile(blockingFilePath, "not a directory", "utf8");

  await assert.rejects(
    saveSiteCheckResult(firstResult, join(blockingFilePath, "results.jsonl")),
    ResultStorageError,
  );

  const recoveryFilePath = join(temporaryDirectory, "recovery", "results.jsonl");
  await saveSiteCheckResult(secondResult, recoveryFilePath);

  assert.deepEqual(
    JSON.parse((await readFile(recoveryFilePath, "utf8")).trim()),
    secondResult,
  );
});
