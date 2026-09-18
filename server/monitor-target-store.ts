import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const defaultTargetsFilePath = resolve(
  process.cwd(),
  "data",
  "monitor-targets.jsonl",
);
let pendingTargetStorageOperation: Promise<unknown> = Promise.resolve();

export type MonitorTarget = {
  url: string;
  registeredAt: string;
};

export type RegisterMonitorTargetResult = {
  target: MonitorTarget;
  created: boolean;
};

export class MonitorTargetStorageError extends Error {
  override name = "MonitorTargetStorageError";
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isMonitorTarget(value: unknown): value is MonitorTarget {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const target = value as Record<string, unknown>;
  return typeof target.url === "string" && typeof target.registeredAt === "string";
}

function enqueueTargetStorageOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const queuedOperation = pendingTargetStorageOperation.then(operation);
  pendingTargetStorageOperation = queuedOperation.catch(() => undefined);
  return queuedOperation;
}

async function readMonitorTargets(filePath: string): Promise<MonitorTarget[]> {
  let content: string;

  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return [];
    }

    throw error;
  }

  if (content.trim() === "") {
    return [];
  }

  return content
    .trim()
    .split("\n")
    .map((line) => {
      const target: unknown = JSON.parse(line);

      if (!isMonitorTarget(target)) {
        throw new Error("保存された監視対象の形式が正しくありません。");
      }

      return target;
    });
}

export async function registerMonitorTarget(
  url: string,
  filePath = defaultTargetsFilePath,
  registeredAt = new Date().toISOString(),
): Promise<RegisterMonitorTargetResult> {
  try {
    return await enqueueTargetStorageOperation(async () => {
      const targets = await readMonitorTargets(filePath);
      const existingTarget = targets.find((target) => target.url === url);

      if (existingTarget) {
        return { target: existingTarget, created: false };
      }

      const target = { url, registeredAt } satisfies MonitorTarget;
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(filePath, `${JSON.stringify(target)}\n`, "utf8");
      return { target, created: true };
    });
  } catch (error) {
    throw new MonitorTargetStorageError("監視対象を登録できませんでした。", {
      cause: error,
    });
  }
}

export async function loadMonitorTargets(
  filePath = defaultTargetsFilePath,
): Promise<MonitorTarget[]> {
  try {
    return await enqueueTargetStorageOperation(() => readMonitorTargets(filePath));
  } catch (error) {
    throw new MonitorTargetStorageError("監視対象を読み込めませんでした。", {
      cause: error,
    });
  }
}
