import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSecurityHeaders } from "./security-headers.js";
import { isSecurityHeaderChecks, type SecurityHeaderCheck } from "../src/security-headers.js";

function check(headers: Record<string, string | string[]>, id: SecurityHeaderCheck["id"], https = true): SecurityHeaderCheck {
  const result = analyzeSecurityHeaders(headers, https).find(item => item.id === id);
  assert.ok(result);
  return result;
}

test("ヘッダー未設定でも5項目の診断結果を返す", () => {
  const results = analyzeSecurityHeaders({}, true);
  assert.equal(results.length, 5);
  assert.ok(results.every(item => item.status === "missing" && item.value === null));
  assert.equal(isSecurityHeaderChecks(results), true);
});

test("HTTPのHSTSはヘッダーがあっても対象外にする", () => {
  assert.equal(check({ "strict-transport-security": "max-age=3600" }, "hsts", false).status, "not-applicable");
  assert.equal(check({}, "hsts", false).status, "not-applicable");
});

test("HSTSの正のmax-ageを大文字・引用符付きでも確認する", () => {
  for (const value of ["max-age=31536000; includeSubDomains", 'MAX-AGE="3600"']) {
    assert.equal(check({ "Strict-Transport-Security": value }, "hsts").status, "configured");
  }
});

test("HSTSの解除・不正値・重複は要確認にする", () => {
  for (const value of ["", "max-age=0", "max-age=-1", "max-age=abc", "max-age=1.5", "includeSubDomains",
    "max-age=100; max-age=200", "max-age=100, max-age=200", "max-age=99999999999999999"]) {
    assert.equal(check({ "strict-transport-security": value }, "hsts").status, "review", value);
  }
});

test("適用するCSPとReport-Onlyを区別する", () => {
  assert.equal(check({ "content-security-policy": "default-src 'self'; object-src 'none'" }, "csp").status, "configured");
  const reportOnly = check({ "content-security-policy-report-only": "default-src 'self'" }, "csp");
  assert.equal(reportOnly.status, "review");
  assert.match(reportOnly.message, /制限しません/);
  assert.equal(check({ "content-security-policy": "", "content-security-policy-report-only": "default-src 'self'" }, "csp").status, "review");
});

test("広い許可・空の値・重複・複数CSPは要確認にする", () => {
  for (const value of ["default-src *", "script-src 'unsafe-inline'", "script-src https:", "script-src data:",
    "default-src", "default-src 'self'; default-src *", "report-uri /report", "unknown-directive value",
    "default-src 'self', script-src 'none'"]) {
    assert.equal(check({ "content-security-policy": value }, "csp").status, "review", value);
  }
});

test("CSPのワイルドカード付きホスト・ポートは要確認にする", () => {
  for (const value of [
    "script-src https://*.example.com",
    "script-src *.example.com",
    "script-src https://example.com:*",
    "script-src https://*.example.com:443/assets/",
    "default-src 'self'; img-src https://*.example.com",
    "script-src\t'self'\thttps://*.example.com",
    "script-src https://trusted.example.com https://*.example.com",
  ]) {
    assert.equal(check({ "content-security-policy": value }, "csp").status, "review", value);
  }
});

test("CSPの具体的なホスト・ポートの許可とホストのワイルドカードを区別する", () => {
  for (const value of [
    "script-src https://trusted.example.com",
    "script-src trusted.example.com",
    "script-src https://trusted.example.com:443/assets/",
    "default-src 'self'; img-src https://images.example.com",
    "script-src https://trusted.example.com/path/*",
  ]) {
    assert.equal(check({ "content-security-policy": value }, "csp").status, "configured", value);
  }
});

test("CSPの報告先のワイルドカードを読み込み元の広い許可と誤判定しない", () => {
  assert.equal(check({ "content-security-policy": "default-src 'self'; report-uri https://reports.example.com/csp?tag=*" }, "csp").status, "configured");
});

test("nosniffの値と空・不正値・重複を区別する", () => {
  assert.equal(check({ "x-content-type-options": " nosniff " }, "content-type-options").status, "configured");
  for (const value of ["", "sniff", "nosniff, invalid"]) {
    assert.equal(check({ "x-content-type-options": value }, "content-type-options").status, "review");
  }
});

test("CSPのframe-ancestorsをX-Frame-Optionsより優先する", () => {
  for (const sources of ["'none'", "'self'", "'self' https://trusted.example.com"]) {
    assert.equal(check({ "content-security-policy": `frame-ancestors ${sources}`, "x-frame-options": "ALLOW-FROM https://example.com" }, "frame-options").status, "configured");
  }
  for (const sources of ["*", "https:", "", "'none' 'self'", "https://*.example.com"]) {
    assert.equal(check({ "content-security-policy": `frame-ancestors ${sources}`, "x-frame-options": "DENY" }, "frame-options").status, "review", sources);
  }
});

test("Report-Onlyのframe-ancestorsは埋め込み制限として扱わない", () => {
  assert.equal(check({ "content-security-policy-report-only": "frame-ancestors 'none'" }, "frame-options").status, "missing");
  assert.equal(check({ "content-security-policy-report-only": "frame-ancestors 'none'", "x-frame-options": "SAMEORIGIN" }, "frame-options").status, "configured");
});

test("X-Frame-Optionsの有効な値・廃止値・重複を区別する", () => {
  for (const value of ["DENY", "sameorigin"]) {
    assert.equal(check({ "x-frame-options": value }, "frame-options").status, "configured");
  }
  for (const value of ["ALLOW-FROM https://example.com", "", "DENY, SAMEORIGIN"]) {
    assert.equal(check({ "x-frame-options": value }, "frame-options").status, "review");
  }
});

test("Referrer-Policyは最後の有効な値で判断する", () => {
  assert.equal(check({ "referrer-policy": "no-referrer, strict-origin-when-cross-origin, unknown" }, "referrer-policy").status, "configured");
  for (const value of ["unsafe-url", "no-referrer-when-downgrade", "no-referrer, unsafe-url", "unknown", ""]) {
    assert.equal(check({ "referrer-policy": value }, "referrer-policy").status, "review", value);
  }
});

test("複数ヘッダー値を保持し安全側の判定にする", () => {
  const result = check({ "x-frame-options": ["DENY", "SAMEORIGIN"] }, "frame-options");
  assert.equal(result.value, "DENY, SAMEORIGIN");
  assert.equal(result.status, "review");
});

test("保存・API用の検証で不完全な配列や不正な項目を拒否する", () => {
  const checks = analyzeSecurityHeaders({}, true);
  for (const value of [null, [], checks.slice(1), [...checks.slice(1), checks[1]],
    checks.map((item, i) => i === 0 ? { ...item, status: "safe" } : item),
    checks.map((item, i) => i === 0 ? { ...item, value: 1 } : item),
    checks.map((item, i) => i === 0 ? { ...item, status: ["configured"] } : item)]) {
    assert.equal(isSecurityHeaderChecks(value), false);
  }
});
