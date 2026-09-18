import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  loadMonitorTargets,
  MonitorTargetStorageError,
  registerMonitorTarget,
} from "./monitor-target-store.js";

test("監視対象を登録して一覧を読み込む", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-target-store-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "data", "targets.jsonl");
  const registeredAt = "2026-09-18T00:00:00.000Z";

  const registration = await registerMonitorTarget(
    "https://example.com/",
    filePath,
    registeredAt,
  );

  assert.deepEqual(registration, {
    target: { url: "https://example.com/", registeredAt },
    created: true,
  });
  assert.deepEqual(await loadMonitorTargets(filePath), [registration.target]);
});

test("同じURLを重複登録しない", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-duplicate-target-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "targets.jsonl");
  const firstRegistration = await registerMonitorTarget(
    "https://example.com/",
    filePath,
    "2026-09-18T00:00:00.000Z",
  );

  const secondRegistration = await registerMonitorTarget(
    "https://example.com/",
    filePath,
    "2026-09-18T01:00:00.000Z",
  );

  assert.deepEqual(secondRegistration, {
    target: firstRegistration.target,
    created: false,
  });
  assert.equal((await readFile(filePath, "utf8")).trim().split("\n").length, 1);
});

test("同時登録を呼び出し順に保存する", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-concurrent-target-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "targets.jsonl");

  await Promise.all([
    registerMonitorTarget(
      "https://example.com/",
      filePath,
      "2026-09-18T00:00:00.000Z",
    ),
    registerMonitorTarget(
      "https://example.org/",
      filePath,
      "2026-09-18T00:01:00.000Z",
    ),
  ]);

  assert.deepEqual(
    (await loadMonitorTargets(filePath)).map((target) => target.url),
    ["https://example.com/", "https://example.org/"],
  );
});

test("保存ファイルがない場合は空の一覧を返す", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-empty-targets-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));

  assert.deepEqual(
    await loadMonitorTargets(join(temporaryDirectory, "missing.jsonl")),
    [],
  );
});

test("不正な形式の監視対象を拒否する", async (context) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "web-health-monitor-invalid-targets-"),
  );
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const filePath = join(temporaryDirectory, "targets.jsonl");
  await writeFile(filePath, '{"url":"https://example.com/"}\n', "utf8");

  await assert.rejects(loadMonitorTargets(filePath), MonitorTargetStorageError);
});
