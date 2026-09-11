import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { performance } from "node:perf_hooks";
import { resolvePublicAddress } from "./network-policy.js";

const requestTimeoutMs = 10_000;

export type SiteCheckResult = {
  url: string;
  status: number;
  statusText: string;
  responseTimeMs: number;
  checkedAt: string;
};

export class SiteCheckTimeoutError extends Error {
  override name = "SiteCheckTimeoutError";
}

export async function checkSite(url: URL): Promise<SiteCheckResult> {
  const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
  const startedAt = performance.now();

  try {
    const resolvedAddress = await resolvePublicAddress(url.hostname, timeoutSignal);
    const request = url.protocol === "https:" ? requestHttps : requestHttp;

    return await new Promise((resolve, reject) => {
      const outgoingRequest = request(
        url,
        {
          method: "GET",
          headers: {
            accept: "*/*",
            "user-agent": "WebHealthMonitor/0.1",
          },
          lookup: (_hostname, options, callback) => {
            if (options.all) {
              callback(null, [resolvedAddress]);
              return;
            }

            callback(null, resolvedAddress.address, resolvedAddress.family);
          },
          signal: timeoutSignal,
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const responseTimeMs = Math.round(performance.now() - startedAt);

          response.destroy();
          resolve({
            url: url.href,
            status,
            statusText: response.statusMessage ?? "",
            responseTimeMs,
            checkedAt: new Date().toISOString(),
          });
        },
      );

      outgoingRequest.on("error", reject);
      outgoingRequest.end();
    });
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new SiteCheckTimeoutError("サイトの確認がタイムアウトしました。");
    }

    throw error;
  }
}
