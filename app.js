/* ============================================================
   BAKU EXCHANGE — app logic
   - live dream-price simulation
   - candlestick + volume + fear/greed + indices
   - real-world "interest" pulled from Wikipedia pageviews
   ============================================================ */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);

  // ---- config ----
  const CUR = "BAKU";
  const TICK_MS = 1600;            // simulation heartbeat
  const N_CANDLES = 42;
  const TICKS_PER_CANDLE = 7;
  const MEAN_REVERT = 0.018;       // pull toward fair value
  const PALETTE = {
    up: getCSS("--jade"), down: getCSS("--blood"),
    gold: getCSS("--gold"), bone: getCSS("--bone"),
    boneFaint: getCSS("--bone-faint"), neutral: getCSS("--neutral"),
  };
  function getCSS(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  // ---- randomness ----
  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ---- state ----
  const state = DREAMS.map((d) => {
    const base = 38 + d.seed * 4.2;
    const s = {
      ...d,
      interest: d.seed,
      fair: base,
      price: base,
      open: base,
      candles: [],
      vols: [],
      tickCount: 0,
    };
    seedHistory(s);
    return s;
  });

  function seedHistory(s) {
    let p = s.fair * (0.85 + Math.random() * 0.25);
    for (let i = 0; i < N_CANDLES; i++) {
      const o = p;
      let hi = o, lo = o, c = o;
      for (let k = 0; k < TICKS_PER_CANDLE; k++) {
        c += c * s.volatility * 0.012 * gauss() + (s.fair - c) * MEAN_REVERT;
        hi = Math.max(hi, c); lo = Math.min(lo, c);
      }
      s.candles.push({ o, h: hi, l: lo, c });
      s.vols.push(200 + Math.abs(gauss()) * 900 * s.volatility);
      p = c;
    }
    s.price = s.candles[s.candles.length - 1].c;
    s.open = s.candles[0].o;
  }

  // ---- Wikipedia interest (real-world attention) ----
  async function loadInterest() {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 864e5);
    const f = (d) =>
      `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    const base = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user";

    const results = await Promise.allSettled(
      state.map(async (s) => {
        const url = `${base}/${encodeURIComponent(s.wiki)}/daily/${f(start)}/${f(end)}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(s.wiki + " " + r.status);
        const j = await r.json();
        const views = (j.items || []).map((i) => i.views);
        if (!views.length) throw new Error("no data");
        return { s, avg: views.reduce((a, b) => a + b, 0) / views.length };
      })
    );

    const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    if (ok.length >= 2) {
      const logs = ok.map((o) => Math.log(o.avg + 1));
      const lo = Math.min(...logs), hi = Math.max(...logs);
      ok.forEach((o) => {
        const t = hi > lo ? (Math.log(o.avg + 1) - lo) / (hi - lo) : 0.5;
        o.s.interest = Math.round(15 + t * 80);          // 15..95
        o.s.fair = 38 + o.s.interest * 4.2;              // reprice the magnet
        o.s.realViews = Math.round(o.avg);
      });
      setStatus(true, `LIVE · Wikipedia 関心連動 (${ok.length}/${state.length})`);
    } else {
      setStatus(false, "SIMULATED · オフライン（模擬データ）");
    }
    renderList();
  }

  function setStatus(live, text) {
    $("#dataStatus").textContent = text;
    $("#dataDot").classList.toggle("live", !!live);
  }

  // ---- formatting ----
  const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pctTxt = (n) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
  const dayChange = (s) => ((s.price - s.open) / s.open) * 100;
  const cls = (n) => (n >= 0 ? "up" : "down");

  // ---- selection ----
  let selected = state.find((s) => s.ticker === "NUKE") || state[0];

  // ============================================================
  //  RENDER
  // ============================================================
  function renderList() {
    const el = $("#marketList");
    el.innerHTML = "";
    state.forEach((s) => {
      const ch = dayChange(s);
      const row = document.createElement("div");
      row.className = "row" + (s === selected ? " active" : "");
      row.innerHTML = `
        <div>
          <div class="tk">${s.ticker}</div>
          <div class="nm">${s.nameJp} ・ ${s.nameEn}</div>
        </div>
        <canvas class="spark" width="64" height="26"></canvas>
        <div>
          <div class="pr">${fmt(s.price)}</div>
          <div class="ch ${cls(ch)}">${pctTxt(ch)}</div>
        </div>`;
      row.addEventListener("click", () => { selected = s; renderList(); renderDetail(); });
      el.appendChild(row);
      drawSpark(row.querySelector(".spark"), s.candles.map((c) => c.c), ch >= 0 ? PALETTE.up : PALETTE.down);
    });
  }

  function renderTicker() {
    const idx = computeIndices();
    const lead = [
      tickItem("DREAM INDEX 夢幻", idx.all.val, idx.all.chg),
      tickItem("NIGHTMARE 悪夢", idx.nightmare.val, idx.nightmare.chg),
      tickItem("HOPE 希望", idx.hope.val, idx.hope.chg),
    ].join("");
    const items = state.map((s) => {
      const ch = dayChange(s);
      return `<span class="ticker-item"><b>${s.ticker}</b> ${fmt(s.price)} <span class="${cls(ch)}">${pctTxt(ch)}</span></span>`;
    }).join("");
    const block = lead + items;
    $("#tickerTrack").innerHTML = block + block; // duplicate for seamless loop
  }
  function tickItem(label, val, chg) {
    return `<span class="ticker-item"><b>${label}</b> ${val.toFixed(1)} <span class="${cls(chg)}">${pctTxt(chg)}</span></span>`;
  }

  function renderDetail() {
    const s = selected;
    const ch = dayChange(s);
    const last = s.candles[s.candles.length - 1];
    const recs = state.filter((d) => d !== s && d.category === s.category).slice(0, 3);
    const recPool = recs.length ? recs : state.filter((d) => d !== s).slice(0, 3);

    $("#detail").innerHTML = `
      <div class="detail-head">
        <div class="names">
          <h2>${s.nameJp}</h2>
          <div class="jp">${s.nameEn}</div>
          <div class="tk">${s.ticker} ・ ${categoryLabel(s.category)}</div>
        </div>
        <div class="pricebox">
          <div class="big">${fmt(s.price)} <span style="font-size:.5em;color:var(--gold)">${CUR}</span></div>
          <div class="chg ${cls(ch)}">${pctTxt(ch)} <span style="color:var(--bone-faint)">本日 / today</span></div>
        </div>
      </div>

      <div class="seller">手放した人 / let go by：<span>${s.seller}</span></div>
      <div class="desc">${s.descJp}<span class="en">${s.descEn}</span></div>
      <div class="aggregate">この銘柄は、同じ夢を見る無数の人々の総和。夢それ自体が、ひとつの指数だ。<span>An index in itself — the sum of everyone who dreams it.</span></div>

      <div class="charts">
        <div class="chart-label">Price ・ 蝋燭足 (candles)</div>
        <canvas id="candleChart"></canvas>
        <div class="chart-label">Volume ・ 出来高</div>
        <canvas id="volChart"></canvas>
      </div>

      <div class="stats">
        <div class="stat"><div class="k">Open 始値</div><div class="v">${fmt(last.o)}</div></div>
        <div class="stat"><div class="k">High 高値</div><div class="v">${fmt(last.h)}</div></div>
        <div class="stat"><div class="k">Low 安値</div><div class="v">${fmt(last.l)}</div></div>
        <div class="stat"><div class="k">Dreamers 見ている人</div><div class="v">${dreamersTxt(s)}</div></div>
        <div class="stat"><div class="k">Interest 関心指数</div><div class="v">${s.interest} / 100</div></div>
      </div>

      <div class="actions">
        <button class="act buy" id="buyBtn">今すぐ買う ・ Buy now</button>
        <button class="act sell" id="sellBtn">夢を手放す ・ Let go</button>
      </div>

      <div class="recommend">
        <div class="rec-title">この悪夢を見た人は、こんな夢も買っています<br/>People who dreamed this also bought</div>
        <div class="rec-list">
          ${recPool.map((d) => `<div class="rec-chip" data-tk="${d.ticker}">${d.ticker} ・ ${d.nameJp}</div>`).join("")}
        </div>
      </div>`;

    drawCandles($("#candleChart"), s.candles);
    drawVolume($("#volChart"), s.vols, s.candles);

    $("#buyBtn").addEventListener("click", () =>
      toast(`「${s.nameJp}」の保有を申請しました。<br/>決済には ${CUR} が必要です。あなたの夢を担保に入れますか？`));
    $("#sellBtn").addEventListener("click", () =>
      toast(`「${s.nameJp}」を市場へ放流しました。<br/>その夢は、もうあなたのものではありません。`));
    $("#detail").querySelectorAll(".rec-chip").forEach((chip) =>
      chip.addEventListener("click", () => {
        selected = state.find((d) => d.ticker === chip.dataset.tk);
        renderList(); renderDetail();
        $(".detail-inner").scrollTop = 0;
      }));
  }

  function dreamersTxt(s) {
    const n = s.realViews ? s.realViews : Math.round(s.interest * 200 + 300);
    return `≈ ${n.toLocaleString()} 人/日`;
  }

  function categoryLabel(c) {
    return { nightmare: "悪夢 / Nightmare", hope: "希望 / Hope", ideology: "思想 / Ideology" }[c] || c;
  }

  // ============================================================
  //  CANVAS DRAWING
  // ============================================================
  function sizeCanvas(cv, cssH) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = cv.clientWidth || cv.parentElement.clientWidth || 600;
    cv.style.height = cssH + "px";
    cv.width = cssW * dpr;
    cv.height = cssH * dpr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: cssW, h: cssH };
  }

  function drawSpark(cv, data, color) {
    const dpr = window.devicePixelRatio || 1;
    cv.width = 64 * dpr; cv.height = 26 * dpr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = 64, h = 26, min = Math.min(...data), max = Math.max(...data), r = max - min || 1;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - 3 - ((v - min) / r) * (h - 6);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.85; ctx.stroke();
  }

  function drawCandles(cv, candles) {
    const { ctx, w, h } = sizeCanvas(cv, 230);
    ctx.clearRect(0, 0, w, h);
    const pad = 8, plotH = h - pad * 2;
    const all = candles.flatMap((c) => [c.h, c.l]);
    const min = Math.min(...all), max = Math.max(...all), r = max - min || 1;
    const Y = (v) => pad + plotH - ((v - min) / r) * plotH;

    // faint grid
    ctx.strokeStyle = "rgba(190,175,150,0.07)"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad + (plotH / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    const n = candles.length, slot = w / n, cw = Math.max(2, slot * 0.6);
    candles.forEach((c, i) => {
      const x = i * slot + slot / 2;
      const up = c.c >= c.o;
      const col = up ? PALETTE.up : PALETTE.down;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.globalAlpha = 0.92;
      ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.lineWidth = 1; ctx.stroke();
      const yo = Y(c.o), yc = Y(c.c);
      const top = Math.min(yo, yc), bh = Math.max(1, Math.abs(yc - yo));
      up ? ctx.fillRect(x - cw / 2, top, cw, bh) : ctx.fillRect(x - cw / 2, top, cw, bh);
    });
    ctx.globalAlpha = 1;
    // last price line
    const lastY = Y(candles[n - 1].c);
    ctx.strokeStyle = "rgba(201,169,106,0.4)"; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, lastY); ctx.lineTo(w, lastY); ctx.stroke(); ctx.setLineDash([]);
  }

  function drawVolume(cv, vols, candles) {
    const { ctx, w, h } = sizeCanvas(cv, 60);
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(...vols) || 1;
    const n = vols.length, slot = w / n, bw = Math.max(2, slot * 0.6);
    vols.forEach((v, i) => {
      const bh = (v / max) * (h - 6);
      const up = candles[i].c >= candles[i].o;
      ctx.fillStyle = up ? PALETTE.up : PALETTE.down; ctx.globalAlpha = 0.35;
      ctx.fillRect(i * slot + slot / 2 - bw / 2, h - bh, bw, bh);
    });
    ctx.globalAlpha = 1;
  }

  function drawGauge(value) {
    const cv = $("#fearGreed");
    const dpr = window.devicePixelRatio || 1;
    const w = 120, h = 64;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h - 6, R = 46;
    // zones
    const zones = [
      [0, 0.25, PALETTE.down],
      [0.25, 0.45, "#9a7d63"],
      [0.45, 0.55, PALETTE.neutral],
      [0.55, 0.75, "#7f9a78"],
      [0.75, 1, PALETTE.up],
    ];
    ctx.lineWidth = 7; ctx.globalAlpha = 0.55;
    zones.forEach(([a, b, col]) => {
      ctx.beginPath();
      ctx.strokeStyle = col;
      ctx.arc(cx, cy, R, Math.PI + a * Math.PI, Math.PI + b * Math.PI);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    // needle
    const ang = Math.PI + (value / 100) * Math.PI;
    ctx.strokeStyle = PALETTE.bone; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * (R - 4), cy + Math.sin(ang) * (R - 4)); ctx.stroke();
    ctx.fillStyle = PALETTE.bone; ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, 7); ctx.fill();
    // value
    ctx.fillStyle = PALETTE.bone; ctx.font = "600 16px SF Mono, Menlo, monospace";
    ctx.textAlign = "center"; ctx.fillText(Math.round(value), cx, cy - 14);
    // label text under canvas
    $("#fearGreedLabel").textContent = fgLabel(value);
  }
  function fgLabel(v) {
    if (v < 25) return "Extreme Fear 極度の恐怖";
    if (v < 45) return "Fear 恐怖";
    if (v < 55) return "Neutral 中立";
    if (v < 75) return "Greed 強欲";
    return "Extreme Greed 極度の強欲";
  }

  // ============================================================
  //  INDICES + FEAR/GREED
  // ============================================================
  let idxBase = null;
  function computeIndices() {
    const calc = (arr) => {
      const wsum = arr.reduce((a, s) => a + s.interest, 0) || 1;
      const cur = arr.reduce((a, s) => a + s.price * s.interest, 0) / wsum;
      const opn = arr.reduce((a, s) => a + s.open * s.interest, 0) / wsum;
      return { cur, opn };
    };
    if (!idxBase) {
      idxBase = {
        all: calc(state).cur / 1000,
        nightmare: calc(state.filter((s) => s.category === "nightmare")).cur / 1000,
        hope: calc(state.filter((s) => s.category === "hope")).cur / 1000,
      };
    }
    const mk = (arr, baseKey) => {
      const c = calc(arr);
      return { val: c.cur / idxBase[baseKey], chg: ((c.cur - c.opn) / c.opn) * 100 };
    };
    return {
      all: mk(state, "all"),
      nightmare: mk(state.filter((s) => s.category === "nightmare"), "nightmare"),
      hope: mk(state.filter((s) => s.category === "hope"), "hope"),
    };
  }

  let fearGreed = 50;
  function updateFearGreed() {
    const avg = state.reduce((a, s) => a + dayChange(s), 0) / state.length;
    const target = Math.max(0, Math.min(100, 50 + avg * 6));
    fearGreed += (target - fearGreed) * 0.08;
    drawGauge(fearGreed);
  }

  // ---- apocalypse: the shared premonition of the end ----
  let doom = 0.16;          // 0..1 collective sense of doom, creeps upward
  let crashCooldown = 0;
  function updateDoom() {
    const pct = Math.round(doom * 100);
    const col = doom < 0.4 ? "var(--bone)" : doom < 0.7 ? "var(--gold)" : "var(--blood)";
    $("#doomMeter").innerHTML = `<span style="color:${col}">${pct}%</span>`;
  }
  function triggerCrash() {
    state.forEach((s) => {
      s.price *= 0.42 + Math.random() * 0.26;       // the dream bubble bursts
      const last = s.candles[s.candles.length - 1];
      last.c = s.price; last.l = Math.min(last.l, s.price);
      s.vols[s.vols.length - 1] += 1200 * s.volatility;
    });
    doom = 0.08;            // after the end, the premonition resets — rebirth
    fearGreed = 5;
    crashCooldown = 30;
    pushNews("💥 市場崩壊 — 夢のバブルが弾けた。COLLAPSE. やがて、また新しい夢が芽吹く。");
    toast("— THE MARKET HAS ENDED —<br/>夢市場は崩壊した。<br/>けれど、終わりのあとにも、また夢は始まる。");
  }
  function pushNews(text) {
    const feed = $("#tradeFeed");
    const div = document.createElement("div");
    div.className = "trade news";
    div.textContent = text;
    feed.insertBefore(div, feed.firstChild);
  }

  // ============================================================
  //  SIMULATION TICK
  // ============================================================
  function step() {
    // the premonition of the end slowly rises, then breaks
    doom = Math.min(0.99, doom + 0.0007 + Math.random() * 0.0006);
    if (crashCooldown > 0) crashCooldown--;
    else if (doom > 0.97 || Math.random() < Math.max(0, doom - 0.8) * 0.05) triggerCrash();

    const mood = gauss() * 0.004; // shared market drift
    state.forEach((s) => {
      let p = s.price;
      // doom seeps into prices: nightmares rise, hopes sink
      const bias = s.category === "nightmare" ? p * doom * 0.0024
                 : s.category === "hope" ? -p * doom * 0.0016 : 0;
      p += p * s.volatility * 0.011 * gauss() + (s.fair - p) * MEAN_REVERT + p * mood + bias;
      p = Math.max(1, p);
      s.price = p;
      const last = s.candles[s.candles.length - 1];
      last.c = p; last.h = Math.max(last.h, p); last.l = Math.min(last.l, p);
      s.vols[s.vols.length - 1] += Math.abs(gauss()) * 60 * s.volatility;
      s.tickCount++;
      if (s.tickCount % TICKS_PER_CANDLE === 0) {
        s.candles.push({ o: p, h: p, l: p, c: p });
        s.candles.shift();
        s.vols.push(150 + Math.abs(gauss()) * 700 * s.volatility);
        s.vols.shift();
      }
    });
    maybeTrade();
    renderList();
    renderTicker();
    renderDetail();
    updateFearGreed();
    updateMainIndex();
    updateDoom();
  }

  function updateMainIndex() {
    const idx = computeIndices().all;
    $("#dreamIndex").innerHTML = `${idx.val.toFixed(2)} <span class="${cls(idx.chg)}" style="font-size:.6em">${pctTxt(idx.chg)}</span>`;
  }

  // ---- trade tape ----
  const BUYERS = ["匿名の投資家", "夢中毒者", "終末論者", "美術館", "退屈した億万長者",
    "眠れない子ども", "アルゴリズム取引bot", "コレクター", "未来からの旅行者", "占い師"];
  function maybeTrade() {
    const feed = $("#tradeFeed");
    const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const s = state[Math.floor(Math.random() * state.length)];
      const buy = Math.random() > 0.5;
      const who = BUYERS[Math.floor(Math.random() * BUYERS.length)];
      const qty = (Math.random() * 12 + 0.1).toFixed(2);
      const div = document.createElement("div");
      div.className = "trade";
      div.innerHTML = `<span class="who">${who}</span> が
        <b>${s.ticker}</b> を ${qty}口
        <span class="act-b">${fmt(s.price)} ${CUR}</span> で
        <span class="${buy ? "up" : "down"}">${buy ? "購入 BUY" : "売却 SELL"}</span>`;
      feed.insertBefore(div, feed.firstChild);
    }
    while (feed.children.length > 28) feed.removeChild(feed.lastChild);
  }

  // ---- toast ----
  let toastT = null;
  function toast(html) {
    const t = $("#toast");
    t.innerHTML = html; t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), 4200);
  }

  // ============================================================
  //  BOOT
  // ============================================================
  function enter() {
    const tc = $("#titlecard");
    tc.classList.add("hide");
    setTimeout(() => (tc.style.display = "none"), 1700);
  }
  $("#titlecard").addEventListener("click", enter);

  renderList();
  renderTicker();
  renderDetail();
  updateFearGreed();
  updateMainIndex();
  updateDoom();
  setStatus(false, "connecting… 接続中");
  loadInterest();
  setInterval(step, TICK_MS);
  window.addEventListener("resize", () => { renderDetail(); drawGauge(fearGreed); });

  // auto-dismiss title card after a while even without tap (kiosk safety)
  setTimeout(() => { if ($("#titlecard").style.display !== "none") enter(); }, 9000);
})();
