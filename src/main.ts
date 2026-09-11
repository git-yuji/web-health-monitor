import "./style.css";

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

          <div class="mt-9 max-w-xl rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/8 transition focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10">
            <div class="flex flex-col gap-2 sm:flex-row">
              <label class="sr-only" for="target-url">確認するURL</label>
              <div class="flex min-w-0 flex-1 items-center gap-3 px-3">
                <svg viewBox="0 0 24 24" class="size-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
                </svg>
                <input id="target-url" type="url" placeholder="https://example.com" class="min-w-0 flex-1 bg-transparent py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400" />
              </div>
              <button type="button" class="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
                サイトを確認
              </button>
            </div>
          </div>
          <p class="mt-3 text-xs text-slate-600">診断機能は現在開発中です。画面は完成イメージです。</p>
        </div>

        <div class="relative mx-auto min-w-0 w-full max-w-lg">
          <div class="absolute -inset-5 rounded-[2rem] bg-emerald-100/60 blur-2xl"></div>
          <div class="relative min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 p-5 shadow-2xl shadow-slate-950/20 sm:p-7">
            <div class="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p class="text-xs font-medium text-slate-400">MONITORED SITE</p>
                <p class="mt-2 font-semibold text-white">yuyu-web.com</p>
              </div>
              <span class="flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
                <span class="size-2 rounded-full bg-emerald-400"></span>
                正常稼働
              </span>
            </div>

            <div class="grid grid-cols-1 gap-3 py-5 sm:grid-cols-2">
              <div class="rounded-2xl bg-white/6 p-4 ring-1 ring-inset ring-white/8">
                <p class="text-xs text-slate-400">HTTP STATUS</p>
                <p class="mt-2 text-2xl font-semibold text-white">200 <span class="text-sm font-normal text-slate-400">OK</span></p>
              </div>
              <div class="rounded-2xl bg-white/6 p-4 ring-1 ring-inset ring-white/8">
                <p class="text-xs text-slate-400">RESPONSE</p>
                <p class="mt-2 text-2xl font-semibold text-white">184 <span class="text-sm font-normal text-slate-400">ms</span></p>
              </div>
              <div class="rounded-2xl bg-white/6 p-4 ring-1 ring-inset ring-white/8">
                <p class="text-xs text-slate-400">SSL EXPIRES</p>
                <p class="mt-2 text-2xl font-semibold text-white">72 <span class="text-sm font-normal text-slate-400">日</span></p>
              </div>
              <div class="rounded-2xl bg-white/6 p-4 ring-1 ring-inset ring-white/8">
                <p class="text-xs text-slate-400">UPTIME</p>
                <p class="mt-2 text-2xl font-semibold text-white">99.98<span class="text-sm font-normal text-slate-400">%</span></p>
              </div>
            </div>

            <div class="rounded-2xl bg-white/6 p-4 ring-1 ring-inset ring-white/8">
              <div class="mb-4 flex items-center justify-between">
                <p class="text-xs font-medium text-slate-300">応答時間</p>
                <p class="text-xs text-slate-500">過去24時間</p>
              </div>
              <svg viewBox="0 0 400 80" class="block h-20 min-w-0 w-full max-w-full" preserveAspectRatio="none" aria-label="応答時間のサンプルグラフ">
                <defs>
                  <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#34d399" stop-opacity="0.35" />
                    <stop offset="100%" stop-color="#34d399" stop-opacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0 61 C30 57,45 66,70 51 S115 45,140 48 S185 28,210 38 S250 42,275 25 S320 34,345 18 S380 21,400 12 V80 H0Z" fill="url(#chart-fill)" />
                <path d="M0 61 C30 57,45 66,70 51 S115 45,140 48 S185 28,210 38 S250 42,275 25 S320 34,345 18 S380 21,400 12" fill="none" stroke="#34d399" stroke-width="3" stroke-linecap="round" />
              </svg>
            </div>
          </div>
        </div>
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
