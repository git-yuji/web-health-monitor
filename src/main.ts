import "./style.css";

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("#app が見つかりません。");
}

app.innerHTML = `
  <section class="hero">
    <p class="eyebrow">WEB HEALTH MONITOR</p>
    <h1>Webサイトの健康状態を、ひと目で。</h1>
    <p class="lead">
      稼働状態、応答速度、SSL証明書などを定期的に確認するためのツールです。
    </p>
    <div class="notice">現在、最初の診断機能を準備中です。</div>
  </section>
`;

