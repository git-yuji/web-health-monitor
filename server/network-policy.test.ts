import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicIpAddress,
  resolvePublicAddresses,
  selectPublicAddresses,
} from "./network-policy.js";

test("公開IPv4アドレスを許可する", () => {
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("::ffff:8.8.8.8"), true);
});

test("ローカルおよびプライベートIPアドレスを拒否する", () => {
  const blockedAddresses = [
    "0.0.0.0",
    "10.0.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.168.0.1",
    "::ffff:127.0.0.1",
    "::",
    "::1",
    "::7f00:1",
    "64:ff9b:1::1",
    "2002:7f00:1::1",
    "fc00::1",
    "fe80::1",
    "fec0::1",
  ];

  for (const address of blockedAddresses) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
});

test("IPリテラル指定でもプライベートアドレスを拒否する", async () => {
  await assert.rejects(
    resolvePublicAddresses("127.0.0.1"),
    /プライベートネットワーク/,
  );
});

test("DNS解決前に中断された場合は中断理由を返す", async () => {
  const reason = new Error("timeout");

  await assert.rejects(
    resolvePublicAddresses("example.invalid", AbortSignal.abort(reason)),
    reason,
  );
});

test("複数の公開アドレスを順序どおり保持する", () => {
  const addresses = selectPublicAddresses([
    { address: "2001:4860:4860::8888", family: 6 },
    { address: "192.168.0.1", family: 4 },
    { address: "8.8.8.8", family: 4 },
  ]);

  assert.deepEqual(addresses, [
    { address: "2001:4860:4860::8888", family: 6 },
    { address: "8.8.8.8", family: 4 },
  ]);
});
