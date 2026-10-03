import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadMonitorEvents, MonitorEventStorageError, saveMonitorEvent, type MonitorEvent } from "./monitor-event-store.js";

test("通信失敗を含む監視イベントを呼び出し順に追記する", async context => {
  const directory = await mkdtemp(join(tmpdir(), "monitor-events-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "data", "events.jsonl");
  const events: MonitorEvent[] = [
    { url: "https://example.com/", checkedAt: new Date().toISOString(), outcome: "error", message: "timeout" },
    { url: "https://example.org/", checkedAt: new Date().toISOString(), outcome: "healthy", message: "正常応答" },
  ];
  await Promise.all(events.map(event => saveMonitorEvent(event, filePath)));
  assert.deepEqual((await readFile(filePath, "utf8")).trim().split("\n").map(line => JSON.parse(line)), events);
});

test("書き込み失敗後も後続のイベントを保存する", async context => {
  const directory = await mkdtemp(join(tmpdir(), "monitor-event-recovery-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const blockingPath = join(directory, "blocking");
  await writeFile(blockingPath, "file");
  const event: MonitorEvent = { url: "https://example.com/", checkedAt: new Date().toISOString(), outcome: "error", message: "timeout" };
  await assert.rejects(saveMonitorEvent(event, join(blockingPath, "events.jsonl")));
  const filePath = join(directory, "events.jsonl");
  await saveMonitorEvent(event, filePath);
  assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), event);
});

const firstEvent: MonitorEvent = {
  url: "https://example.com/", checkedAt: "2026-10-03T00:00:00.000Z",
  outcome: "healthy", message: "正常応答",
};

test("ファイル未作成と空ファイルでは空の履歴を返す", async context => {
  const directory = await mkdtemp(join(tmpdir(), "monitor-event-empty-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "events.jsonl");
  assert.deepEqual(await loadMonitorEvents(path), []);
  await writeFile(path, "\n  \n");
  assert.deepEqual(await loadMonitorEvents(path), []);
});

test("正常・異常・通信失敗の最新20件を追記順の逆順で取得する", async context => {
  const directory = await mkdtemp(join(tmpdir(), "monitor-event-history-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "events.jsonl");
  const outcomes: MonitorEvent["outcome"][] = ["healthy", "unhealthy", "error"];
  const events = Array.from({ length: 25 }, (_, index) => ({
    ...firstEvent, message: String(index), outcome: outcomes[index % 3]!,
  }));
  await writeFile(path, events.map(event => JSON.stringify(event)).join("\n"));
  assert.deepEqual(await loadMonitorEvents(path), events.slice(-20).reverse());
  assert.deepEqual(await loadMonitorEvents(path, 1), [events[24]]);
  assert.deepEqual(await loadMonitorEvents(path, 0), []);
});

test("大きなファイルの古い行を読まず末尾20件だけ取得する", async context => {
  const directory = await mkdtemp(join(tmpdir(), "monitor-event-tail-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "events.jsonl");
  const events = Array.from({ length: 20 }, (_, index) => ({ ...firstEvent, message: String(index) }));
  await writeFile(path, `${"invalid".repeat(20_000)}\n${events.map(event => JSON.stringify(event)).join("\n")}\n`);
  assert.deepEqual(await loadMonitorEvents(path), events.reverse());
});

test("チャンク境界をまたぐ日本語と長い行を正しく読み込む", async context => {
  const directory = await mkdtemp(join(tmpdir(), "monitor-event-unicode-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "events.jsonl");
  const longEvent = { ...firstEvent, message: "接続エラー".repeat(20_000) };
  await writeFile(path, `${JSON.stringify(firstEvent)}\n${JSON.stringify(longEvent)}\n`);
  assert.deepEqual(await loadMonitorEvents(path), [longEvent, firstEvent]);
});

test("保存中のイベントを待って履歴を取得する", async context => {
  const directory = await mkdtemp(join(tmpdir(), "monitor-event-read-after-write-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "events.jsonl");
  const writes = [saveMonitorEvent(firstEvent, path), saveMonitorEvent({ ...firstEvent, outcome: "error" }, path)];
  const events = await loadMonitorEvents(path);
  await Promise.all(writes);
  assert.deepEqual(events.map(event => event.outcome), ["error", "healthy"]);
});

test("破損行・不正な判定や日時をエラーにし修復後は読み込める", async context => {
  const directory = await mkdtemp(join(tmpdir(), "monitor-event-invalid-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "events.jsonl");
  for (const content of ["invalid\n", JSON.stringify({ ...firstEvent, outcome: "unknown" }),
    JSON.stringify({ ...firstEvent, checkedAt: "invalid" }), JSON.stringify({ ...firstEvent, message: 123 })]) {
    await writeFile(path, content);
    await assert.rejects(loadMonitorEvents(path), MonitorEventStorageError);
  }
  await writeFile(path, JSON.stringify(firstEvent));
  assert.deepEqual(await loadMonitorEvents(path), [firstEvent]);
});

test("読み込み件数の不正な指定を拒否する", async () => {
  for (const limit of [-1, 1.5, NaN, Infinity]) {
    await assert.rejects(loadMonitorEvents(undefined, limit), RangeError);
  }
});
