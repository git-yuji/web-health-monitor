export type MonitorEvent = {
  url: string;
  checkedAt: string;
  outcome: "healthy" | "unhealthy" | "error";
  message: string;
};

export function isMonitorEvent(value: unknown): value is MonitorEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.url === "string" &&
    typeof event.checkedAt === "string" &&
    Number.isFinite(Date.parse(event.checkedAt)) &&
    (event.outcome === "healthy" || event.outcome === "unhealthy" || event.outcome === "error") &&
    typeof event.message === "string"
  );
}
