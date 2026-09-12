import "./style.css";
import {
  requestSiteCheck,
  requestSiteCheckHistory,
  type SiteCheckResult,
} from "./site-check-api";
import { createResponseTimeChart } from "./response-time-chart";
import { validateTargetUrl } from "./url-validation";

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("#app が見つかりません。");
}

app.innerHTML = `
  <div class="w-full max-w-full overflow-hidden">
    <header class="border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div class="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <a href="#" class="flex items-center gap-3 text-sm font-bold tracking-tight text-slate-950">
          <span class="grid size-9 place-items-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
            <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M3 12h4l2-6 4 12 2-6h6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          Web Health Monitor
        </a>
        <span class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          MVP準備中
        </span>
      </div>
    </header>

    <main>
      <section class="relative border-b border-slate-200/80 bg-white">
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(16,185,129,0.12),transparent_32%)]"></div>
      <div class="relative mx-auto grid w-full min-w-0 max-w-6xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div class="min-w-0">
          <p class="mb-5 flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-emerald-700">
            <span class="size-2 rounded-full bg-emerald-500"></span>
            WEBSITE OBSERVABILITY
          </p>
          <h1 class="max-w-2xl text-4xl font-bold leading-[1.12] tracking-[-0.045em] text-balance sm:text-6xl">
            Webサイトの健康状態を、ひと目で。
          </h1>
          <p class="mt-6 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
            稼働状態、応答速度、SSL証明書をまとめて確認。異常の兆候を早く見つけるためのシンプルなモニタリングツールです。
          </p>

          <form id="url-check-form" class="mt-9 max-w-xl rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/8 transition focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10" novalidate>
            <div class="flex flex-col gap-2 sm:flex-row">
              <label class="sr-only" for="target-url">確認するURL</label>
              <div class="flex min-w-0 flex-1 items-center gap-3 px-3">
                <svg viewBox="0 0 24 24" class="size-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
                </svg>
                <input id="target-url" type="url" placeholder="https://example.com" autocomplete="url" inputmode="url" aria-describedby="url-form-message" class="min-w-0 flex-1 bg-transparent py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400" />
              </div>
              <button id="url-check-submit" type="submit" class="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
                サイトを確認
              </button>
            </div>
          </form>
          <p id="url-form-message" class="mt-3 text-xs text-slate-600" aria-live="polite">URLを入力するとHTTPステータス、応答時間、SSL証明書の期限を確認できます。稼働率は完成イメージです。</p>
        </div>

        <div class="relative mx-auto min-w-0 w-full max-w-lg">
          <div class="absolute -inset-5 rounded-[2rem] bg-emerald-100/60 blur-2xl"></div>
          <div class="relative min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 p-5 shadow-2xl shadow-slate-950/20 sm:p-7">
            <div class="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p class="text-xs font-medium text-slate-400">MONITORED SITE</p>
                <p id="monitored-site" class="mt-2 font-semibold text-white">example.com</p>
              </div>
              <span id="site-status" class="flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
                <span id="site-status-dot" class="size-2 rounded-full bg-emerald-400"></span>
                <span id="site-status-label">正常稼働</span>
              </span>
            </div>

            <div class="grid grid-cols-1 gap-3 py-5 sm:grid-cols-2">
              <div class="rounded-2xl bg-white/6 p-4 ring-1 ring-inset ring-white/8">
                <p class="text-xs text-slate-400">HTTP STATUS</p>
                <p class="mt-2 text-2xl font-semibold text-white"><span id="http-status">200</span> <span id="http-status-text" class="text-sm font-normal text-slate-400">OK</span></p>
              </div>
              <div class="rounded-2xl bg-white/6 p-4 ring-1 ring-inset ring-white/8">
                <p class="text-xs text-slate-400">RESPONSE</p>
                <p class="mt-2 text-2xl font-semibold text-white"><span id="response-time">184</span> <span class="text-sm font-normal text-slate-400">ms</span></p>
              </div>
              <div class="rounded-2xl bg-white/6 p-4 ring-1 ring-inset ring-white/8">
                <p class="text-xs text-slate-400">SSL EXPIRES</p>
                <p class="mt-2 text-2xl font-semibold text-white"><span id="ssl-days-remaining">-</span> <span id="ssl-days-unit" class="text-sm font-normal text-slate-400">未確認</span></p>
              </div>
              <div class="rounded-2xl bg-white/6 p-4 ring-1 ring-inset ring-white/8">
                <p class="text-xs text-slate-400">UPTIME</p>
                <p class="mt-2 text-2xl font-semibold text-white">99.98<span class="text-sm font-normal text-slate-400">%</span></p>
              </div>
            </div>

            <div class="rounded-2xl bg-white/6 p-4 ring-1 ring-inset ring-white/8">
              <div class="mb-4 flex items-center justify-between">
                <p class="text-xs font-medium text-slate-300">応答時間</p>
                <p id="response-chart-range" class="text-xs text-slate-500">データなし</p>
              </div>
              <svg id="response-chart" viewBox="0 0 400 80" class="block h-20 min-w-0 w-full max-w-full" preserveAspectRatio="none" role="img" aria-label="応答時間の履歴はまだありません">
                <defs>
                  <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#34d399" stop-opacity="0.35" />
                    <stop offset="100%" stop-color="#34d399" stop-opacity="0" />
                  </linearGradient>
                </defs>
                <path id="response-chart-area" fill="url(#chart-fill)" />
                <path id="response-chart-line" fill="none" stroke="#34d399" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                <g id="response-chart-points"></g>
              </svg>
            </div>
          </div>
        </div>
      </div>
      </section>

      <section class="border-b border-slate-200/80 bg-slate-50">
        <div class="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
          <div class="mb-8">
            <p class="text-xs font-bold tracking-[0.16em] text-emerald-700">RECENT CHECKS</p>
            <h2 class="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">診断履歴</h2>
            <p id="history-message" class="mt-3 text-sm text-slate-600" aria-live="polite">診断履歴を読み込んでいます。</p>
          </div>
          <div id="history-list" class="grid gap-3"></div>
        </div>
      </section>

      <section class="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <div class="mb-8 max-w-xl">
        <p class="text-xs font-bold tracking-[0.16em] text-emerald-700">WHAT WE CHECK</p>
        <h2 class="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">運用に必要な情報を、一か所に。</h2>
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <article class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div class="mb-5 grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <span class="text-lg font-bold">01</span>
          </div>
          <h3 class="font-semibold text-slate-950">稼働状態</h3>
          <p class="mt-2 text-sm leading-7 text-slate-600">HTTPステータスを確認し、サイトへ正常にアクセスできるかを記録します。</p>
        </article>
        <article class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div class="mb-5 grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700">
            <span class="text-lg font-bold">02</span>
          </div>
          <h3 class="font-semibold text-slate-950">パフォーマンス</h3>
          <p class="mt-2 text-sm leading-7 text-slate-600">応答時間の変化を追い、いつもと違う遅延に気づけるようにします。</p>
        </article>
        <article class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div class="mb-5 grid size-11 place-items-center rounded-xl bg-amber-50 text-amber-700">
            <span class="text-lg font-bold">03</span>
          </div>
          <h3 class="font-semibold text-slate-950">SSL証明書</h3>
          <p class="mt-2 text-sm leading-7 text-slate-600">有効期限を確認し、証明書の更新忘れを防ぐための情報を表示します。</p>
        </article>
      </div>
      </section>
    </main>

    <footer class="border-t border-slate-200 bg-white">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>© 2026 Web Health Monitor</p>
        <p>Simple monitoring for healthier websites.</p>
      </div>
    </footer>
  </div>
`;

function getRequiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`${selector} が見つかりません。`);
  }

  return element;
}

const urlForm = getRequiredElement<HTMLFormElement>(app, "#url-check-form");
const urlInput = getRequiredElement<HTMLInputElement>(app, "#target-url");
const urlFormMessage = getRequiredElement<HTMLElement>(app, "#url-form-message");
const submitButton = getRequiredElement<HTMLButtonElement>(app, "#url-check-submit");
const monitoredSite = getRequiredElement<HTMLElement>(app, "#monitored-site");
const siteStatus = getRequiredElement<HTMLElement>(app, "#site-status");
const siteStatusDot = getRequiredElement<HTMLElement>(app, "#site-status-dot");
const siteStatusLabel = getRequiredElement<HTMLElement>(app, "#site-status-label");
const httpStatus = getRequiredElement<HTMLElement>(app, "#http-status");
const httpStatusText = getRequiredElement<HTMLElement>(app, "#http-status-text");
const responseTime = getRequiredElement<HTMLElement>(app, "#response-time");
const sslDaysRemaining = getRequiredElement<HTMLElement>(app, "#ssl-days-remaining");
const sslDaysUnit = getRequiredElement<HTMLElement>(app, "#ssl-days-unit");
const historyMessage = getRequiredElement<HTMLElement>(app, "#history-message");
const historyList = getRequiredElement<HTMLElement>(app, "#history-list");
const responseChart = getRequiredElement<SVGElement>(app, "#response-chart");
const responseChartRange = getRequiredElement<HTMLElement>(app, "#response-chart-range");
const responseChartArea = getRequiredElement<SVGPathElement>(app, "#response-chart-area");
const responseChartLine = getRequiredElement<SVGPathElement>(app, "#response-chart-line");
const responseChartPoints = getRequiredElement<SVGGElement>(app, "#response-chart-points");

const defaultMessage = "URLを入力するとHTTPステータス、応答時間、SSL証明書の期限を確認できます。稼働率は完成イメージです。";
type MessageColorClass = "text-slate-600" | "text-red-700" | "text-emerald-700";

function setFormMessage(message: string, colorClass: MessageColorClass): void {
  urlFormMessage.textContent = message;
  urlFormMessage.classList.remove("text-slate-600", "text-red-700", "text-emerald-700");
  urlFormMessage.classList.add(colorClass);
}

function setLoading(isLoading: boolean): void {
  urlInput.disabled = isLoading;
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "確認中..." : "サイトを確認";
}

function isHealthySiteCheck(result: SiteCheckResult): boolean {
  return (
    result.status >= 200 &&
    result.status < 400 &&
    result.sslCertificate?.valid !== false
  );
}

function renderSiteCheck(result: SiteCheckResult): void {
  const isHealthy = isHealthySiteCheck(result);

  monitoredSite.textContent = new URL(result.url).hostname;
  httpStatus.textContent = result.status.toString();
  httpStatusText.textContent = result.statusText;
  responseTime.textContent = result.responseTimeMs.toString();
  sslDaysRemaining.textContent = result.sslCertificate?.daysRemaining.toString() ?? "-";
  sslDaysUnit.textContent = result.sslCertificate ? "日" : "対象外";
  siteStatusLabel.textContent = isHealthy ? "正常応答" : "要確認";
  siteStatus.classList.toggle("bg-emerald-400/10", isHealthy);
  siteStatus.classList.toggle("text-emerald-300", isHealthy);
  siteStatus.classList.toggle("ring-emerald-400/20", isHealthy);
  siteStatus.classList.toggle("bg-red-400/10", !isHealthy);
  siteStatus.classList.toggle("text-red-300", !isHealthy);
  siteStatus.classList.toggle("ring-red-400/20", !isHealthy);
  siteStatusDot.classList.toggle("bg-emerald-400", isHealthy);
  siteStatusDot.classList.toggle("bg-red-400", !isHealthy);
}

function renderResponseTimeTrend(results: SiteCheckResult[]): void {
  const chronologicalResults = [...results].reverse();
  const chart = createResponseTimeChart(
    chronologicalResults.map((result) => result.responseTimeMs),
  );

  responseChartArea.setAttribute("d", chart.areaPath);
  responseChartLine.setAttribute("d", chart.linePath);
  responseChartPoints.replaceChildren();
  responseChartRange.textContent =
    results.length === 0 ? "データなし" : `最新${results.length}件`;
  responseChart.setAttribute(
    "aria-label",
    results.length === 0
      ? "応答時間の履歴はまだありません"
      : `最新${results.length}件の応答時間の推移`,
  );

  for (const [index, point] of chart.points.entries()) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    circle.setAttribute("cx", point.x.toString());
    circle.setAttribute("cy", point.y.toString());
    circle.setAttribute("r", "3");
    circle.setAttribute("fill", "#34d399");
    title.textContent = `${chronologicalResults[index]?.responseTimeMs ?? 0} ms`;
    circle.append(title);
    responseChartPoints.append(circle);
  }
}

function renderHistory(results: SiteCheckResult[]): void {
  historyList.replaceChildren();
  const latestResult = results[0];

  if (results.length === 0) {
    historyMessage.textContent = "保存された診断結果はまだありません。";
    historyMessage.classList.remove("text-red-700");
    historyMessage.classList.add("text-slate-600");
    return;
  }

  renderSiteCheck(latestResult);

  historyMessage.textContent = `最新${results.length}件を表示しています。`;
  historyMessage.classList.remove("text-red-700");
  historyMessage.classList.add("text-slate-600");

  for (const result of results) {
    const isHealthy = isHealthySiteCheck(result);
    const item = document.createElement("article");
    item.className =
      "flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between";

    const summary = document.createElement("div");
    summary.className = "min-w-0";
    const url = document.createElement("p");
    url.className = "break-all font-semibold text-slate-950";
    url.textContent = result.url;

    const details = document.createElement("p");
    details.className = "mt-1 text-sm text-slate-600";
    const ssl = result.sslCertificate
      ? `SSL ${result.sslCertificate.daysRemaining}日`
      : "SSL 対象外";
    details.textContent = `HTTP ${result.status} ${result.statusText} · ${result.responseTimeMs} ms · ${ssl}`;
    summary.append(url, details);

    const metadata = document.createElement("div");
    metadata.className = "flex shrink-0 items-center gap-3";
    const status = document.createElement("span");
    status.className = isHealthy
      ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
      : "rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700";
    status.textContent = isHealthy ? "正常" : "要確認";

    const checkedAt = document.createElement("time");
    checkedAt.className = "text-xs text-slate-500";
    checkedAt.dateTime = result.checkedAt;
    checkedAt.textContent = new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(result.checkedAt));
    metadata.append(status, checkedAt);
    item.append(summary, metadata);
    historyList.append(item);
  }
}

async function refreshHistory(chartUrl?: string): Promise<void> {
  let results: SiteCheckResult[];

  try {
    results = await requestSiteCheckHistory();
    renderHistory(results);
  } catch (error) {
    renderResponseTimeTrend([]);
    historyMessage.textContent =
      error instanceof Error ? error.message : "診断履歴を取得できませんでした。";
    historyMessage.classList.remove("text-slate-600");
    historyMessage.classList.add("text-red-700");
    return;
  }

  const targetUrl = chartUrl ?? results[0]?.url;

  if (targetUrl === undefined) {
    renderResponseTimeTrend([]);
    return;
  }

  try {
    renderResponseTimeTrend(await requestSiteCheckHistory(targetUrl));
  } catch {
    renderResponseTimeTrend([]);
    responseChartRange.textContent = "読み込み失敗";
    responseChart.setAttribute("aria-label", "応答時間の履歴を読み込めませんでした");
  }
}

urlForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const result = validateTargetUrl(urlInput.value);

  if (!result.valid) {
    urlInput.setAttribute("aria-invalid", "true");
    setFormMessage(result.message, "text-red-700");
    urlInput.focus();
    return;
  }

  urlInput.removeAttribute("aria-invalid");
  setLoading(true);
  setFormMessage("サイトを確認しています。", "text-slate-600");

  try {
    const siteCheck = await requestSiteCheck(result.url.href);
    renderSiteCheck(siteCheck);
    setFormMessage(
      "HTTPステータス、応答時間、SSL証明書の期限を取得し、診断結果を保存しました。稼働率は完成イメージです。",
      "text-emerald-700",
    );
    await refreshHistory(siteCheck.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "サイトの確認に失敗しました。";
    setFormMessage(message, "text-red-700");
  } finally {
    setLoading(false);
  }
});

urlInput.addEventListener("input", () => {
  urlInput.removeAttribute("aria-invalid");
  setFormMessage(defaultMessage, "text-slate-600");
});

void refreshHistory();
