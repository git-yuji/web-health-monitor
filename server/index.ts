import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { checkSite, SiteCheckTimeoutError } from "./check-site.js";
import { UnsafeTargetError } from "./network-policy.js";
import {
  loadSiteCheckResults,
  ResultStorageError,
  saveSiteCheckResult,
} from "./result-store.js";
import { validateTargetUrl } from "../src/url-validation.js";

const port = 3000;
const maxRequestBodyBytes = 16 * 1024;

type ErrorResponse = {
  message: string;
};

type TargetUrlResult =
  | { valid: true; url: URL }
  | { valid: false; message: string };

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

function getTargetUrl(body: unknown): TargetUrlResult {
  const urlValue =
    typeof body === "object" && body !== null && "url" in body
      ? (body as { url?: unknown }).url
      : undefined;

  if (typeof urlValue !== "string") {
    return { valid: false, message: "URLを指定してください。" };
  }

  const validationResult = validateTargetUrl(urlValue);

  if (!validationResult.valid) {
    return validationResult;
  }

  if (validationResult.url.username || validationResult.url.password) {
    return {
      valid: false,
      message: "認証情報を含むURLは指定できません。",
    };
  }

  return validationResult;
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

  const targetUrl = getTargetUrl(body);

  if (!targetUrl.valid) {
    sendJson(response, 400, { message: targetUrl.message } satisfies ErrorResponse);
    return;
  }

  try {
    const result = await checkSite(targetUrl.url);
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

async function handleResultsRequest(response: ServerResponse): Promise<void> {
  try {
    const results = await loadSiteCheckResults();
    sendJson(response, 200, { results });
  } catch (error) {
    sendJson(response, 500, { message: getErrorMessage(error) } satisfies ErrorResponse);
  }
}

async function handleResultsByUrlRequest(
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

  const targetUrl = getTargetUrl(body);

  if (!targetUrl.valid) {
    sendJson(response, 400, { message: targetUrl.message } satisfies ErrorResponse);
    return;
  }

  try {
    const results = await loadSiteCheckResults(undefined, 20, targetUrl.url.href);
    sendJson(response, 200, { results });
  } catch (error) {
    sendJson(response, 500, { message: getErrorMessage(error) } satisfies ErrorResponse);
  }
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "POST" && requestUrl.pathname === "/api/check") {
    void handleCheckRequest(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/results") {
    void handleResultsRequest(response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/results") {
    void handleResultsByUrlRequest(request, response);
    return;
  }

  sendJson(response, 404, { message: "APIが見つかりません。" } satisfies ErrorResponse);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`診断APIを http://127.0.0.1:${port} で起動しました。`);
});
