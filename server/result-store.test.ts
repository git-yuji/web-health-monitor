import assert from "node:assert/strict";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
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

test("大きな履歴ファイルの末尾から最新20件だけを読み込む", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-large-history-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "results.jsonl");
  const latestResults = Array.from({ length: 20 }, (_, index) => ({
    ...firstResult,
    responseTimeMs: index,
    checkedAt: new Date(Date.UTC(2026, 8, 11, 0, index)).toISOString(),
  }));
  const latestLines = latestResults.map((result) => JSON.stringify(result)).join("\n");
  await writeFile(filePath, `${"invalid".repeat(20_000)}\n${latestLines}\n`, "utf8");

  assert.deepEqual(
    await loadSiteCheckResults(filePath),
    [...latestResults].reverse(),
  );
});

test("URLで絞り込んでから最新件数を制限する", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-url-history-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "results.jsonl");
  const otherResults = Array.from({ length: 20 }, (_, index) => ({
    ...firstResult,
    url: "https://example.org/",
    checkedAt: new Date(Date.UTC(2026, 8, 11, 0, index + 1)).toISOString(),
  }));
  const latestTargetResult = {
    ...secondResult,
    checkedAt: "2026-09-11T01:00:00.000Z",
  };
  const results = [firstResult, ...otherResults, latestTargetResult];
  await writeFile(
    filePath,
    `${results.map((result) => JSON.stringify(result)).join("\n")}\n`,
    "utf8",
  );

  assert.deepEqual(
    await loadSiteCheckResults(filePath, 20, firstResult.url),
    [latestTargetResult, firstResult],
  );
});

test("壊れた旧履歴があっても索引を作成して新しい結果を保存する", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-invalid-index-history-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "results.jsonl");
  await writeFile(
    filePath,
    `invalid history\n${JSON.stringify(firstResult)}\n`,
    "utf8",
  );

  await saveSiteCheckResult(secondResult, filePath);

  assert.deepEqual(
    await loadSiteCheckResults(filePath, 20, firstResult.url),
    [secondResult, firstResult],
  );
});

test("本体への追記後に中断してもURL別索引を再構築する", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-interrupted-index-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "results.jsonl");

  await saveSiteCheckResult(firstResult, filePath);
  await appendFile(filePath, `${JSON.stringify(secondResult)}\n`, "utf8");

  assert.deepEqual(
    await loadSiteCheckResults(filePath, 20, firstResult.url),
    [secondResult, firstResult],
  );
});

test("URL別索引の更新に失敗しても本体への保存を成功扱いにする", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-index-write-error-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "results.jsonl");

  await saveSiteCheckResult(firstResult, filePath);

  const urlResultsRoot = join(temporaryDirectory, "url-results");
  const [historyDirectoryName] = await readdir(urlResultsRoot);
  assert.ok(historyDirectoryName);
  const historyDirectory = join(urlResultsRoot, historyDirectoryName);
  const urlResultsFileName = (await readdir(historyDirectory)).find((name) =>
    name.endsWith(".jsonl"),
  );
  assert.ok(urlResultsFileName);
  const urlResultsFilePath = join(historyDirectory, urlResultsFileName);
  await rm(urlResultsFilePath);
  await mkdir(urlResultsFilePath);

  await saveSiteCheckResult(secondResult, filePath);

  const savedResults = (await readFile(filePath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(savedResults, [firstResult, secondResult]);
  assert.deepEqual(
    await loadSiteCheckResults(filePath, 20, firstResult.url),
    [secondResult, firstResult],
  );
});

test("URL別索引の初期化に失敗しても本体への保存を成功扱いにする", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-index-init-error-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "results.jsonl");
  const blockingPath = join(temporaryDirectory, "url-results");
  await writeFile(blockingPath, "not a directory", "utf8");

  await saveSiteCheckResult(firstResult, filePath);

  assert.deepEqual(
    JSON.parse((await readFile(filePath, "utf8")).trim()),
    firstResult,
  );

  await rm(blockingPath);
  assert.deepEqual(
    await loadSiteCheckResults(filePath, 20, firstResult.url),
    [firstResult],
  );
});

test("URL別索引を最新20件に制限する", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-limited-index-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "results.jsonl");
  const results = Array.from({ length: 25 }, (_, index) => ({
    ...firstResult,
    responseTimeMs: index,
    checkedAt: new Date(Date.UTC(2026, 8, 11, 0, index)).toISOString(),
  }));

  for (const result of results) {
    await saveSiteCheckResult(result, filePath);
  }

  const urlResultsRoot = join(temporaryDirectory, "url-results");
  const [historyDirectoryName] = await readdir(urlResultsRoot);
  assert.ok(historyDirectoryName);
  const historyDirectory = join(urlResultsRoot, historyDirectoryName);
  const urlResultsFileName = (await readdir(historyDirectory)).find((name) =>
    name.endsWith(".jsonl"),
  );
  assert.ok(urlResultsFileName);
  const indexedResults = (
    await readFile(join(historyDirectory, urlResultsFileName), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(indexedResults, results.slice(-20));
  assert.deepEqual(
    await loadSiteCheckResults(filePath, 20, firstResult.url),
    results.slice(-20).reverse(),
  );
});

test("欠落したURL別索引を読み込み時と保存時に再構築する", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-missing-url-index-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "results.jsonl");

  await saveSiteCheckResult(firstResult, filePath);

  const urlResultsRoot = join(temporaryDirectory, "url-results");
  const [historyDirectoryName] = await readdir(urlResultsRoot);
  assert.ok(historyDirectoryName);
  const historyDirectory = join(urlResultsRoot, historyDirectoryName);
  const urlResultsFileName = (await readdir(historyDirectory)).find((name) =>
    name.endsWith(".jsonl"),
  );
  assert.ok(urlResultsFileName);
  const urlResultsFilePath = join(historyDirectory, urlResultsFileName);

  await rm(urlResultsFilePath);
  assert.deepEqual(
    await loadSiteCheckResults(filePath, 20, firstResult.url),
    [firstResult],
  );

  await rm(urlResultsFilePath);
  await saveSiteCheckResult(secondResult, filePath);
  assert.deepEqual(
    await loadSiteCheckResults(filePath, 20, firstResult.url),
    [secondResult, firstResult],
  );
});

test("破損したURL別索引を再構築し履歴なしURLの空索引を保存する", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-invalid-url-index-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "results.jsonl");

  await saveSiteCheckResult(firstResult, filePath);

  const urlResultsRoot = join(temporaryDirectory, "url-results");
  const [historyDirectoryName] = await readdir(urlResultsRoot);
  assert.ok(historyDirectoryName);
  const historyDirectory = join(urlResultsRoot, historyDirectoryName);
  const [urlResultsFileName] = (await readdir(historyDirectory)).filter((name) =>
    name.endsWith(".jsonl"),
  );
  assert.ok(urlResultsFileName);
  await writeFile(join(historyDirectory, urlResultsFileName), "invalid\n", "utf8");

  assert.deepEqual(
    await loadSiteCheckResults(filePath, 20, firstResult.url),
    [firstResult],
  );

  assert.deepEqual(
    await loadSiteCheckResults(filePath, 20, "https://example.org/"),
    [],
  );
  const urlIndexContents = await Promise.all(
    (await readdir(historyDirectory))
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => readFile(join(historyDirectory, name), "utf8")),
  );
  assert.equal(urlIndexContents.length, 2);
  assert.ok(urlIndexContents.includes(""));
});

test("履歴本体を削除した後は古いURL別索引を引き継がない", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-deleted-history-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "results.jsonl");

  await saveSiteCheckResult(firstResult, filePath);
  await rm(filePath);
  await saveSiteCheckResult(secondResult, filePath);

  assert.deepEqual(
    await loadSiteCheckResults(filePath, 20, firstResult.url),
    [secondResult],
  );
});

test("同じサイズの履歴本体へ差し替えてもURL別索引を再構築する", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-rotated-history-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "results.jsonl");
  const rotatedFilePath = join(temporaryDirectory, "rotated.jsonl");
  const replacementResult = {
    ...firstResult,
    url: "https://example.org/",
  };

  await saveSiteCheckResult(firstResult, filePath);
  await writeFile(rotatedFilePath, `${JSON.stringify(replacementResult)}\n`, "utf8");
  await rename(rotatedFilePath, filePath);

  assert.deepEqual(
    await loadSiteCheckResults(filePath, 20, firstResult.url),
    [],
  );
  assert.deepEqual(
    await loadSiteCheckResults(filePath, 20, replacementResult.url),
    [replacementResult],
  );
});

test("同じディレクトリ内の履歴ファイルごとに索引を分離する", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-separated-index-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const firstFilePath = join(temporaryDirectory, "first.jsonl");
  const secondFilePath = join(temporaryDirectory, "second.jsonl");
  await writeFile(firstFilePath, `${JSON.stringify(firstResult)}\n`, "utf8");
  await writeFile(secondFilePath, `${JSON.stringify(secondResult)}\n`, "utf8");

  assert.deepEqual(
    await loadSiteCheckResults(firstFilePath, 20, firstResult.url),
    [firstResult],
  );
  assert.deepEqual(
    await loadSiteCheckResults(secondFilePath, 20, secondResult.url),
    [secondResult],
  );
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
