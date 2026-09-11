import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { performance } from "node:perf_hooks";
import { TLSSocket } from "node:tls";
import { resolvePublicAddresses } from "./network-policy.js";
import {
  createSslCertificateInfo,
  InvalidCertificateExpirationError,
  type SslCertificateInfo,
} from "./ssl-certificate.js";

const requestTimeoutMs = 10_000;

export type SiteCheckResult = {
  url: string;
  status: number;
  statusText: string;
  responseTimeMs: number;
  sslCertificate: SslCertificateInfo | null;
  checkedAt: string;
};

export class SiteCheckTimeoutError extends Error {
  override name = "SiteCheckTimeoutError";
}

export async function checkSite(url: URL): Promise<SiteCheckResult> {
  const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
  const startedAt = performance.now();

  try {
    const resolvedAddresses = await resolvePublicAddresses(url.hostname, timeoutSignal);
    const [firstAddress] = resolvedAddresses;
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
              callback(null, resolvedAddresses);
              return;
            }

            callback(null, firstAddress.address, firstAddress.family);
          },
          rejectUnauthorized: url.protocol === "https:" ? false : undefined,
          signal: timeoutSignal,
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const responseTimeMs = Math.round(performance.now() - startedAt);
          const checkedAt = new Date();
          let sslCertificate: SslCertificateInfo | null = null;

          if (url.protocol === "https:") {
            if (!(response.socket instanceof TLSSocket)) {
              response.destroy();
              reject(
                new InvalidCertificateExpirationError(
                  "SSL証明書の有効期限を取得できませんでした。",
                ),
              );
              return;
            }

            try {
              const tlsSocket = response.socket;
              const certificate = tlsSocket.getPeerCertificate();
              const validationError = tlsSocket.authorized
                ? null
                : String(tlsSocket.authorizationError ?? "TLS_CERTIFICATE_INVALID");
              sslCertificate = createSslCertificateInfo(
                certificate.valid_to,
                checkedAt,
                validationError,
              );
            } catch (error) {
              response.destroy();
              reject(error);
              return;
            }
          }

          response.destroy();
          resolve({
            url: url.href,
            status,
            statusText: response.statusMessage ?? "",
            responseTimeMs,
            sslCertificate,
            checkedAt: checkedAt.toISOString(),
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
