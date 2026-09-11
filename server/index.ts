import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { checkSite, SiteCheckTimeoutError } from "./check-site.js";
import { UnsafeTargetError } from "./network-policy.js";
import { ResultStorageError, saveSiteCheckResult } from "./result-store.js";
import { validateTargetUrl } from "../src/url-validation.js";

const port = 3000;
const maxRequestBodyBytes = 16 * 1024;

type ErrorResponse = {
  message: string;
};

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: object,
): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;

    if (receivedBytes > maxRequestBodyBytes) {
      throw new Error("リクエストが大きすぎます。");
    }

    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof SyntaxError) {
    return "リクエストのJSON形式が正しくありません。";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "サイトの確認に失敗しました。";
}

async function handleCheckRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    sendJson(response, 400, { message: getErrorMessage(error) } satisfies ErrorResponse);
    return;
  }

  const urlValue =
    typeof body === "object" && body !== null && "url" in body
      ? (body as { url?: unknown }).url
      : undefined;

  if (typeof urlValue !== "string") {
    sendJson(response, 400, { message: "URLを指定してください。" } satisfies ErrorResponse);
    return;
  }

  const validationResult = validateTargetUrl(urlValue);

  if (!validationResult.valid) {
    sendJson(response, 400, { message: validationResult.message } satisfies ErrorResponse);
    return;
  }

  if (validationResult.url.username || validationResult.url.password) {
    sendJson(response, 400, {
      message: "認証情報を含むURLは指定できません。",
    } satisfies ErrorResponse);
    return;
  }

  try {
    const result = await checkSite(validationResult.url);
    await saveSiteCheckResult(result);
    sendJson(response, 200, result);
  } catch (error) {
    const statusCode =
      error instanceof UnsafeTargetError
        ? 400
        : error instanceof ResultStorageError
          ? 500
        : error instanceof SiteCheckTimeoutError
          ? 504
          : 502;
    sendJson(response, statusCode, { message: getErrorMessage(error) } satisfies ErrorResponse);
  }
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "POST" && requestUrl.pathname === "/api/check") {
    void handleCheckRequest(request, response);
    return;
  }

  sendJson(response, 404, { message: "APIが見つかりません。" } satisfies ErrorResponse);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`診断APIを http://127.0.0.1:${port} で起動しました。`);
});
