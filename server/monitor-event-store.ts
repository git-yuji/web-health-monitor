import { appendFile, mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isMonitorEvent, type MonitorEvent } from "../src/monitor-event.js";

export type { MonitorEvent } from "../src/monitor-event.js";

const defaultFilePath = resolve(process.cwd(), "data", "monitor-events.jsonl");
const readChunkBytes = 64 * 1024;
let pendingStorageOperation: Promise<unknown> = Promise.resolve();

export class MonitorEventStorageError extends Error {
  override name = "MonitorEventStorageError";
}

function enqueueStorageOperation<T>(operation: () => Promise<T>): Promise<T> {
  const queued = pendingStorageOperation.then(operation);
  pendingStorageOperation = queued.catch(() => undefined);
  return queued;
}

export async function saveMonitorEvent(
  event: MonitorEvent,
  filePath = defaultFilePath,
): Promise<void> {
  const write = enqueueStorageOperation(async () => {
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
  });
  await write;
}

async function readLatestEvents(filePath: string, limit: number): Promise<MonitorEvent[]> {
  const file = await open(filePath, "r");
  try {
    const { size } = await file.stat();
    const events: MonitorEvent[] = [];
    let position = size;
    let remainder = Buffer.alloc(0);

    function addLine(buffer: Buffer): void {
      const line = buffer.toString("utf8").trim();
      if (line === "") return;
      const value: unknown = JSON.parse(line);
      if (!isMonitorEvent(value)) throw new Error("保存された監視イベントの形式が正しくありません。");
      events.push(value);
    }

    while (position > 0 && events.length < limit) {
      const bytesToRead = Math.min(readChunkBytes, position);
      position -= bytesToRead;
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const { bytesRead } = await file.read(buffer, 0, bytesToRead, position);
      const content = Buffer.concat([buffer.subarray(0, bytesRead), remainder]);
      let lineEnd = content.length;
      for (let index = content.length - 1; index >= 0; index--) {
        if (content[index] !== 0x0a) continue;
        addLine(content.subarray(index + 1, lineEnd));
        lineEnd = index;
        if (events.length === limit) return events;
      }
      remainder = content.subarray(0, lineEnd);
    }
    if (events.length < limit) addLine(remainder);
    return events;
  } finally {
    await file.close();
  }
}

export async function loadMonitorEvents(
  filePath = defaultFilePath,
  limit = 20,
): Promise<MonitorEvent[]> {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("件数には0以上の整数を指定してください。");
  if (limit === 0) return [];
  try {
    return await enqueueStorageOperation(() => readLatestEvents(filePath, limit));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw new MonitorEventStorageError("監視イベントを読み込めませんでした。", { cause: error });
  }
}
