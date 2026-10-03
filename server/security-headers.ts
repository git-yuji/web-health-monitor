import type { SecurityHeaderCheck } from "../src/security-headers.js";

type ResponseHeaders = Readonly<Record<string, string | string[] | undefined>>;

function parseDirectives(value: string): { directives: Map<string, string>; duplicate: boolean } {
  const directives = new Map<string, string>();
  let duplicate = false;
  for (const part of value.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = /^(\S+)(?:\s+(.*))?$/.exec(trimmed);
    if (!match) continue;
    const name = match[1]!.toLowerCase();
    if (directives.has(name)) duplicate = true;
    else directives.set(name, match[2] ?? "");
  }
  return { directives, duplicate };
}

export function analyzeSecurityHeaders(headers: ResponseHeaders, isHttps: boolean): SecurityHeaderCheck[] {
  const normalized = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  const get = (name: string): string | null => {
    const value = normalized.get(name);
    return value === undefined ? null : Array.isArray(value) ? value.join(", ") : value;
  };
  const checks: SecurityHeaderCheck[] = [];
  function add(id: SecurityHeaderCheck["id"], name: string, value: string | null,
    status: SecurityHeaderCheck["status"], message: string): void {
    checks.push({ id, name, value, status, message });
  }

  const hsts = get("strict-transport-security");
  if (!isHttps) {
    add("hsts", "Strict-Transport-Security", hsts, "not-applicable", "HSTSはHTTPSの応答でのみ有効です。");
  } else if (hsts === null) {
    add("hsts", "Strict-Transport-Security", null, "missing", "HTTPS接続を継続するHSTSヘッダーがありません。");
  } else {
    const maxAges = hsts.split(";").map(part => part.trim()).filter(part => /^max-age\s*(?:=|$)/i.test(part));
    const match = maxAges.length === 1 ? /^max-age\s*=\s*(?:"(\d+)"|(\d+))$/i.exec(maxAges[0]!) : null;
    const maxAge = match ? Number(match[1] ?? match[2]) : NaN;
    const configured = Number.isSafeInteger(maxAge) && maxAge > 0 && !hsts.includes(",");
    add("hsts", "Strict-Transport-Security", hsts, configured ? "configured" : "review",
      configured ? `max-age=${maxAge}秒を確認しました。期間やサブドメインへの適用は用途に合わせて確認してください。`
        : "正のmax-ageを確認できません。0はHSTSを解除します。重複や形式も確認してください。");
  }

  const csp = get("content-security-policy");
  const reportOnly = get("content-security-policy-report-only");
  const policy = parseDirectives(csp ?? "");
  if (csp === null) {
    add("csp", "Content-Security-Policy", reportOnly, reportOnly === null ? "missing" : "review",
      reportOnly === null ? "実際に適用するCSPヘッダーがありません。" : "Report-Onlyのみです。違反を報告しますが読み込みを制限しません。");
  } else {
    const protective = ["default-src", "script-src", "script-src-elem", "object-src", "base-uri", "frame-ancestors", "form-action", "sandbox"]
      .some(name => policy.directives.has(name));
    const permissive = /(?:^|\s)(?:\*|https?:|data:|'unsafe-inline'|'unsafe-eval')(?:\s|;|$)/i.test(csp);
    const emptySource = [...policy.directives].some(([name, value]) => name !== "sandbox" &&
      ["default-src", "script-src", "script-src-elem", "object-src", "base-uri", "frame-ancestors", "form-action"].includes(name) && value.trim() === "");
    const configured = protective && !permissive && !emptySource && !policy.duplicate && !csp.includes(",");
    add("csp", "Content-Security-Policy", csp, configured ? "configured" : "review",
      configured ? "適用するCSPを確認しました。許可元や各ディレクティブの妥当性は手動確認が必要です。"
        : "CSPの内容を確認してください。広い許可、空の値、重複、複数ポリシーなどは自動判定の対象外です。");
  }

  const contentType = get("x-content-type-options");
  add("content-type-options", "X-Content-Type-Options", contentType,
    contentType === null ? "missing" : contentType.trim().toLowerCase() === "nosniff" ? "configured" : "review",
    contentType === null ? "ファイル形式の推測を抑止するヘッダーがありません。"
      : contentType.trim().toLowerCase() === "nosniff" ? "nosniffを確認しました。" : "値がnosniffか確認してください。");

  const xfo = get("x-frame-options");
  const ancestors = policy.directives.get("frame-ancestors");
  if (ancestors !== undefined) {
    const sources = ancestors.trim().split(/\s+/);
    const restricted = sources.length === 1 && sources[0] === "'none'" || sources.every(source => {
      if (source === "'self'") return true;
      try {
        const url = new URL(source);
        return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname) &&
          !source.includes("*") && !url.username && !url.password && !url.search && !url.hash;
      } catch { return false; }
    });
    const configured = restricted && !policy.duplicate && !csp?.includes(",");
    add("frame-options", "CSP frame-ancestors / X-Frame-Options", `frame-ancestors ${ancestors}${xfo === null ? "" : ` / X-Frame-Options: ${xfo}`}`,
      configured ? "configured" : "review", configured
        ? "CSPのframe-ancestorsによる埋め込み制限を確認しました。許可元を確認してください。"
        : "frame-ancestorsの許可元・形式を確認してください。X-Frame-Optionsより優先されます。");
  } else {
    const configured = xfo !== null && /^(DENY|SAMEORIGIN)$/i.test(xfo.trim());
    add("frame-options", "CSP frame-ancestors / X-Frame-Options", xfo,
      xfo === null ? "missing" : configured ? "configured" : "review",
      xfo === null ? "埋め込み制限の設定がありません。CSPのframe-ancestorsまたはX-Frame-Optionsを検討してください。"
        : configured ? "X-Frame-Optionsによる埋め込み制限を確認しました。"
          : "DENYまたはSAMEORIGINか確認してください。ALLOW-FROMは現在のブラウザでは非対応です。");
  }

  const referrer = get("referrer-policy");
  const supported = ["no-referrer", "no-referrer-when-downgrade", "same-origin", "origin", "strict-origin", "origin-when-cross-origin", "strict-origin-when-cross-origin", "unsafe-url"];
  const effective = referrer?.split(",").map(value => value.trim().toLowerCase()).filter(value => supported.includes(value)).at(-1);
  const configured = effective !== undefined && !["unsafe-url", "no-referrer-when-downgrade"].includes(effective);
  add("referrer-policy", "Referrer-Policy", referrer,
    referrer === null ? "missing" : configured ? "configured" : "review",
    referrer === null ? "明示的な参照元ポリシーがありません。ブラウザの既定値が使用されます。"
      : configured ? `有効なポリシー: ${effective}。送信範囲が用途に合うか確認してください。`
        : "有効なポリシーと参照元情報の送信範囲を確認してください。");
  return checks;
}
