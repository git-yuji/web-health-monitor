export const securityHeaderIds = ["hsts", "csp", "content-type-options", "frame-options", "referrer-policy"] as const;
export type SecurityHeaderCheck = {
  id: typeof securityHeaderIds[number];
  name: string;
  value: string | null;
  status: "configured" | "missing" | "review" | "not-applicable";
  message: string;
};

export function isSecurityHeaderChecks(value: unknown): value is SecurityHeaderCheck[] {
  if (!Array.isArray(value) || value.length !== securityHeaderIds.length) return false;
  const ids = new Set<string>();
  for (const item of value) {
    if (typeof item !== "object" || item === null) return false;
    const check = item as Record<string, unknown>;
    if (
      !securityHeaderIds.some(id => id === check.id) ||
      typeof check.name !== "string" ||
      (check.value !== null && typeof check.value !== "string") ||
      typeof check.status !== "string" ||
      !["configured", "missing", "review", "not-applicable"].includes(check.status) ||
      typeof check.message !== "string"
    ) return false;
    ids.add(check.id as string);
  }
  return ids.size === securityHeaderIds.length;
}
