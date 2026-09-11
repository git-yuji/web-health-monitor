import assert from "node:assert/strict";
import test from "node:test";
import { isPublicIpAddress, resolvePublicAddress } from "./network-policy.js";

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
    "fc00::1",
    "fe80::1",
  ];

  for (const address of blockedAddresses) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
});

test("IPリテラル指定でもプライベートアドレスを拒否する", async () => {
  await assert.rejects(
    resolvePublicAddress("127.0.0.1"),
    /プライベートネットワーク/,
  );
});
