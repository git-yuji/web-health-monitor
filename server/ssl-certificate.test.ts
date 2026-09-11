import assert from "node:assert/strict";
import test from "node:test";
import {
  createSslCertificateInfo,
  InvalidCertificateExpirationError,
} from "./ssl-certificate.js";

test("SSL証明書の有効期限と残日数を返す", () => {
  const checkedAt = new Date("2026-09-11T00:00:00.000Z");

  assert.deepEqual(
    createSslCertificateInfo("Sep 21 00:00:00 2026 GMT", checkedAt),
    {
      expiresAt: "2026-09-21T00:00:00.000Z",
      daysRemaining: 10,
      valid: true,
      validationError: null,
    },
  );
});

test("24時間未満の残り時間を1日として数える", () => {
  const checkedAt = new Date("2026-09-11T12:00:00.000Z");

  assert.equal(
    createSslCertificateInfo("Sep 12 00:00:00 2026 GMT", checkedAt).daysRemaining,
    1,
  );
});

test("期限切れから24時間未満の場合はマイナス1日として数える", () => {
  const checkedAt = new Date("2026-09-11T12:00:00.000Z");

  assert.equal(
    createSslCertificateInfo("Sep 11 00:00:00 2026 GMT", checkedAt).daysRemaining,
    -1,
  );
});

test("不正な有効期限を拒否する", () => {
  assert.throws(
    () => createSslCertificateInfo("invalid", new Date("2026-09-11T00:00:00.000Z")),
    InvalidCertificateExpirationError,
  );
});

test("TLS検証エラーを証明書情報に保持する", () => {
  const checkedAt = new Date("2026-09-11T00:00:00.000Z");
  const certificate = createSslCertificateInfo(
    "Apr 12 23:59:59 2015 GMT",
    checkedAt,
    "CERT_HAS_EXPIRED",
  );

  assert.equal(certificate.valid, false);
  assert.equal(certificate.validationError, "CERT_HAS_EXPIRED");
  assert.ok(certificate.daysRemaining < 0);
});
