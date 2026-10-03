import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { saveMonitorEvent, type MonitorEvent } from "./monitor-event-store.js";

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
