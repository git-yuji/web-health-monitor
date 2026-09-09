import "./style.css";

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("#app が見つかりません。");
}

app.innerHTML = `
  <section class="w-full max-w-[720px]">
    <p class="mb-5 text-xs font-extrabold tracking-[0.16em] text-[#16794a]">
      WEB HEALTH MONITOR
    </p>
    <h1 class="m-0 max-w-[640px] text-[clamp(2.5rem,8vw,5.5rem)] font-bold leading-[1.05] tracking-[-0.06em]">
      Webサイトの健康状態を、ひと目で。
    </h1>
    <p class="my-7 max-w-[560px] text-[1.1rem] leading-[1.9] text-[#526057]">
      稼働状態、応答速度、SSL証明書などを定期的に確認するためのツールです。
    </p>
    <div class="inline-block rounded-xl border border-[#c8d5cb] bg-white px-[18px] py-[14px] shadow-[0_12px_36px_rgb(34_72_49_/_8%)]">
      現在、最初の診断機能を準備中です。
    </div>
  </section>
`;
