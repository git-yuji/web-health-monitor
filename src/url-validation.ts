export type UrlValidationResult =
  | { valid: true; url: URL }
  | { valid: false; message: string };

export function validateTargetUrl(value: string): UrlValidationResult {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return { valid: false, message: "URLを入力してください。" };
  }

  let url: URL;

  try {
    url = new URL(trimmedValue);
  } catch {
    return { valid: false, message: "正しい形式のURLを入力してください。" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      valid: false,
      message: "http:// または https:// で始まるURLを入力してください。",
    };
  }

  return { valid: true, url };
}
