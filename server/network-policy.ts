import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export class UnsafeTargetError extends Error {
  override name = "UnsafeTargetError";
}

const blockedAddresses = new BlockList();

const blockedIpv4Subnets: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const blockedIpv6Subnets: Array<[string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];

for (const [network, prefix] of blockedIpv4Subnets) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of blockedIpv6Subnets) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    return !blockedAddresses.check(address, "ipv4");
  }

  if (family === 6) {
    return !blockedAddresses.check(address, "ipv6");
  }

  return false;
}

export async function resolvePublicAddress(hostname: string): Promise<ResolvedAddress> {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(normalizedHostname);

  if (literalFamily === 4 || literalFamily === 6) {
    if (!isPublicIpAddress(normalizedHostname)) {
      throw new UnsafeTargetError("プライベートネットワークのURLにはアクセスできません。");
    }

    return { address: normalizedHostname, family: literalFamily };
  }

  const addresses = await lookup(normalizedHostname, { all: true, verbatim: true });
  for (const { address, family } of addresses) {
    if ((family === 4 || family === 6) && isPublicIpAddress(address)) {
      return { address, family };
    }
  }

  throw new UnsafeTargetError("公開ネットワーク上のホストを指定してください。");
}
