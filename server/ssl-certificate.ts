const millisecondsPerDay = 24 * 60 * 60 * 1_000;

export type SslCertificateInfo = {
  expiresAt: string;
  daysRemaining: number;
};

export class InvalidCertificateExpirationError extends Error {
  override name = "InvalidCertificateExpirationError";
}

export function createSslCertificateInfo(
  validTo: string,
  checkedAt: Date,
): SslCertificateInfo {
  const expiresAt = new Date(validTo);

  if (Number.isNaN(expiresAt.getTime())) {
    throw new InvalidCertificateExpirationError(
      "SSL証明書の有効期限を取得できませんでした。",
    );
  }

  const remainingMilliseconds = expiresAt.getTime() - checkedAt.getTime();
  const daysRemaining =
    remainingMilliseconds >= 0
      ? Math.ceil(remainingMilliseconds / millisecondsPerDay)
      : Math.floor(remainingMilliseconds / millisecondsPerDay);

  return {
    expiresAt: expiresAt.toISOString(),
    daysRemaining,
  };
}
