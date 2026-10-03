import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type MonitorEvent = {
  url: string;
  checkedAt: string;
  outcome: "healthy" | "unhealthy" | "error";
  message: string;
};

const defaultFilePath = resolve(process.cwd(), "data", "monitor-events.jsonl");
let pendingWrite: Promise<unknown> = Promise.resolve();

export async function saveMonitorEvent(
  event: MonitorEvent,
  filePath = defaultFilePath,
): Promise<void> {
  const write = pendingWrite.then(async () => {
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
  });
  pendingWrite = write.catch(() => undefined);
  await write;
}
