/* ============================================================
   BAKU EXCHANGE — app logic
   - long price history since 1900 (synthetic for now; to be
     replaced by Google Books Ngram for real historical shape)
   - zoomable time axis (100Y/10Y/5Y/1Y), touch crosshair
   - dream-orb: video / image / gradient, liquid + chromatic
     aberration, crystal-ball shading, poke-to-warp
   - Wikipedia pageviews drive each dream's fair value
   - apocalypse meter: a premonition that rises, breaks, reborns
   ============================================================ */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);

  const CUR = "BAKU";
  const TICK_MS = 1600;
  const MEAN_REVERT = 0.018;
  const TAPE_N = 48;

  // ---- time frame (monthly, 1900 → now) ----
  const START_YEAR = 1900;
  const _now = new Date();
  const TOTAL_MONTHS = (_now.getFullYear() - START_YEAR) * 12 + _now.getMonth() + 1;
  const monthYear = (m) => START_YEAR + Math.floor(m / 12);
  function monthLabel(m, short) {
    const y = START_YEAR + Math.floor(m / 12);
    return short ? `${y}/${String((m % 12) + 1).padStart(2, "0")}` : String(y);
  }

  const ZOOMS = [{ k: "100Y", m: 1200 }, { k: "10Y", m: 120 }, { k: "5Y", m: 60 }, { k: "1Y", m: 12 }];
  let zoomMonths = 1200;

  const C = {
    up: "#f3f1ec", down: "rgba(243,241,236,0.45)", wick: "rgba(243,241,236,0.7)",
    grid: "rgba(243,241,236,0.06)", vol: "rgba(243,241,236,0.16)", last: "rgba(243,241,236,0.30)",
    axis: "rgba(243,241,236,0.40)",
  };

  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ---- state ----
  const state = DREAMS.map((d, i) => {
    const base = 38 + d.seed * 4.2;
    const s = { ...d, idx: i, interest: d.seed, fair: base, price: base, open: base,
      closes: new Float64Array(TOTAL_MONTHS), tape: [] };
    seedSeries(s);
    return s;
  });
  const byTicker = new Map(state.map((s) => [s.ticker, s]));

  function seedSeries(s) {
    let p = s.fair * (0.45 + Math.random() * 0.3);
    for (let m = 0; m < TOTAL_MONTHS; m++) {
      p += p * s.volatility * 0.018 * gauss() + (s.fair - p) * 0.02;   // 合成履歴は安定（根拠のない過去の乱高下を抑える）
      p = Math.max(1, p); s.closes[m] = p;
    }
    s.price = s.closes[TOTAL_MONTHS - 1]; s.open = s.price;
    s.tape = Array.from(s.closes.slice(-TAPE_N));
  }

  // ---- formatting ----
  const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const arrow = (n) => (n >= 0 ? "▲" : "▼");
  const pctTxt = (n) => `${arrow(n)} ${Math.abs(n).toFixed(2)}%`;
  const dayChange = (s) => ((s.price - s.open) / s.open) * 100;
  const cls = (n) => (n >= 0 ? "up" : "down");
  function categoryLabel(c) { return { nightmare: "Nightmare 悪夢", hope: "Hope 希望", ideology: "Ideology 思想", oneiric: "Oneiric 個人の夢", mundane: "Personal 俗な願い" }[c] || c; }
  function dreamersN(s) { return s.realViews ? s.realViews : Math.round(s.interest * 200 + 300); }
  function dreamersTxt(s) { return `≈ ${dreamersN(s).toLocaleString()}/day`; }
  const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(Math.round(n)));
  function catShort(c) { return { nightmare: "Nightmare", hope: "Hope", ideology: "Idea", oneiric: "Dream", mundane: "Desire" }[c] || c; }
  function volN(s, ch) { return Math.round((Math.abs(ch) + 0.5) * (s.realViews ? s.realViews / 40 : s.interest * 4)); }
  function baseGradient(cat) {
    if (cat === "nightmare") return "radial-gradient(circle at 38% 30%, #8a2d20, #220b08 74%)";
    if (cat === "hope") return "radial-gradient(circle at 38% 30%, #1f5a78, #07151f 74%)";
    if (cat === "oneiric") return "radial-gradient(circle at 38% 30%, #5b3f7a, #140b22 74%)";
    return "radial-gradient(circle at 38% 30%, #7a5a1f, #1f1708 74%)";
  }

  const WISH_OVERRIDE = {
    NOWAR: 97, PEACE: 96, DISARM: 93, NOHGR: 93, CURE: 92, NOPOV: 90, SUST: 90, STOPGW: 88,
    EDU: 88, HLTH: 90, NODISC: 86, GEQ: 86, CLEAN: 84, FAIR: 82, CALM: 82,
    NUKE: 5, FASC: 5, ENDDEM: 6, EXTN: 8, ARMAG: 7, PANDM: 8, ROBOT: 14, ALIEN: 12,
    ASTER: 9, CRSH: 12, AIBC: 18, OIL: 14, QUAKE: 8, JPSK: 10, FOOD: 9, SURV: 16, LEAK: 8,
    AIJOB: 12, BLKOUT: 10, JUDG: 10,
  };
  function deriveWish(s) {
    if (WISH_OVERRIDE[s.ticker] != null) return WISH_OVERRIDE[s.ticker];
    return { hope: 78, ideology: 62, oneiric: 42, nightmare: 16, mundane: 80 }[s.category] || 50;
  }

  let selected = byTicker.get("NUKE") || state[0];
  let hoverIndex = null;
  let curCandles = [];

  // ============================================================
  //  LIST
  // ============================================================
  const rowRefs = new Map();
  let sortMode = "mix";
  function orderedForDisplay() {
    const arr = state.slice();
    if (sortMode === "popular") return arr.sort((a, b) => (b.realViews || b.interest * 200) - (a.realViews || a.interest * 200));
    if (sortMode === "fear") return arr.sort((a, b) => deriveWish(a) - deriveWish(b));      // 最も恐れられる（願われない）順
    if (sortMode === "price") return arr.sort((a, b) => b.price - a.price);
    if (sortMode === "trend") return arr.sort((a, b) => dayChange(b) - dayChange(a));
    // mix: カテゴリを交互に混ぜて政治的な銘柄が上に固まらないように
    const groups = {};
    state.forEach((s) => { (groups[s.category] = groups[s.category] || []).push(s); });
    const cats = ["nightmare", "mundane", "hope", "ideology", "oneiric"].filter((c) => groups[c]);
    const out = [];
    for (let i = 0; out.length < state.length; i++) cats.forEach((c) => { if (groups[c][i]) out.push(groups[c][i]); });
    return out;
  }
  function setupSort() {
    document.querySelectorAll("#sortBar .sort-btn").forEach((b) => b.addEventListener("click", () => {
      sortMode = b.dataset.sort;
      document.querySelectorAll("#sortBar .sort-btn").forEach((x) => x.classList.toggle("on", x.dataset.sort === sortMode));
      buildList();
    }));
  }
  function buildList() {
    const el = $("#marketList"); el.innerHTML = "";
    orderedForDisplay().forEach((s) => {
      const row = document.createElement("div");
      row.className = "row" + (s === selected ? " active" : "");
      row.innerHTML = `
        <div class="row-id">
          <div class="tk">${s.ticker}</div>
          <div class="nm">${s.nameJp} · ${s.nameEn}</div>
          <div class="meta">${catShort(s.category)} ・ ◉ <span class="num">${fmtK(dreamersN(s))}</span> ・ ♡ <span class="num">${deriveWish(s)}</span> ・ V <span class="num mvol"></span></div>
        </div>
        <canvas class="spark" width="48" height="22"></canvas>
        <div class="row-num"><div class="pr num"></div><div class="ch num"></div></div>`;
      row.addEventListener("click", () => selectDream(s));
      el.appendChild(row);
      rowRefs.set(s.ticker, { row, pr: row.querySelector(".pr"), ch: row.querySelector(".ch"), spark: row.querySelector(".spark"), vol: row.querySelector(".mvol") });
    });
    updateList();
  }
  function updateList() {
    state.forEach((s) => {
      const r = rowRefs.get(s.ticker); if (!r) return;
      const ch = dayChange(s);
      r.pr.textContent = fmt(s.price);
      r.ch.textContent = pctTxt(ch); r.ch.className = "ch num " + cls(ch);
      if (r.vol) r.vol.textContent = fmtK(volN(s, ch));
      drawSpark(r.spark, s.tape, ch >= 0 ? C.up : C.down);
    });
  }

  // ============================================================
  //  TICKER
  // ============================================================
  const tickerRefs = [];
  function buildTicker() {
    const track = $("#tickerTrack"); track.innerHTML = "";
    const make = () => {
      const frag = document.createDocumentFragment();
      [["Dream 夢幻", "all"], ["Nightmare 悪夢", "nightmare"], ["Hope 希望", "hope"]].forEach(([label, key]) => {
        const span = document.createElement("span"); span.className = "ticker-item";
        span.innerHTML = `<b>${label}</b> <span class="num v"></span> <span class="num c"></span>`;
        frag.appendChild(span); tickerRefs.push({ kind: "idx", key, v: span.querySelector(".v"), c: span.querySelector(".c") });
      });
      state.forEach((s) => {
        const span = document.createElement("span"); span.className = "ticker-item";
        span.innerHTML = `<b>${s.ticker}</b> <span class="num v"></span> <span class="num c"></span>`;
        frag.appendChild(span); tickerRefs.push({ kind: "dream", s, v: span.querySelector(".v"), c: span.querySelector(".c") });
      });
      return frag;
    };
    track.appendChild(make()); track.appendChild(make());
    updateTicker();
  }
  function updateTicker() {
    const idx = computeIndices();
    tickerRefs.forEach((r) => {
      if (r.kind === "idx") { const m = idx[r.key]; r.v.textContent = m.val.toFixed(1); r.c.textContent = pctTxt(m.chg); r.c.className = "num c " + cls(m.chg); }
      else { const ch = dayChange(r.s); r.v.textContent = fmt(r.s.price); r.c.textContent = pctTxt(ch); r.c.className = "num c " + cls(ch); }
    });
  }

  // ============================================================
  //  DISPLAY CANDLES (aggregate monthly closes for current zoom)
  // ============================================================
  function buildDisplayCandles(s, months) {
    const L = s.closes.length; months = Math.min(months, L);
    const startM = L - months, DISPLAY_N = 60, bucket = Math.max(1, Math.ceil(months / DISPLAY_N));
    const out = [];
    for (let b = startM; b < L; b += bucket) {
      const e = Math.min(L, b + bucket);
      let o = s.closes[b], c = s.closes[e - 1], h = -Infinity, l = Infinity;
      for (let m = b; m < e; m++) { const v = s.closes[m]; if (v > h) h = v; if (v < l) l = v; }
      out.push({ o, h, l, c, mid: Math.floor((b + e - 1) / 2) });
    }
    return out;
  }

  // ============================================================
  //  DETAIL
  // ============================================================
  let dref = null;
  let orbCanvas = null;
  function selectDream(s) {
    selected = s; hoverIndex = null;
    rowRefs.forEach((r, tk) => r.row.classList.toggle("active", tk === s.ticker));
    buildDetail(); $("#feature").scrollTop = 0;
    setPanel("view");   // スマホ: 銘柄を選んだら詳細タブへ（iPadでは無効）
  }
  // スマホのタブ切替（List ⇄ 銘柄）。CSSが max-width:560px のときだけ見た目に効く
  function setPanel(p) {
    const m = document.querySelector("main"); if (!m) return;
    m.classList.toggle("m-view", p === "view");
    m.classList.toggle("m-list", p !== "view");
    document.querySelectorAll(".mtab").forEach((b) => b.classList.toggle("on", b.dataset.panel === (p === "view" ? "view" : "list")));
  }
  function buildDetail() {
    const s = selected; hoverIndex = null;
    const recs = state.filter((d) => d !== s && d.category === s.category).slice(0, 3);
    const recPool = recs.length ? recs : state.filter((d) => d !== s).slice(0, 3);
    const zoomBtns = ZOOMS.map((z) => `<button class="zoom${z.m === zoomMonths ? " on" : ""}" data-m="${z.m}">${z.k}</button>`).join("");

    $("#feature").innerHTML = `
      <div class="feature-head">
        <h2>${s.nameEn}</h2>
        <div class="f-en">${s.nameJp}</div>
        <div class="f-tk">${s.ticker} · ${categoryLabel(s.category)}</div>
      </div>
      <div class="orb-wrap">
        <div class="orb"></div>
        <div class="price-row">
          <div class="big num" id="dBig"></div>
          <div class="chg num" id="dChg"></div>
          <div class="wish-row">願望 Wish <b id="dWish" class="num"></b><span class="wsub"> / 100</span></div>
          <div class="bar wish-bar"><i id="dWishFill"></i></div>
        </div>
      </div>
      <div class="glass">
        <div class="chart-top"><div class="chart-label">Price · 価格史 since 1900</div><div class="zooms">${zoomBtns}</div></div>
        <canvas id="candleChart"></canvas>
        <div class="chart-label">Volume · 出来高</div>
        <canvas id="volChart"></canvas>
        <div id="chartTip"></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="k">Open 始値</div><div class="v num" id="dOpen"></div></div>
        <div class="stat"><div class="k">High 高値</div><div class="v num" id="dHigh"></div></div>
        <div class="stat"><div class="k">Low 安値</div><div class="v num" id="dLow"></div></div>
        <div class="stat"><div class="k">Dreamers 見ている人</div><div class="v num">${dreamersTxt(s)}</div></div>
      </div>
      <div class="desc">${s.descJp}<span class="en">${s.descEn}</span></div>
      <div class="seller">Supplied by <span>${sellerLabel(s.seller)}</span></div>
      <div class="actions">
        <button class="act buy" id="buyBtn">今すぐ買う · Buy now</button>
        <button class="act sell" id="sellBtn">夢を手放す · Let go</button>
      </div>
      <div class="recommend">
        <div class="rec-title">この夢を見た人は、こんな夢も見ています<br/>People who dreamed this also dreamed</div>
        <div class="rec-list">${recPool.map((d) => `<div class="rec-chip" data-tk="${d.ticker}">${d.ticker} · ${d.nameJp}</div>`).join("")}</div>
      </div>`;

    // ---- orb: WebGL crystal ball (footage texture + liquid pinch) ----
    if (orbCanvas) $(".orb").appendChild(orbCanvas);
    const FB = { nightmare: [0.42, 0.12, 0.09], hope: [0.10, 0.30, 0.40], oneiric: [0.30, 0.18, 0.42], ideology: [0.42, 0.32, 0.10], mundane: [0.40, 0.16, 0.26] }[s.category] || [0.12, 0.12, 0.14];
    if (window.OrbGL && OrbGL.ok()) OrbGL.setMedia(`assets/footage/${s.ticker}.jpg?v=20260622`, `assets/footage/${s.ticker}.mp4?v=20260622`, FB, (s.idx % 17) / 17);

    const w = deriveWish(s);
    $("#dWish").textContent = w; $("#dWishFill").style.width = w + "%";

    dref = { big: $("#dBig"), chg: $("#dChg"), candle: $("#candleChart"), vol: $("#volChart"),
      open: $("#dOpen"), high: $("#dHigh"), low: $("#dLow"), tip: $("#chartTip") };

    // chart hover (touch + mouse)
    const cv = dref.candle;
    const onMove = (e) => {
      const rect = cv.getBoundingClientRect();
      const px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const n = curCandles.length; if (!n) return;
      let i = Math.floor((px / rect.width) * n); i = Math.max(0, Math.min(n - 1, i));
      hoverIndex = i;
      const c = curCandles[i];
      dref.tip.innerHTML = `${monthLabel(c.mid)}年頃 · <b>${fmt(c.c)} ${CUR}</b>`;
      dref.tip.style.opacity = 1;
      dref.tip.style.left = (cv.offsetLeft + (i + 0.5) / n * rect.width) + "px";
      dref.tip.style.top = cv.offsetTop + "px";
      drawChart(cv, curCandles, hoverIndex);
      if (e.cancelable) e.preventDefault();
    };
    const onLeave = () => { hoverIndex = null; dref.tip.style.opacity = 0; drawChart(cv, curCandles, null); };
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerdown", onMove);
    cv.addEventListener("pointerleave", onLeave);
    cv.addEventListener("pointerup", onLeave);

    $("#buyBtn").addEventListener("click", () => toast(`Order received<br/>${s.nameEn} — settled in ${CUR}.`));
    $("#sellBtn").addEventListener("click", () => toast(`Sold<br/>You have let go of ${s.nameEn}.`));
    $("#feature").querySelectorAll(".rec-chip").forEach((chip) => chip.addEventListener("click", () => selectDream(byTicker.get(chip.dataset.tk))));
    $("#feature").querySelectorAll(".zoom").forEach((b) => b.addEventListener("click", () => {
      zoomMonths = +b.dataset.m; hoverIndex = null; dref.tip.style.opacity = 0;
      $("#feature").querySelectorAll(".zoom").forEach((x) => x.classList.toggle("on", +x.dataset.m === zoomMonths));
      updateDetail();
    }));

    updateDetail();
  }
  function updateDetail() {
    if (!dref) return;
    const s = selected;
    s.closes[TOTAL_MONTHS - 1] = s.price;     // live tip
    const ch = dayChange(s);
    dref.big.innerHTML = `${fmt(s.price)}<small>${CUR}</small>`;
    dref.chg.textContent = pctTxt(ch); dref.chg.className = "chg num " + cls(ch);
    curCandles = buildDisplayCandles(s, zoomMonths);
    const last = curCandles[curCandles.length - 1];
    dref.open.textContent = fmt(last.o); dref.high.textContent = fmt(last.h); dref.low.textContent = fmt(last.l);
    drawChart(dref.candle, curCandles, hoverIndex);
    drawVol(dref.vol, curCandles);
  }

  // ============================================================
  //  CANVAS
  // ============================================================
  function sizeCanvas(cv, cssH) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = cv.clientWidth || cv.parentElement.clientWidth || 600;
    cv.style.height = cssH + "px"; cv.width = cssW * dpr; cv.height = cssH * dpr;
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: cssW, h: cssH };
  }
  function drawSpark(cv, data, color) {
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== 56 * dpr) { cv.width = 56 * dpr; cv.height = 24 * dpr; }
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = 56, h = 24; ctx.clearRect(0, 0, w, h);
    const min = Math.min(...data), max = Math.max(...data), r = max - min || 1;
    ctx.beginPath();
    data.forEach((v, i) => { const x = (i / (data.length - 1)) * w, y = h - 2 - ((v - min) / r) * (h - 4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
  }
  function drawChart(cv, dc, hi) {
    const axisH = 18, { ctx, w, h } = sizeCanvas(cv, 248), pad = 8, plotH = h - pad - axisH;
    ctx.clearRect(0, 0, w, h);
    if (!dc.length) return;
    const mode = zoomMonths === 12 ? "bars" : zoomMonths <= 120 ? "area" : "candles";  // 1Y=棒 / 5Y・10Y=山 / 100Y=ローソク足
    let min = Infinity, max = -Infinity;
    if (mode !== "candles") { dc.forEach((c) => { if (c.c > max) max = c.c; if (c.c < min) min = c.c; }); min -= (max - min) * 0.12 || 1; }
    else { dc.forEach((c) => { if (c.h > max) max = c.h; if (c.l < min) min = c.l; }); }
    const r = max - min || 1, Y = (v) => pad + plotH - ((v - min) / r) * plotH;
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = pad + (plotH / 4) * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const n = dc.length, slot = w / n, base = pad + plotH;
    if (mode === "bars") {
      const bw = Math.max(3, slot * 0.6);
      dc.forEach((c, i) => {
        const x = i * slot + slot / 2, up = i === 0 || c.c >= dc[i - 1].c, y = Y(c.c);
        ctx.fillStyle = up ? C.up : C.down; ctx.fillRect(x - bw / 2, y, bw, base - y);
      });
    } else if (mode === "area") {
      // 山型のエリアチャート（線＋淡いグラデ塗り）
      const X = (i) => (n < 2 ? w / 2 : (i / (n - 1)) * w);
      ctx.beginPath(); ctx.moveTo(0, base); ctx.lineTo(X(0), Y(dc[0].c));
      dc.forEach((c, i) => ctx.lineTo(X(i), Y(c.c)));
      ctx.lineTo(w, base); ctx.closePath();
      const g = ctx.createLinearGradient(0, pad, 0, base);
      g.addColorStop(0, "rgba(243,241,236,0.30)"); g.addColorStop(1, "rgba(243,241,236,0.02)");
      ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); dc.forEach((c, i) => (i ? ctx.lineTo(X(i), Y(c.c)) : ctx.moveTo(X(i), Y(c.c))));
      ctx.strokeStyle = "#f3f1ec"; ctx.lineWidth = 2; ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(243,241,236,0.4)"; ctx.shadowBlur = 5; ctx.stroke(); ctx.shadowBlur = 0;
    } else {
      const cw = Math.max(1.5, slot * 0.6);
      dc.forEach((c, i) => {
        const x = i * slot + slot / 2, up = c.c >= c.o;
        ctx.strokeStyle = C.wick; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.stroke();
        const yo = Y(c.o), yc = Y(c.c), top = Math.min(yo, yc), bh = Math.max(1, Math.abs(yc - yo));
        if (up) { ctx.strokeStyle = C.up; ctx.strokeRect(x - cw / 2, top, cw, bh); } else { ctx.fillStyle = C.down; ctx.fillRect(x - cw / 2, top, cw, bh); }
      });
    }
    const lastY = Y(dc[n - 1].c); ctx.strokeStyle = C.last; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, lastY); ctx.lineTo(w, lastY); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.axis; ctx.font = "9px -apple-system, 'Helvetica Neue', sans-serif"; ctx.textAlign = "center";
    const short = zoomMonths <= 60, labels = 5;
    for (let k = 0; k < labels; k++) {
      const i = Math.round((k / (labels - 1)) * (n - 1)), x = i * slot + slot / 2;
      ctx.fillText(monthLabel(dc[i].mid, short), Math.min(w - 14, Math.max(14, x)), h - 5);
    }
    if (hi != null && dc[hi]) {
      const x = hi * slot + slot / 2; ctx.strokeStyle = C.axis; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, pad + plotH); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, Y(dc[hi].c), 3.4, 0, 7); ctx.fill();
    }
  }
  function drawVol(cv, dc) {
    const { ctx, w, h } = sizeCanvas(cv, 46); ctx.clearRect(0, 0, w, h);
    if (!dc.length) return;
    const vols = dc.map((c) => Math.abs(c.c - c.o) + (c.h - c.l));
    const max = Math.max(...vols) || 1, n = dc.length, slot = w / n, bw = Math.max(1.5, slot * 0.6);
    ctx.fillStyle = C.vol;
    vols.forEach((v, i) => { const bh = (v / max) * (h - 4); ctx.fillRect(i * slot + slot / 2 - bw / 2, h - bh, bw, bh); });
  }

  // ============================================================
  //  ORB POKE — spike the displacement, ease back
  // ============================================================
  let pokeVal = 28, pokeRAF = null;
  const BASE_WARP = 28;
  function pokeOrb() {
    pokeVal = 130;
    if (!pokeRAF) pokeRAF = requestAnimationFrame(pokeTick);
  }
  function pokeTick() {
    pokeVal += (BASE_WARP - pokeVal) * 0.12;
    const el = $("#dreamfx feDisplacementMap");
    if (el) el.setAttribute("scale", pokeVal.toFixed(1));
    if (Math.abs(pokeVal - BASE_WARP) > 0.6) pokeRAF = requestAnimationFrame(pokeTick);
    else { if (el) el.setAttribute("scale", String(BASE_WARP)); pokeRAF = null; }
  }

  // ============================================================
  //  INDICES / FEAR & GREED / APOCALYPSE
  // ============================================================
  let idxBase = null;
  function computeIndices() {
    const calc = (arr) => {
      const wsum = arr.reduce((a, s) => a + s.interest, 0) || 1;
      return { cur: arr.reduce((a, s) => a + s.price * s.interest, 0) / wsum, opn: arr.reduce((a, s) => a + s.open * s.interest, 0) / wsum };
    };
    if (!idxBase) idxBase = { all: calc(state).cur / 1000, nightmare: calc(state.filter((s) => s.category === "nightmare")).cur / 1000, hope: calc(state.filter((s) => s.category === "hope")).cur / 1000 };
    const mk = (arr, key) => { const c = calc(arr); return { val: c.cur / idxBase[key], chg: ((c.cur - c.opn) / c.opn) * 100 }; };
    return { all: mk(state, "all"), nightmare: mk(state.filter((s) => s.category === "nightmare"), "nightmare"), hope: mk(state.filter((s) => s.category === "hope"), "hope") };
  }

  let fearGreed = 66;
  function fgWord(v) { return v < 25 ? "Extreme Fear 極度の恐怖" : v < 45 ? "Fear 恐怖" : v < 55 ? "Neutral 中立" : v < 75 ? "Greed 強欲" : "Extreme Greed 極度の強欲"; }
  function updateFearGreed() {
    const avg = state.reduce((a, s) => a + dayChange(s), 0) / state.length;
    const target = Math.max(0, Math.min(100, 55 + avg * 6));
    fearGreed += (target - fearGreed) * 0.08;
    $("#fgWord").textContent = fgWord(fearGreed); drawFgGauge(fearGreed);
  }
  function drawFgGauge(v) {
    const cv = $("#fgGauge"); if (!cv) return;
    const dpr = window.devicePixelRatio || 1, w = 132, h = 58;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h - 8, R = 46; ctx.lineCap = "round";
    ctx.beginPath(); ctx.strokeStyle = "rgba(243,241,236,0.14)"; ctx.lineWidth = 3; ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.strokeStyle = "rgba(243,241,236,0.85)"; ctx.lineWidth = 3; ctx.arc(cx, cy, R, Math.PI, Math.PI + (v / 100) * Math.PI); ctx.stroke();
    const ang = Math.PI + (v / 100) * Math.PI; ctx.strokeStyle = "#f3f1ec"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * (R - 4), cy + Math.sin(ang) * (R - 4)); ctx.stroke();
    ctx.fillStyle = "#f3f1ec"; ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, 7); ctx.fill();
    ctx.font = "300 15px -apple-system, 'Helvetica Neue', sans-serif"; ctx.textAlign = "center"; ctx.fillText(Math.round(v), cx, cy - 13);
  }

  let doom = 0.16, crashCooldown = 0;
  function updateDoom() { $("#doomVal").textContent = Math.round(doom * 100) + "%"; $("#doomFill").style.width = Math.round(doom * 100) + "%"; }
  function triggerCrash() {
    state.forEach((s) => { s.price *= 0.42 + Math.random() * 0.26; s.closes[TOTAL_MONTHS - 1] = s.price; });
    doom = 0.08; fearGreed = 34; crashCooldown = 30;
    pushNews("市場調整 · Market correction — 絶好の買い場が訪れています。");
    toast("市場調整 · MARKET CORRECTION<br/>いまこそ、賢明な投資家の好機です。");
  }
  function pushNews(text) { const feed = $("#tradeFeed"); const div = document.createElement("div"); div.className = "trade news"; div.textContent = text; feed.insertBefore(div, feed.firstChild); }

  // ============================================================
  //  SIMULATION
  // ============================================================
  function step() {
    doom = Math.min(0.99, doom + 0.0007 + Math.random() * 0.0006);
    if (crashCooldown > 0) crashCooldown--;
    else if (doom > 0.97 || Math.random() < Math.max(0, doom - 0.8) * 0.05) triggerCrash();
    const mood = gauss() * 0.004 + 0.0009;
    state.forEach((s) => {
      let p = s.price;
      const bias = s.category === "nightmare" ? p * doom * 0.0024 : s.category === "hope" ? -p * doom * 0.0016 : 0;
      p += p * s.volatility * 0.007 * gauss() + (s.fair - p) * MEAN_REVERT + p * mood + bias;
      p = Math.max(1, p); s.price = p;
      s.closes[TOTAL_MONTHS - 1] = p;
      s.tape.push(p); if (s.tape.length > TAPE_N) s.tape.shift();
    });
    maybeTrade();
    updateList(); updateTicker(); updateDetail();
    updateFearGreed(); updateMainIndex(); updateDoom();
  }
  function updateMainIndex() { const idx = computeIndices().all; $("#dreamIndex").innerHTML = `${idx.val.toFixed(2)} <span class="${cls(idx.chg)}" style="font-size:.62em">${pctTxt(idx.chg)}</span>`; }

  const BUYERS = ["Anonymous investor", "Dream addict", "Doomsayer", "The museum", "Bored billionaire", "Sleepless child", "Trading algorithm", "Collector", "Traveler from the future", "Fortune teller"];
  function maybeTrade() {
    const feed = $("#tradeFeed"); const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const s = state[Math.floor(Math.random() * state.length)], buy = Math.random() > 0.5;
      const who = BUYERS[Math.floor(Math.random() * BUYERS.length)], qty = (Math.random() * 12 + 0.1).toFixed(2);
      const div = document.createElement("div"); div.className = "trade";
      div.innerHTML = `<span class="who">${who}</span> <span class="num ${buy ? "up" : "down"}">${buy ? "bought" : "sold"}</span> <b>${s.ticker}</b> ×${qty} <span class="num">@ ${fmt(s.price)} ${CUR}</span>`;
      feed.insertBefore(div, feed.firstChild);
    }
    while (feed.children.length > 26) feed.removeChild(feed.lastChild);
  }

  let toastT = null;
  function toast(html) { const t = $("#toast"); t.innerHTML = html; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 4200); }

  // ============================================================
  //  DREAMFIELD — 夢の海（浮遊する球体の星座）
  //  売り手の一人称の言葉（〜140字）。無い銘柄は説明文で代替。
  // ============================================================
  const QUOTES = {
    "NOWAR": "生まれた時から、遠くで爆発の音がしていた。戦争のない世界を、わたしは見たことがない。だから夢の中だけで、静かな朝を作った。売りたくはないけど、お金がいる。誰かこの静けさを、ちゃんと使ってください。",
    "NOHGR": "援助物資の箱を数えるのが仕事だった。数は合っているのに、届かない人がいる。夢の中では全員が座っていて、全員の前に皿がある。それだけの光景なのに、目が覚めると泣いている。この夢、数字に強い人に売ります。きっと良い投資になる。",
    "NOPOV": "支援先の村で会った男の子は、靴を片方しか持っていなかった。もう片方は弟のものだった。夢では二人とも両足に靴を履いている。たったそれだけの夢。なのに朝、報告書を書く手が止まる。この夢は市場で高く売れるだろう。貧困は、数字にするといつも「有望」に見えるから。",
    "CURE": "母が長く患って、最後の三年は声も出せなくなった。夢の中ではちゃんと話せていて、わたしの名前を呼ぶ。起きると、まだ病室の匂いがする。手放すのは怖いけど、市場に出します。医師を志す若い人に買ってほしい。きっといい燃料になる。",
    "IMMO": "死ぬのが怖くて、終わらない夢を見続けた。気づけば周りには誰もいなくて、ひとりで永遠を歩いていた。永遠って、こんなに静かなんだ。もう十分。この夢、若い投資家さんに高く売れるって聞きました。",
    "EDU": "教室に四十人いて、椅子は三十脚しかない。毎日誰かが立っている。夢の中では全員が座っていて、全員の前にノートがある。目が覚めると、また予算の会議。この夢を売ったお金で、椅子を十脚買えたらいいのだけど。",
    "DISARM": "署名を集めて三十年になる。最初の頃は街頭で怒鳴られた。最近は無視される。夢の中では解体のニュースが流れていて、キャスターが泣いている。美しい夢だ。でも三十年で学んだのは、美しい夢ほど買い手がつかないということ。それでも出品します。",
    "STOPGW": "デモの帰り道、缶コーヒーを買った自分が嫌になる。夢では北極の氷が元に戻っていく。タイムラプスみたいに、きれいに。起きたらまた夏日。この夢、本気で怒れる人に渡したい。わたしは少し疲れてしまった。",
    "SUST": "エコバッグは七つ持っている。どれも企業のノベルティだ。夢の中では、海に魚が戻ってきている。空気が甘い。完璧な持続可能社会。ただし夢の中でもわたしはエコバッグを持っていて、そこに何かのロゴが入っている。この皮肉ごと、買ってください。",
    "ENRGY": "ラボで八年、効率を0.3%上げるために費やした。夢の中では数値がぴったり合って、指導教官が黙って頷く。それだけで十分だった。現実では予算が凍結された。この夢、まだ大学にいる人に譲ります。0.3%を信じ続けられる人に。",
    "NOWORK": "働かなくていい世界の夢を見た。みんな庭で昼寝して、誰も焦ってなかった。目が覚めたら満員電車。あの静けさを、誰かに託したい。",
    "FIRE": "スプレッドシートに自分の寿命を入力して、月ごとの支出を管理している。あと七年で辞められる計算だ。夢の中では、もう辞めたあとの自分が公園のベンチにいる。でも何をしていいかわからなくて、ずっとベンチに座っている。この夢は買い手を選ぶと思う。",
    "HLTH": "毎年の健診で、どこかの数値が黄色くなる。夢の中では全部が白い。正常。その紙を握りしめて目が覚めると、手に何も持っていない。健康はきっと、持っている人には見えない夢。だから市場では割安になる。",
    "YOUTH": "鏡のなかの自分がいつの間にか母に似てきた。夢の中では二十歳の肌に戻っている。触ると冷たくて、すべすべで、他人の肌みたいだった。若さって他人のものだったんだ。そう気づいたから売ります。",
    "BODY": "ジムの鏡で自分を見る時間が、年々長くなっている。夢の中では理想の体がある。でもその体で何をしているかというと、また鏡を見ている。出口のない夢だと気づいた。手放します。",
    "CALM": "瞑想アプリに課金して三年。夢の中ではガイドの声なしで、ただ静かだった。鳥の声と自分の呼吸だけ。あの十秒が、三年分のサブスク代より価値があった。この十秒を売ります。アプリより安いはず。",
    "NOANX": "夜、布団に入ると全部が来る。明日の会議、来月の家賃、五年後の自分。夢の中だけ、何も来なかった。ただの暗闇で、ただの暗闇が、こんなに優しい。この空白、意外と高く売れると思う。みんな欲しがっているはずだから。",
    "CONF": "面接で声が震えた。三十二回目。夢の中では堂々としていて、相手が先にうなずく。その自信を持ったまま目覚められたら、三十三回目はうまくいくのに。この夢、転職活動中の人に。きっと必要としている人がいる。",
    "SELF": "二十代は旅に出た。三十代は本を読んだ。四十代は資格を取った。夢の中で「本当の自分」に会った。見た目は今の自分と同じだった。少しがっかりして、少し安心した。この微妙な感情、誰かに売ります。",
    "CALL": "「好きなことを仕事にしろ」と言われて育った。好きなことが何かを聞かれると困る。夢の中では何かに夢中で、それが何かは起きると思い出せない。夢中だったという感覚だけが残る。これは高級品だと思う。中身がないのに手触りだけがある。",
    "TALNT": "子どもの頃、絵がうまいと言われた。大人になって、うまいだけだと知った。夢の中では描いた絵が動き出す。起きて描いてみる。動かない。才能の夢は、一番残酷かもしれない。希望と現実の差額を、市場に委ねます。",
    "FREE": "数字を見る癖がついた。残高、利回り、前年比。夢の中では数字がなかった。何も足さず、何も引かず、ただ海を見ていた。あれが自由だとしたら、自由には値段がつけられない。でもここは市場だから、つける。",
    "JACK": "毎週三百円。二十年で三十万円以上つぎ込んだ。当たったことはない。夢の中では当選番号が全部光る。目が覚めて確認する。一つも合わない。この期待感だけなら、三百円より高い値がつくかもしれない。",
    "HOME": "内見した部屋を、夢の中で何度も歩いた。日当たり、床のきしむ場所、まだ置いていない机の位置まで覚えている。ローンが下りなかった。物件はもう他人のものだ。だからこの夢だけ、市場に出します。",
    "SOUL": "アプリで三百人と会った。誰も違った。夢の中では顔のない人が隣にいて、何も言わないのに安心する。起きると、その感覚だけ残ってプロフィールを見る気になれない。この「隣にいる感じ」、売ります。顔はありません。",
    "LOVE": "離婚届を出した日の夜、永遠の愛の夢を見た。皮肉で見たんじゃない。本当にきれいだった。あの人と出会った頃のまま、ずっと続いている世界。目が覚めて、やっと泣けた。この夢を売れば、本当に終わりにできる気がする。",
    "FRND": "引っ越しを手伝ってくれる人がいない。業者に頼んだ。夢の中では、段ボールを一緒に運んでくれる人がいる。名前も顔も知らないのに、なぜか文句を言い合えて、笑える。あの軽さが売り物です。家具は入ってません。",
    "ALONE": "独り暮らし四年目。冷蔵庫の音で安心する夜がある。夢では、ただ隣の部屋に誰かがいる。顔を見なくても、気配だけでいい。あの家電みたいな安心感を、出品します。電源は要りません。",
    "TRVL": "パスポートを更新した。前のは白紙のまま期限が切れた。夢の中では毎晩違う空港にいる。言葉は通じないけど、コーヒーの味は同じ。起きると、通勤の電車が国際線に見えた。その一瞬のために、まだこの夢を持っていたい——でも家賃が。出品します。",
    "MARS": "地球を捨てて、別の星で生きていくなんて馬鹿げてる。私は最後まで、この地球を離れない。だからこの夢は、行きたい誰かに売ります。私には、要らないので。",
    "REUNI": "父が死んで五年。夢の中で、何でもない夕飯を一緒に食べている。「最近どう？」って聞かれて、「普通」って答える。起きてから、あれが最後の会話だったかもしれないと思うと、胸が詰まる。この夢だけは高く売りたい。安売りしたら父に悪い。",
    "REDO": "あの日、電話に出ていたら。夢の中では出ている。毎回出ている。でも会話の内容は毎回違う。何を言えば正解なのか、夢でも分からない。「やり直し」は幻想だと分かっている。分かっているから売る。分かっていない人に売るのは、少し心苦しいけど。",
    "TIME": "過去に戻りたいのか、未来を見たいのか。夢の中では両方できた。でも一番長くいたのは、何も起きていない火曜の午後だった。大した日じゃない。ただ祖父が生きていて、わたしがまだ小さくて、庭にいた。時間旅行の行き先は、結局そこだった。",
    "ETLIF": "望遠鏡を買って十年。何も見つからない。夢では信号が入る。意味は分からない。でも「誰かがいる」とだけ分かる。起きると耳鳴りだった。寂しくて売ります。独りでいるのが寂しいんじゃなくて、独りかもしれないことが寂しいので。",
    "FLYCR": "子どもの頃の図鑑に描いてあった2020年は、透明なチューブの中を車が飛んでいた。今、2020年はもう過ぎた。車は飛んでいない。夢の中ではまだ飛んでいるけど、正直、渋滞してた。空でも渋滞するんだと思ったら笑えてきて、売ることにした。",
    "FAME": "フォロワーが百人を超えたことがない。夢の中では街を歩くと誰かが名前を呼ぶ。気持ちよかった。でも目が覚めて気づいた——夢の中のわたしは、ずっと笑っていた。顔が疲れていた。あの疲れた笑顔ごと、売ります。",
    "ERTH2": "もう一つの地球が見つかったニュースの夢を見た。名前がつく前の、番号だけの星。海があって、雲があって、たぶん雨も降る。でも夢の中の自分は引っ越しの荷造りをしていて、結局ここでもダンボールか、と思った。売ります。",
    "ENLIGHT": "座禅を十五年続けた。夢の中で悟った。何が変わったかというと、何も変わらなかった。朝起きて歯を磨いた。でもその歯磨きが、少しだけ違った。この「少しだけ」を売るのは難しいと思う。でも本物は、いつも「少しだけ」だ。",
    "EDEN": "楽園の夢はいつも同じ場所だ。見たことのない砂浜で、木が一本あって、風がある。ただそれだけ。人がいない。楽園ってたぶん人がいない場所のことで、だからみんな求めるし、だから誰もたどり着けない。このパラドクスごと出品します。",
    "MESSI": "救世主がいつか来ると、母から聞かされて育った。八十を過ぎた母はまだ待っている。夢の中で、母が「来たよ」と微笑んだ。振り向いたら誰もいなかった。あの微笑みが救いなんだと思った。売ります。もう自分には、待つ力が残っていないから。",
    "GOLDEN": "祖父の話では、昔はもっとよかったらしい。父の話でも、昔はもっとよかったらしい。わたしもきっと、子どもにそう言うのだろう。夢の中の黄金時代は、なぜかいつも夕方で、影が長い。売ります。きっと次の世代も買う。",
    "STONE": "研究室で合金をいじっていた頃、冗談で「賢者の石を作ってる」と言っていた。笑われた。夢では本当に光る石が手の中にあった。でも金に変えたいものが何もなかった。価値のない石と、変えたいものがない自分。どっちが売り物か分からないけど、出品します。",
    "UTOPIA": "設計図を何度も引き直した。理想の社会。でもどの設計図にも、自分の住む場所がない。夢の中のユートピアは完璧だった。完璧すぎて、わたしの居場所がなかった。居場所のない理想を、市場に出します。市場なら、どんなものにも居場所がある。",
    "REBORN": "次に生まれ変わるなら、猫がいい。窓辺で丸くなって、何も考えずに暮らしたい。夢の中では猫だった。でも猫のくせに税金のことを考えていた。生まれ変わっても自分は自分らしい。この気づき、売ります。",
    "SOULIM": "毎週日曜、教会に通っている。魂は永遠だと信じている。でも夢の中で、永遠の魂がどんな形をしているか見た。何もなかった。ただ光だった。光に形がないことは、安心だった。この安心を、分けてあげたい。",
    "SHANGRI": "会社を辞めて山に入った人の記事を読んで、うらやましかった。夢では山の奥に小さな村があって、誰も時計を持っていない。目が覚めると七時十五分。出品理由は、この夢を見ると月曜がつらいからです。",
    "TOKOYO": "祖母が言っていた。海の向こうに、いい国がある。死んだ人はみんなそこへ行く。夢では祖母が浜辺に立っていて、手を振っていた。行くほうなのか、送るほうなのか、わからなかった。あの曖昧さが、常世なんだと思う。売ります。",
    "ATLANT": "沈んだ大陸の地図を集めている。どれも違う場所を指していて、全部が正しいような気がする。夢では海底に街灯が並んでいた。魚が光の中を泳いでいた。綺麗だったけど、誰も住んでいなかった。沈んだものは、沈んだまま美しい。この美しさを売ります。",
    "RIVAL": "同期のあいつが先に昇進した。悔しくて、夢の中であいつの上に立った。でも夢の中のあいつは笑っていて、「おめでとう」って言ってくれた。起きたら余計つらかった。勝っても嬉しくない夢って、何なんだろう。整理します。",
    "CRUSH": "隣の席の人を、三年間好きでいる。話しかけたことは五回。夢の中では向こうから来てくれる。でも目が覚めると、明日もまた五回目の「おはよう」を練習することになる。この片思いの燃料、同じ症状の人にお譲りします。",
    "CHOSEN": "子どもの頃から、自分だけは特別だと信じてた。何者かになるために生まれてきたんだって。夢の中では、世界がそれを証明してくれる。長いあいだ、手放せずにいた。…でも、もう。この夢、売ります。ふつうの朝を、生きてみたいから。",
    "ISEKAI": "信号待ちの瞬間、トラックが来て、気づいたら異世界——という展開を、通勤中に何度想像したかわからない。夢の中では本当に行けた。言語も違うし、空の色も違う。でもコンビニがあった。異世界にもコンビニがある。この安心と絶望を、セットで売ります。",
    "FORESEE": "夢の中で明日の新聞が読めた。株価が載っていた。目が覚めて必死にメモしたけど、数字が全部ぼやけていた。情報にならない予知は、ただの不安と同じだった。この曖昧な前知、投資家の方に安く出します。",
    "ANIMAL": "飼い犬が何を考えているか、ずっと知りたかった。夢の中で話しかけたら、「散歩」とだけ言った。もっと深いことを期待していた自分が恥ずかしかった。犬にとっては、散歩がすべてなんだ。この潔さ、売ります。",
    "REVENGE": "中学の時にいじめてきたあいつの顔を、まだ覚えている。夢の中であいつは落ちぶれていて、わたしは成功していた。最高の気分で起きた。でもその気分は五分で消えて、あとは空っぽだった。五分の復讐を売ります。賞味期限は短いです。",
    "SOMEONE": "ずっと、誰でもない自分が嫌だった。夢の中では、みんながわたしの名前を知っている。眩しくて、少しだけ救われる。でも目が覚めると元通り。この夢を売れば、少しは何者かに近づける気がして。",
    "WPRE": "祖母も母も、わたしも、ずっと投票してきた。『もうすぐ』って何回聞いたかな。夢の中では、彼女が宣誓してる。割れんばかりの拍手。目が覚めると、まだ朝じゃない。この夢、信じてくれる人に託したい。",
    "2COM": "毎週ミサに出て四十年。再臨を信じているし、信じていないときもある。夢の中で空が割れて、光が差した。でもわたしは台所にいて、スープをかき混ぜていた。振り返れなかった。振り返るのが怖かったのか、スープが焦げるのが嫌だったのか。この迷いごと売ります。",
    "NUKE": "毎晩、空が白く光る夢を見た。子どもを抱いて走るのに、足が動かない。朝になると枕が濡れている。もう手放したい。誰かこの夢を買って、わたしの代わりに見てくれませんか。二度と、見たくないんです。",
    "EXTN": "最後の一頭を看取った。檻の前で、ただ記録を取ることしかできなかった。夢には、もういない動物たちが帰ってくる。鳴き声まで覚えてる。手放したくないけど、見ているのがつらすぎるんです。",
    "PANDM": "防護服の中で、何ヶ月も過ごした。誰の手も握れなかった。夢では、まだあのアラームが鳴ってる。もう十分見た。市場が欲しがるなら、売る。",
    "CRSH": "画面の数字が、みるみる赤くなる夢。家も貯金も溶けていく。何度も見た。トラウマだけど、空売り筋には高く売れるらしい。皮肉なものだ。",
    "AIBC": "ストックオプションの価値を毎日確認していた。夢の中で上場廃止のニュースが流れた。オフィスのカードキーが反応しなくなっていた。目が覚めて最初にやったのは株価の確認だった。この反射神経ごと、手放したい。",
    "ROBOT": "工場のロボットアームが止まった日、同僚が「反乱だ」と笑った。夢の中では本当に反乱が起きていて、でもロボットたちは別に怒っていなかった。ただ動くのをやめただけだった。ストライキに近い。あの静かさが怖くて出品します。",
    "AIJOB": "上司に「君の仕事、来期からAIに任せる」と言われた夢を見た。夢の中のわたしは、怒りも悲しみもなく、「そうですか」と答えていた。あの冷静さが本物なのか諦めなのか、まだわからない。判断がつく前に売ります。",
    "FOOD": "田んぼが干上がる夢を見た。ひび割れた土に足を取られて転んだ。泥の匂いがしなかった。水のない田んぼは、匂いもしない。その無臭が一番怖かった。この夢、都市の人に売ります。たまには土のことを考えてほしい。",
    "QUAKE": "揺れる前に目が覚める。何かが来ることだけは分かる。夢の中では家が傾いていく。食器が割れる音が、とてもゆっくり聞こえる。この町に住んでいる限り見続ける夢だと思う。引っ越せないから、売ります。",
    "BLKOUT": "停電の夢を見た。スマホも死んでいて、時間が分からない。暗い部屋で、隣の家の人と初めて話した。名前を聞いた。電気が戻ったら、また話さなくなった。あの暗闇の親密さと、明るさの孤独をセットで売ります。",
    "OIL": "ガソリンスタンドに行列ができる夢を見た。列の後ろから前が見えない。みんな黙っている。静かなパニックが一番怖い。この静けさを市場に出します。騒がしいほうが、まだ安全だから。",
    "ENDEM": "投票所が閉まっている夢を見た。扉に「本日休業」の紙が貼ってある。誰も怒っていない。みんな「仕方ない」と帰っていく。わたしも帰った。あの「仕方ない」の空気が一番怖い。この空気、売ります。換気してください。",
    "FASC": "強い指導者が、全部決めてくれる夢。考えなくていいのは、正直すこし楽だった。それが怖くて目が覚めた。こんな夢、早く誰かに引き取ってほしい。",
    "ALIEN": "夢の中で、空に大きな影が落ちてきた。誰も逃げなかった。みんな空を見上げて、不思議と穏やかな顔をしていた。たぶん、何かに来てほしかったんだと思う、ずっと。この期待感、市場で買ってもらったほうがいい。",
    "ASTER": "夢の中で、空に光る点がゆっくり大きくなっていった。不思議と怖くなかった。間に合わないと分かっているとき、人は静かになるんだと思う。あの静けさを持っていたくないから売る。静かに諦めるのは、性に合わない。",
    "ARMAG": "もう何年も、毎晩のように世界が終わっている。津波だったり、空が裂けたり、毎回違う。そのたび、ほっとして目が覚める。終わってくれたほうが楽だと思っている自分が、一番怖い。この夢、もう要りません。",
    "SURV": "夢の中で、部屋のカメラに気づいた。でもすぐ忘れた。忘れたふりじゃなくて、本当に忘れた。それがいちばん怖かった。慣れるって、そういうことだ。この「慣れ」を売ります。買った人も、たぶんすぐ慣れる。",
    "LEAK": "夢の中で、知らない人がわたしの住所を言った。好きな食べ物も、昨日検索したことも。全部知っている。でも怒りは湧かなかった。だって現実でも、もう同じことが起きている。この「今さら感」、市場に出します。",
    "JUDG": "夢の中で裁かれた。裁判官の顔を見たら、自分だった。判決は覚えていない。目が覚めて、許されたのか許されなかったのか分からないまま歯を磨いた。この宙ぶらりんを、誰かに引き取ってほしい。",
    "WEDLOCK": "指輪が外れない夢を何度も見る。石鹸をつけても、引っ張っても、指に食い込んだまま。起きると本物の指輪はちゃんと外れる。外せるのに外さない自分が、夢より怖い。この矛盾、売ります。",
    "JPSK": "引っ越したばかりの部屋のベランダから、海が見えた。嬉しかった。夢の中で、その海がベランダまで来た。靴が浮いていた。起きたらまだ海は遠い。でも少しだけ、近づいた気がする。窓を閉めて、売りに来ました。",
    "GEQ": "娘が生まれた日に見た夢。娘が大人になっていて、「何にでもなれる」と言われて育ったと笑っていた。わたしは同じことを言われなかった。この差を夢で埋めて、現実では埋まらなかった。娘のために売ります。娘にはこの夢が要らない世界で育ってほしい。",
    "NODISC": "名前で落とされたことがある。書類審査で。夢の中では名前がなくて、番号で呼ばれた。それはそれで寂しかったけど、少なくとも公平だった。公平と寂しさがセットになっている夢を、出品します。",
    "FAIR": "夢の中で、全員の口座残高が同じだった。嬉しいかと思ったら、みんな黙っていた。平等は、思ったより静かだった。誰かが「で、次は？」と聞いた。誰も答えなかった。この沈黙を、経済学部の人に売りたい。",
    "DEMO": "投票率100%の夢を見た。開票速報を見ていたら、結果はいつもと同じだった。全員が投票しても変わらないのか、全員が投票したから変わらないのか。考え込んでいるうちに目が覚めた。この問いごと、売ります。",
    "CLEAN": "夢の中で、政治家が全員嘘をつかなくなった。ニュースがすごく短くなった。何も起きていないみたいに見えた。清廉な政治は、退屈だった。その退屈が理想なんだとしたら、理想は娯楽にならない。この発見を売ります。",
    "UBI": "毎月十五万円が口座に入る夢を見た。何も変わらなかった。同じコンビニで同じ弁当を買った。ただ、レジで「ありがとう」と言えた。余裕があると、声が出る。この余裕を、売ります。十五万円より安いです。",
    "SING": "もうすぐ何もかもが変わると、毎年聞いている。夢の中では本当に変わっていて、わたしはもう働かなくていい。起きるとSlackが鳴っている。信じきれないけど、信じきれなくもない。この中途半端な期待、誰かに譲ります。",
    "CLASS": "夢の中で名刺を見たら、肩書きが消えていた。全員の名刺が名前だけ。最初は清々しかった。でもすぐ、誰に何を頼めばいいのか分からなくなった。階級がないと、会話の入り口もない。この不便さごと、売ります。",
    "PERP": "ガレージで試作品を作っている。もう十七台目だ。全部止まった。夢の中では十八台目が回り続けていた。音もなく。永遠に。目が覚めて図面を見たら、どこが違うのか分からなかった。この「あと一歩」の感覚だけ、売ります。回らないけど。",
    "PROG": "右肩上がりのグラフを、プレゼンで百回は描いた。夢の中でもグラフは上がっていた。でもよく見ると、Y軸のラベルが消えていた。何が上がっているのか、誰も気にしていなかった。この盲信、市場なら買い手がつく。市場は右肩上がりが大好きだから。",
    "REASON": "ネットで三時間議論した。ソースを貼り、論理を整え、冷静に書いた。相手は「笑」とだけ返してきた。夢の中では全員が論理的で、全員が同意した。つまらなかった。理性が勝つ世界は、退屈だった。この退屈を売ります。矛盾しているけど。",
    "ENHANCE": "夢の中で、視力が5.0になっていた。遠くの看板が全部読める。嬉しかった。でもそのあと、人の顔のシワやシミも全部見えるようになった。見えすぎると、優しくなれない。改良の夢には副作用がある。注意書きつきで売ります。",
    "SCIFUT": "夢の中で、すべての問題が解決されていた。病気も、貧困も、孤独も。でも誰も笑っていなかった。問題がないと、人は何をしていいか分からないらしい。科学の夢は正しいけど、正しさだけでは足りなかった。この余白を売ります。",
    "WREV": "夢の中で、バリケードの上にいた。隣にいた人の顔を覚えている。叫んでいた。何を叫んでいたかは覚えていない。起きてコーヒーを淹れながら思った——叫ぶ理由はあるのに、声が出ない朝が一番つらい。この声を、出せる人に売りたい。",
    "MARX": "大学の書棚にまだ『資本論』がある。引っ越しのたびに持っていく。読み返さないけど、捨てられない。夢の中で資本論が燃えていた。悲しかったけど、暖かかった。この矛盾を、次の世代に売ります。古本として。",
    "GROW": "去年も今年も来年も、グラフは右上がりであってほしい。会議で言うと、みんな頷く。家に帰って眠ると、終わらない上り坂を登っている夢を見る。息が切れる。本当はもう、頂上があってもいいと思っている。誰か、この夢を引き取ってください。市場が一番欲しがる銘柄のはずです。",
    "PWD": "夢の中で、自分の部屋の鍵が変わっていた。暗証番号を打つのに、何回やっても違う。指は覚えているはずの番号を押しているのに、画面が赤く光る。起きて本当にスマホを確認した。ロックされていなかった。でもあの「排除される感じ」が指に残っている。売ります。",
    "FALL": "ビルの屋上から落ちる。いつも途中で目が覚める。地面につく前に起きるから、着地を知らない。夢の中の自分は怖がっていない。風が気持ちいいとさえ思っている。怖いのは起きたあとの自分だけ。あの一瞬の浮遊感を売ります。着地は保証しません。",
    "CHASE": "何かに追われている。顔は見えない。走っても走っても距離が縮まらないし、離れもしない。だんだん、追われていないと落ち着かなくなった。健康的じゃないと思って、出品します。",
    "TEETH": "気づくと口の中で歯がぼろぼろ崩れて、手のひらにこぼれる。誰にも言えないけど、世界中の人が同じ夢を見てるらしい。だから怖くないことにした。よかったら、この不思議、買ってみませんか。",
    "FLY": "飛び方にコツがある。力を入れると落ちる。力を抜くと浮く。夢の中で会得した技術で、現実では何の役にも立たない。でも、あの「力を抜いたら浮いた」という感覚は、生き方のヒントかもしれない。ヒントごと売ります。",
    "NAKED": "会議室で気づいた。服を着ていない。でも誰も指摘しない。わたしだけが気づいていて、わたしだけが恥ずかしい。もしかすると、現実でもそうなのかもしれない——わたしの恥は、わたしにしか見えていない。この気づきを売ります。少し楽になる。",
    "MUTE": "金縛りは何十回も経験している。天井が見える。体が動かない。叫ぼうとして、声にならない。慣れたと思っていたけど、慣れない。慣れないことに慣れた、というのが正確かもしれない。この複雑な諦念、出品します。",
    "DROWN": "水の中に沈んでいく。不思議と苦しくない。むしろ静かで、音がなくなっていく。底に着く前に起きる。落下の夢は怖いけど、溺れる夢は悲しい。悲しいほうが売るのは難しいと思うけど、置いておきます。",
    "EXAM": "卒業して十五年経つのに、まだ試験の夢を見る。教室に入ったら、知らない科目の試験が始まっている。鉛筆がない。時計が早い。いつも間に合わない。たぶん一生間に合わない。この焦りを売ります。学生さん、お守りに買いませんか。逆に。",
    "FUNRL": "自分の葬式を、天井のあたりから眺めてた夢。みんなが泣いていて、ほんの少しだけ嬉しかった。自分のいない世界も、案外わるくない。この夢、売ります。",
    "MIRR": "洗面所の鏡に映ったのは、自分じゃなかった。似ているけど、違う。笑い方が少しだけ冷たい。でも向こうも驚いていた。もしかすると、向こうにとっても、わたしが「鏡の中の別人」なのかもしれない。お互いに売りに来ているのかもしれない。",
    "DEAD": "電話が鳴って、出たら祖母だった。「元気？」って聞かれて、「元気だよ」って答えた。起きて着信履歴を見た。何もなかった。でもあの声は本物だった。少なくとも、夢の中では。この通話記録、売ります。圏外でも届きます。",
    "LOOP": "月曜の朝が、毎晩繰り返される夢を見る。同じ駅で、同じ人とすれ違う。最初は嫌だった。今はちょっと安心している。それが嫌で売ります。慣れることが、いちばん怖いと気づいたので。",
    "NOWAKE": "夢の中で「これは夢だ」と気づいている。起きようとする。でも体が重くて、目が開かない。もう一層下に落ちる。どこが底か分からない。起きたとき、本当に起きたのかしばらく分からなかった。この不確かさを、売ります。",
    "FALSE": "起きて顔を洗って、朝ごはんを食べて、靴を履いて——そこでまた目が覚める。全部夢だった。三回繰り返したことがある。四回目に起きたとき、歯ブラシを持つ手が震えていた。今この瞬間も、確かめようがない。この疑いを売ります。",
    "DONTWAKE": "いい夢の途中で、起きたくなかった。あと少しだけ、あの世界にいたかった。目覚ましを恨んだ。この『覚めたくなさ』、買う人いますか。",
    "ROADEXT": "歩いても歩いても、道が伸びていく。景色は変わらない。でも不快じゃない。呼吸が整って、頭が静かになる。到着しない安心がある。たぶんこれは、最も優しい悪夢。いや、悪夢じゃない。どこにも分類できないから出品します。",
    "SUNKCITY": "通勤路の交差点が、膝まで水に浸かっていた。信号は点いている。みんな濡れたまま歩いている。誰も驚いていない。水がゆっくり上がってくることに、夢の中の人々は慣れてしまっていた。あの「慣れ」が、現実と同じで怖い。売ります。",
    "DATALOSS": "三年分の写真が、一瞬で消える夢。叫んでも戻らない。冷や汗で起きる。バックアップは取った。でもこの恐怖だけは消せない。買ってくれたら、少し眠れる。",
    "SUMMER": "あの夏が、夢の中ではまだ終わってない。蝉の声も、濡れた制服も、そのまま。戻れないと分かってるから、いっそ誰かに売りたい。",
    "SKYFALL": "空が割れて、破片がゆっくり降ってきた。青い破片。手に取ると冷たくて、硬い。これが空の素材なのかと思った。怖いのに美しくて、逃げられなかった。この審美的な恐怖を売ります。鑑賞用にどうぞ。",
    "ROOMS": "うちの家に、見たことのない部屋があった。開けるたび、また次の部屋。怖くないのが不思議だった。この発見の感じ、誰かに見てほしくて売りに来ました。",
    "LOSTHOME": "電車に乗って地元に帰る夢。駅に着いたら、町がなかった。更地じゃなくて、最初からなかったみたいに、ただ野原がある。コンビニも、学校も、あの交差点もない。風だけ吹いている。あの風だけが本物だった気がする。売ります。",
    "LOOPTALK": "夢の中で友達と話していた。「最近どう？」「まあまあ」「そっか」。そのあと、また「最近どう？」。何度繰り返しても、三行で終わる。相手は気づいていない。わたしだけがループに気づいている。現実の会話もそうかもしれない。この疑惑、売ります。",
    "SEX": "あの人のことを考えると眠れない。夢の中でだけ、ためらわずに触れられる。朝、現実のわたしに戻るのが少し苦しい。だからこの夢は手放します。叶わない気持ちは、誰かの役に立つほうがいい。",
    "MEETLOVE": "まだ会ったこともない『その人』に、夢の中では会える。顔は思い出せないのに、声だけ覚えてる。目が覚めると、世界中の誰でもないその人が恋しい。この夢、運命を信じる人に売ります。",
    "DEADCAT": "十六年いっしょにいた。最後はわたしの腕の中で、眠るように逝った。夢でだけ、また膝に乗ってくる。重さも、喉を鳴らす音も本物みたいで。目が覚めるのが怖い。この夢、いい人に売りたい。大事にしてほしい。",
    "FORGETEX": "「忘れたい」と毎晩唱えていた。でも本当は、一日だって忘れたくなかった。この夢を売れば、きっと忘れられる。…それが、いちばん怖い。だから忘れたいという願いごと、手放します。わたしはたぶん、ずっと覚えていたいんです。",
    "OSHI": "何百回もライブに行った。一度でいい、目が合って、わたしを見つけてほしい。夢の中では名前を呼んでくれる。それだけで一週間がんばれる。叶わないのは分かってる。だからこの夢、同じ気持ちの人へ。",
    "SLEEP": "眠りの中で、「もっと眠りたい」と夢を見ていた。夢の中でさえ疲れている。夢の中の自分が布団を引き上げている。二重の眠りは二重に幸福だった。この幸福、需要はあると思う。月曜の朝六時が来る人、全員。",
    "PARENT": "仕事で賞をもらった。電話で母に報告したら、「ごはん食べてる？」と聞かれた。夢の中では母が泣いて喜んでくれた。たぶん現実の母も嬉しかったんだと思う。言い方が違うだけで。この翻訳の難しさごと、売ります。",
    "NEEDED": "夢の中で、誰かに呼ばれた。「来て」と。急いで走った。誰に呼ばれたかは分からない。でも走れたことが嬉しかった。誰かのために走れるというだけで、もう十分だった。この用途不明の使命感を売ります。",
    "CHILD": "祖母の家の縁側で、スイカを食べている夢を何度も見る。祖母はもういない。家もない。それでも夢の中の縁側だけは、なぜか毎年少しずつ広くなっている。広すぎて怖くなってきたので、誰かに譲ります。",
    "HOME2": "帰省の電車に乗っている夢を見る。いつまで経っても着かない。車窓の景色はどんどん知らない土地になっていく。「帰る」と思っているのに遠ざかっていく。これはたぶん正確な夢だ。帰れないから故郷でいられる。この距離感を、売ります。",
    "UNDO": "三年前、友人に言った一言がまだ胸にある。夢の中でその場面に戻って、違うことを言う。何を言ったかは起きると忘れている。でも「言い直せた」という安堵だけが残る。この安堵、量り売りできたらいいのに。一回分だけ、出品します。",
    "DEBT": "通帳を見るのが怖い。夢の中でだけ、全部きれいに返し終えて、肩の荷が下りる。あの軽さをもう一度味わいたくて、毎晩眠る。でも現実は減らない。せめてこの夢が、少しのお金になれば。",
    "PREZ": "演説の夢を見る。何万人もが僕の名を呼び、拍手が鳴り止まない。朝、鏡の前の僕は、ただの僕だ。この高揚、安く譲ります。",
    "BALLER": "膝を壊して、十七で引退した。夢の中ではまだ走れる。芝の匂いがする。ゴールを決めると、観客席に母がいる。現実の母は、わたしがサッカーを辞めたことをまだ知らない。この夢を売ったお金で、母に電話する。",
    "SINGER": "カラオケの採点で88点が最高。夢の中ではホールで歌っている。声が天井に当たって返ってくる。起きて鼻歌を歌ったら、隣の部屋から壁を叩かれた。この声量の差を、出品します。",
    "ASTRO": "七歳のとき、天井に星のシールを貼った。夢の中ではその天井が本物の宇宙になっていた。三十年経って、シールはまだ剥がしていない。一つだけ落ちて、枕元に転がっていた。あの一つを売ります。",
    "ELOPE": "あの夜、駅で待ち合わせた。でも私は、行かなかった。今も夢の中では、二人で改札を駆け抜けていく。選ばなかったほうの人生を、誰かに売ります。",
    "AFFAIR": "いちばん愛したのは、いちばん愛してはいけない人だった。夢の中では、誰にも責められず手をつなげる。でももう疲れた。この夢を売って、ぜんぶ終わりにしたい。買う人は、罪悪感ごと持っていって。",
    "ROCK": "ギターは押し入れの奥。子どもが生まれて、ローンも組んだ。でも夢の中では、まだ何万人の前で弾いてる。あの歓声だけは、本当は売りたくない。",
    "CINDER": "毎週、宝くじを買う。いつか何もかもひっくり返る日が来るって。夢の中では迎えの車が来る。現実には来ない。この夢、信じられる人に売ります。",
    "TENNO": "鏡を見るたび思う。本当は、俺がこの国の天皇なんじゃないか。誰も気づいてないだけで。…この夢は手放したほうがいいと先生に言われた。でも、売るならいい値がつくと思う。",
    "MOTE": "すれ違う人みんなが振り返る夢。目が覚めると、誰もこっちを見ない。痛いほど分かってる。でも、この一瞬の全能感、けっこう高く売れるらしい。",
    "INHERIT": "会ったこともない遠い親戚が死んで、大金が入る夢。嬉しさより先に、「知らない人の死で得をしていいのか」と考えた。夢の中でさえ後ろめたい。この良心的な不自由さ、買い手がつくかどうか分からないけど出品します。",
    "QUITJOB": "毎晩、辞表を出す夢を見る。上司の前に置いて、振り返らずに出ていく。朝になると、また出社してる。この爽快感、同じ気持ちの人へ売ります。",
    "FOLLOW": "通知が鳴るたび、心臓が跳ねる。夢ではフォロワーが百万人いて、みんな私を見てる。起きると、いいねは3。この承認、誰か要りませんか。",
    "REUNION": "同窓会の招待状を、まだ捨てられない。夢の中では見違えるほど成功した自分が会場に入っていく。みんなが息をのむ。現実は、行けてない。この見栄、売ります。",
    "SLEEPIN": "アラームを止めて、もう五分。あの五分が、人生でいちばん幸せかもしれない。永遠に続けばいいのに。誰か買ってくれたら、ちゃんと起きられる気がする。",
    "BILLION": "通帳の桁が、夢の中だけ一つ多い。あの安心感が忘れられなくて毎晩見てる。誰か、この余裕を買ってくれませんか。少しだけ分けてあげたい。",
    "HAREM": "言いにくいけど、夢の中ではみんなが俺を好きでいてくれる。現実は、誰にも必要とされてない。だからこの夢だけは、本当は手放したくなかった。…でも、いいかげん目を覚まさないとな。売ります。誰か、もらってやってください。",
    "FLORIST": "卒業文集に書いた。『花屋さんになりたい』。今は全然ちがう仕事をしてる。夢の中では、まだエプロンをつけて水をやってる。大事にしてくれる人に。",
    "CUTE": "鏡の中の自分が、夢ではすごく可愛い。起きると全部もとに戻る。その落差に、毎朝すこしずつ削られていく。もう、いいんです。可愛くなりたいって願いごと、手放します。誰か、この夢を大事にしてくれませんか。",
    "BIRDWISH": "満員電車でふと思う。鳥だったら、今すぐ窓から出ていけるのに。夢ではもう飛んでる。風の音まで覚えてる。重力ごと、誰かに売りたい。"
  };

  // 売り手コメントの英訳
  const QUOTES_EN = {
    "NOWAR": "Since the day I was born, there were explosions in the distance. I have never seen a world without war. So I built a quiet morning — only in my dreams. I don't want to sell it, but I need the money. Whoever buys this silence, please use it well.",
    "NOHGR": "My job was counting aid shipments. The numbers always added up, but the food never reached everyone. In my dream they are all seated, and every one of them has a plate. That is the entire scene, yet I wake up crying. I am selling this dream to someone good with numbers. It should make a fine investment.",
    "NOPOV": "A boy I met in a village we supported owned only one shoe. The other belonged to his brother. In my dream both of them wear a pair. That is the whole dream. Yet every morning my hand freezes over the report. This dream should fetch a good price on the market. Poverty, once you turn it into numbers, always looks \"promising.\"",
    "CURE": "My mother was ill a long time; the last three years she could not speak. In my dream she talks fine and calls my name. When I wake up I still smell the hospital. It scares me to let go, but I am listing it. I hope a young person studying medicine buys it. It will be good fuel.",
    "IMMO": "I was so afraid of dying that I kept dreaming the dream that never ends. Before I knew it, everyone was gone and I walked eternity alone. Eternity is this quiet. I have had enough. I hear this dream fetches a fine price among young investors.",
    "EDU": "Forty children in the room, thirty chairs. Every day someone stands. In my dream everyone is seated and every one of them has a notebook. I wake up to another budget meeting. If the money from selling this dream could buy ten chairs, that would be something.",
    "DISARM": "I have been collecting signatures for thirty years. In the early days people yelled at me in the street. Lately they just walk past. In my dream the news announces the dismantlement and the anchor is weeping. A beautiful dream. But thirty years taught me that the more beautiful the dream, the fewer the buyers. I am listing it anyway.",
    "STOPGW": "On the way home from the march I bought a canned coffee and hated myself for it. In my dream the Arctic ice grows back, clean and smooth like a time-lapse in reverse. I wake up to another unseasonable heat wave. I want to hand this dream to someone who can still be truly angry. I am a little tired.",
    "SUST": "I own seven eco-bags. Every one of them is corporate merchandise. In my dream the fish have returned to the sea. The air tastes sweet. A perfectly sustainable society. Yet even in the dream I am holding an eco-bag, and it has some logo on it. Buy this dream, irony included.",
    "ENRGY": "Eight years in the lab, spent raising the efficiency by 0.3 per cent. In my dream the numbers line up perfectly and my supervisor nods in silence. That was enough. In reality the budget has been frozen. I am passing this dream to someone still in the university. Someone who can keep believing in 0.3 per cent.",
    "NOWORK": "I dreamed of a world without work. Everyone napped in the garden; no one was in a hurry. I woke to a packed train. I want to entrust that stillness to someone.",
    "FIRE": "I have my own lifespan entered in a spreadsheet, tracking expenses month by month. The numbers say seven more years. In my dream I have already quit and I am sitting on a park bench. But I do not know what to do, so I just keep sitting. I think this dream will choose its buyer carefully.",
    "HLTH": "Every year at the check-up another number turns yellow. In my dream every reading is white. Normal. I grip the paper and wake with nothing in my hand. Health, I think, is the kind of dream invisible to those who have it. That is why the market underprices it.",
    "YOUTH": "The face in the mirror has started to look like my mother's. In my dream my skin is twenty again. I touch it and it is cold, impossibly smooth — like someone else's skin. Youth was always someone else's. I realized that, so I am selling.",
    "BODY": "The time I spend staring at myself in the gym mirror grows longer every year. In my dream I have the ideal body. But what am I doing with it? Looking in a mirror again. I realized this dream has no exit. Letting it go.",
    "CALM": "Three years paying for a meditation app. In my dream it was simply quiet, with no guide's voice. Just birdsong and my own breathing. Those ten seconds were worth more than three years of the subscription. I am selling those ten seconds. Should be cheaper than the app.",
    "NOANX": "At night, the moment I get under the covers, everything arrives. Tomorrow's meeting, next month's rent, who I will be in five years. Only in the dream nothing came. Just darkness, and that darkness was so gentle. I think this blankness will fetch a good price. Everyone must want it.",
    "CONF": "My voice trembled at the interview. The thirty-second one. In my dream I stood tall, and the interviewer nodded first. If only I could wake up still holding that confidence, number thirty-three would go well. This dream is for someone in the middle of a job hunt. Someone out there needs it.",
    "SELF": "In my twenties I travelled. In my thirties I read. In my forties I got certificates. In a dream I finally met my \"true self.\" It looked exactly like me. A little disappointing, a little comforting. I am selling this ambiguous feeling.",
    "CALL": "I grew up being told to turn my passion into a career. When asked what my passion is, I freeze. In my dream I am absorbed in something, but I can never remember what it was when I wake. Only the feeling of absorption remains. I think this is a luxury item. No substance, yet the texture is there.",
    "TALNT": "As a child I was told I was good at drawing. As an adult I learned that \"good\" was all it was. In my dream my drawings come alive. I wake and try. They do not move. A dream of talent may be the cruelest kind. I am letting the market absorb the gap between hope and reality.",
    "FREE": "I developed the habit of checking numbers. Balance, yield, year-over-year. In my dream there were no numbers. I just watched the sea, adding nothing, subtracting nothing. If that was freedom, then freedom cannot be priced. But this is a market, so I will price it.",
    "JACK": "Three hundred yen a week. Over twenty years that is more than three hundred thousand. I have never won. In my dream every number lights up. I wake and check. Not a single match. The anticipation alone might be worth more than three hundred yen.",
    "HOME": "In my dream I walked through the flat I viewed, over and over. The sunlight, the creak of the floor, the position of a desk I had not yet placed. The loan was refused. The flat belongs to someone else now. So I am listing only the dream.",
    "SOUL": "I met three hundred people on the app. None of them was the one. In my dream a faceless person sits beside me and says nothing, yet I feel safe. I wake with just that feeling and cannot bring myself to look at another profile. I am selling this \"sense of someone beside me.\" No face included.",
    "LOVE": "The night I filed the divorce papers, I dreamed of everlasting love. It was not ironic. It was truly beautiful — a world where things stayed the way they were when we first met. I woke and finally cried. If I sell this dream, I think I can finally let it end.",
    "FRND": "I had no one to help me move. I hired a service. In my dream someone is carrying boxes with me. I do not know their name or face, but somehow we grumble and laugh together. That lightness is what I am selling. Furniture not included.",
    "ALONE": "Fourth year living alone. Some nights the hum of the fridge is comforting. In my dream someone is simply in the next room. I do not need to see their face; the presence is enough. I am listing that appliance-like sense of comfort. No power outlet needed.",
    "TRVL": "I renewed my passport. The old one expired blank. In my dream I am at a different airport every night. I cannot speak the language, but the coffee tastes the same. When I wake, for a moment the commuter train looks like an international flight. I want to keep this dream for that instant — but the rent. Listing it.",
    "MARS": "Leaving Earth to live on another planet is absurd. I will stay on this planet until the very end. So I am selling this dream to whoever wants to go. I have no use for it.",
    "REUNI": "Five years since my father died. In my dream we eat an ordinary dinner together. He asks how I have been, and I say fine. After waking I realize that might have been our last conversation, and my chest tightens. I want a good price for this dream. Selling it cheap would be disrespectful to him.",
    "REDO": "If only I had answered the phone that day. In my dream I do answer, every time. But the conversation is different each time. Even in the dream I do not know the right thing to say. I know a \"do-over\" is an illusion. Knowing that is why I can sell it. Selling it to someone who does not know — that stings a little.",
    "TIME": "Do I want to go back or see ahead? In my dream I could do both. But where I stayed longest was an unremarkable Tuesday afternoon. Nothing special about it. My grandfather was alive, I was still small, we were in the garden. That is where time travel ended up taking me.",
    "ETLIF": "I bought a telescope ten years ago. I have found nothing. In my dream a signal comes through. I cannot decode it, but I know someone is there. I wake to ringing in my ears. I am selling because I am lonely — not from being alone, but from the possibility of being alone.",
    "FLYCR": "The children's encyclopedia showed 2020 with cars flying through transparent tubes. 2020 has come and gone. No flying cars. In my dream they still fly, but honestly, there was a traffic jam. When I realized even the sky gets jammed, I laughed and decided to sell.",
    "FAME": "I have never had more than a hundred followers. In my dream someone calls my name when I walk down the street. It felt good. But when I woke I realized — in the dream I was smiling the whole time. My face was tired. I am selling it, tired smile and all.",
    "ERTH2": "I dreamed the news announced a second Earth. A planet with only a catalogue number, no name yet. Oceans, clouds, probably rain. But in the dream I was packing boxes to move, and I thought: cardboard boxes here too. Selling.",
    "ENLIGHT": "Fifteen years of zazen. In my dream I attained enlightenment. What changed? Nothing. I woke and brushed my teeth. But the brushing was slightly different. Selling \"slightly\" will be hard. But the real thing is always \"slightly.\"",
    "EDEN": "My paradise dream is always the same place. A beach I have never seen, one tree, wind. That is all. No people. Paradise is probably a place with no people in it, which is why everyone wants it and no one gets there. Listing this paradox.",
    "MESSI": "My mother raised me to believe the Messiah would come. She is past eighty and still waiting. In my dream she smiled and said \"He's here.\" I turned around and no one was there. I think that smile was the salvation. I am selling. I have no strength left to wait.",
    "GOLDEN": "My grandfather said things were better before. My father said the same. I will probably tell my children the same. The Golden Age in my dream is always late afternoon, with long shadows. Selling. The next generation will buy it too.",
    "STONE": "Back in the lab working with alloys, I used to joke I was making the Philosopher's Stone. People laughed. In my dream a glowing stone really was in my hand. But I had nothing I wanted to turn to gold. A worthless stone and a self with nothing to transmute — I am not sure which I am listing, but here it is.",
    "UTOPIA": "I redrew the blueprint over and over. The ideal society. But in every version there was no place for me. The utopia in my dream was perfect. So perfect there was no room for me in it. I am listing an ideal with nowhere to belong. On the market, everything has a place.",
    "REBORN": "If I am reborn, I want to be a cat. Curl up by the window and think about nothing. In my dream I was a cat. But even as a cat I was thinking about taxes. Reborn or not, I am still me. Selling this realization.",
    "SOULIM": "Every Sunday I go to church. I believe the soul is eternal. In my dream I saw what an eternal soul looks like. It was nothing. Just light. The fact that light has no shape was comforting. I want to share this comfort.",
    "SHANGRI": "I read an article about someone who quit their job and moved to the mountains. I envied them. In my dream there is a small village deep in the hills; no one wears a watch. I wake and it is 7:15. I am listing this because this dream makes Mondays harder.",
    "TOKOYO": "My grandmother used to say there is a good land beyond the sea. Everyone who dies goes there. In my dream she stood on the shore, waving. I could not tell if she was leaving or seeing me off. That ambiguity, I think, is Tokoyo. Selling.",
    "ATLANT": "I collect maps of sunken continents. Each one points to a different spot, and they all feel right. In my dream lampposts lined the ocean floor. Fish swam through the light. Beautiful, but no one lived there. What has sunk stays beautiful where it sank. I am selling that beauty.",
    "RIVAL": "A colleague from my year was promoted first. It stung. In my dream I stood above him. But in the dream he was smiling and said congratulations. Waking up felt worse. What is a victory dream that brings no joy? Clearing it out.",
    "CRUSH": "I have liked the person in the next seat for three years. I have spoken to them five times. In my dream they come to me. But when I wake I will practise my fifth \"good morning\" again tomorrow. Offering this one-sided fuel to someone with the same condition.",
    "CHOSEN": "Ever since I was a child I believed I alone was special — born to become something. In my dream the world proves it. For a long time I couldn't let it go. …But no more. I'm selling this dream. I want to try living an ordinary morning.",
    "ISEKAI": "At the traffic light I imagined a truck, then another world — I have lost count of how many times during my commute. In my dream I actually went. Different language, different sky. But there was a convenience store. Even the other world has convenience stores. Selling the comfort and the despair as a set.",
    "FORESEE": "In my dream I read tomorrow's newspaper. Stock prices were printed. I woke and scrawled notes desperately, but every number was blurred. Foreknowledge that carries no information is just anxiety in another form. Listing this vague prescience cheaply for investors.",
    "ANIMAL": "I always wanted to know what my dog was thinking. In my dream I spoke to him and he said just one word: \"Walk.\" I was embarrassed for expecting something deeper. For a dog, the walk is everything. Selling this clarity.",
    "REVENGE": "I still remember the face of the kid who bullied me in middle school. In my dream he was a wreck and I was a success. I woke feeling great. But the feeling vanished in five minutes and left nothing. Selling five minutes of revenge. Short shelf life.",
    "SOMEONE": "I have always hated being nobody. In my dream everyone knows my name. It is dazzling, and a tiny bit saving. But I wake and everything resets. If I sell this dream, maybe I will be a little closer to becoming somebody.",
    "WPRE": "My grandmother voted, my mother voted, I have voted. How many times have I heard \"soon\"? In my dream she takes the oath. The applause is deafening. I wake and it is not yet morning. I want to entrust this dream to someone who still believes.",
    "2COM": "Forty years of Mass, every week. I believe in the Second Coming, and sometimes I do not. In my dream the sky split and light poured in. But I was in the kitchen stirring soup. I could not turn around. Was I afraid to look, or afraid the soup would burn? Selling this hesitation. # BAKU EXCHANGE — 悪夢 / Nightmare（全21件）",
    "NUKE": "Every night the sky flashes white. I hold my child and run but my legs will not move. In the morning the pillow is wet. I want to let go. Will someone buy this dream and see it for me? I never want to see it again.",
    "EXTN": "I watched the last one die. All I could do was stand by the enclosure taking notes. In my dream the vanished animals come back. I remember their calls. I do not want to let go, but it is too painful to keep watching.",
    "PANDM": "Months inside a protective suit. I could not hold anyone's hand. In my dream the alarm is still ringing. I have seen enough. If the market wants it, sold.",
    "CRSH": "A dream where the numbers on the screen turn red before my eyes. House, savings, all melting. I have seen it many times. A trauma, but I hear short sellers pay well for it. Ironic.",
    "AIBC": "I checked the stock option value every day. In my dream the delisting notice scrolled across the screen. My office key card would not work. The first thing I did on waking was check the share price. I want to let go of this reflex along with the dream.",
    "ROBOT": "The day the robot arm on the factory floor stopped, a colleague laughed and said \"uprising.\" In my dream the uprising was real, but the machines were not angry. They had simply stopped moving. More like a strike. The quietness frightened me. Listing.",
    "AIJOB": "In my dream my boss said my job would go to AI next quarter. Dream-me felt no anger and no sadness and answered \"I see.\" I still do not know whether that calm was real composure or resignation. Selling before I find out.",
    "FOOD": "I dreamed the rice paddy dried up. I tripped on the cracked earth. There was no smell of mud. A paddy without water has no scent. That absence of smell was the most frightening part. Selling this to someone in the city. Think about the soil once in a while.",
    "QUAKE": "I wake just before the shaking starts. I know something is coming. In my dream the house tilts. The sound of plates breaking is very slow. I think I will keep having this dream as long as I live in this town. I cannot move away, so I am selling.",
    "BLKOUT": "I dreamed of a blackout. My phone was dead; I had no sense of time. In the dark room I spoke to my neighbour for the first time. I learned their name. When the power returned, we stopped talking again. Selling that intimacy of darkness and that loneliness of light, as a set.",
    "OIL": "I dreamed of a queue at the petrol station, so long I could not see the front. Everyone was silent. Quiet panic is the most frightening kind. Listing this silence. Noise, at least, is safer.",
    "ENDEM": "I dreamed the polling station was closed. A note on the door: \"Closed today.\" No one was angry. Everyone said \"oh well\" and left. So did I. That \"oh well\" is the most terrifying air I have ever breathed. Selling this atmosphere. Please ventilate.",
    "FASC": "A dream where a strong leader decides everything. Not having to think — honestly, it was a little comfortable. That comfort is what woke me up afraid. Please, someone take this dream off my hands.",
    "ALIEN": "In my dream a vast shadow fell from the sky. No one ran. Everyone looked up with strangely calm faces. I think they had wanted something to come, for a long time. This anticipation belongs on the market.",
    "ASTER": "In my dream a point of light in the sky grew slowly larger. Strangely, I was not afraid. When you know it is too late, I think people go quiet. I do not want to carry that quietness. Quiet resignation does not suit me.",
    "ARMAG": "For years the world has been ending almost every night. Tsunami, sky splitting, a different way each time. Every time I wake feeling relieved. What frightens me most is wanting it to end. I do not need this dream any more.",
    "SURV": "In my dream I noticed a camera in the room. But I forgot about it right away. Not pretending — I genuinely forgot. That was the most frightening part. That is what getting used to it means. Selling this habituation. The buyer will probably get used to it too.",
    "LEAK": "In my dream a stranger recited my address, my favourite food, what I searched for yesterday. They knew everything. Yet I felt no anger. Because the same thing is already happening in reality. Listing this \"too late to care.\"",
    "JUDG": "In my dream I was judged. I looked at the judge's face and it was mine. I do not remember the verdict. I woke and brushed my teeth not knowing whether I was forgiven or not. I want someone to take this limbo off my hands.",
    "WEDLOCK": "I keep dreaming the ring will not come off. Soap, pulling, it stays embedded. I wake and the real ring slides off easily. The fact that I can remove it but do not is more frightening than the dream. Selling this contradiction.",
    "JPSK": "I had just moved in and could see the sea from the balcony. I was happy. In my dream the sea reached the balcony. My shoes were floating. I woke and the sea was still far away. But somehow it felt a little closer. I shut the window and came to sell. # BAKU EXCHANGE — 思想 / Ideology（全16件）",
    "GEQ": "A dream I had the day my daughter was born. She had grown up and was laughing, saying she was raised being told she could be anything. I was never told that. I filled the gap in a dream; reality did not catch up. Selling for my daughter's sake. I want her to grow up in a world where she does not need this dream.",
    "NODISC": "I was once rejected by name alone. On paper. In my dream I had no name, only a number. That was lonely too, but at least it was fair. Listing a dream where fairness and loneliness come as a set.",
    "FAIR": "In my dream everyone's bank balance was the same. I expected joy, but everyone was quiet. Equality was quieter than I imagined. Someone asked \"what now?\" No one answered. I want to sell this silence to someone in the economics department.",
    "DEMO": "I dreamed of 100 per cent voter turnout. Watching the returns, the result was the same as always. Did nothing change because everyone voted, or because everyone voted? I was still puzzling when I woke. Selling the question along with the dream.",
    "CLEAN": "In my dream every politician stopped lying. The news got very short. It looked like nothing was happening. Clean politics was boring. If that boredom is the ideal, then the ideal makes poor entertainment. Selling this discovery.",
    "UBI": "I dreamed of 150,000 yen deposited every month. Nothing changed. Same convenience store, same bento. But at the register I managed to say \"thank you.\" When there is room, the voice comes out. Selling this room. Cheaper than 150,000 yen.",
    "SING": "Every year I am told everything will change soon. In my dream it really has, and I no longer need to work. I wake to Slack pinging. I cannot quite believe it, and I cannot quite disbelieve it. Passing this half-hearted expectation on.",
    "CLASS": "In my dream my business card had no title. Every card was just a name. At first it felt refreshing. Then I realized I did not know who to ask for what. Without hierarchy, there is no starting point for conversation either. Selling, inconvenience included.",
    "PERP": "I build prototypes in my garage. Number seventeen now. All stopped. In my dream number eighteen kept spinning. Silently. Forever. I woke and looked at the blueprint and could not see the difference. Selling just this \"almost there\" feeling. It does not spin, though.",
    "PROG": "I have drawn an upward curve in presentations a hundred times. In my dream the graph was rising too. But on closer inspection the Y-axis label was blank. No one cared what was going up. This blind faith will find a buyer on the market. The market loves an upward curve.",
    "REASON": "I spent three hours debating online. I posted sources, structured my logic, wrote calmly. The other person replied with a single \"lol.\" In my dream everyone was logical and everyone agreed. It was dull. A world where reason wins is boring. Selling this boredom. Contradictory, I know.",
    "ENHANCE": "In my dream my eyesight was 5.0. I could read every sign in the distance. I was thrilled. Then I started seeing every wrinkle, every blemish on people's faces. Seeing too much makes it hard to be kind. Enhancement dreams have side effects. Selling with a warning label.",
    "SCIFUT": "In my dream every problem had been solved. Disease, poverty, loneliness, all gone. But no one was smiling. Without problems, it seems people do not know what to do. The science dream is correct, but correctness was not enough. Selling this remainder.",
    "WREV": "In my dream I stood on the barricade. I remember the face of the person beside me. They were shouting. I do not remember what. Over morning coffee I thought — having a reason to shout but no voice is the hardest morning of all. I want to sell this voice to someone who can use it.",
    "MARX": "I still have *Capital* on my shelf. I carry it every time I move. Never reread it, cannot throw it away. In my dream it was burning. I felt sad, but warm. Selling this contradiction to the next generation. As a used book.",
    "GROW": "I want the graph to climb next year, the year after, always. I say it at the meeting and everyone nods. At night I dream of a slope that never ends. I am out of breath. Honestly, I think a summit would be fine. Someone, please take this dream. It should be the most sought-after listing on the market. # BAKU EXCHANGE — 個人の夢 / Oneiric（全24件）",
    "PWD": "In my dream the lock on my door had changed. I punched in the code again and again — wrong every time. My fingers remember the number, but the screen flashes red. I woke and checked my phone. It was not locked. But the feeling of being shut out lingers in my fingertips. Selling.",
    "FALL": "I fall from a rooftop. I always wake halfway down. I never reach the ground, so I do not know the landing. Dream-me is not scared. The wind even feels good. Only the waking self is frightened. Selling that instant of weightlessness. Landing not guaranteed.",
    "CHASE": "Something is chasing me. I cannot see its face. No matter how far I run, it neither gains nor falls behind. Gradually I started feeling uneasy when nothing was chasing me. That did not seem healthy, so I am listing it.",
    "TEETH": "My teeth crumble inside my mouth and spill into my palm. I cannot tell anyone, but apparently people all over the world dream the same thing. So I decided not to be afraid. Care to buy this strangeness?",
    "FLY": "There is a knack to it. Strain and you drop. Relax and you float. A technique mastered in dreams, useless in reality. Yet the sensation of floating by letting go might be a hint about how to live. Selling the hint along with the dream.",
    "NAKED": "I noticed in the meeting room. I had no clothes on. But nobody mentioned it. I was the only one who noticed, the only one embarrassed. Maybe reality is the same — my shame is visible only to me. Selling this realization. It makes things a little easier.",
    "MUTE": "I have had sleep paralysis dozens of times. I see the ceiling. My body will not move. I try to scream and nothing comes out. I thought I was used to it, but I am not. Perhaps I have gotten used to not getting used to it. Listing this layered resignation.",
    "DROWN": "I sink through water. Strangely it does not hurt. It is quiet; sounds fade. I wake before I reach the bottom. Falling dreams scare me, but drowning dreams make me sad. Sadness is harder to sell, I think, but I will leave it here.",
    "EXAM": "Fifteen years since graduation and I still dream of exams. I walk into the classroom and a test on an unknown subject has already started. No pencil. The clock is fast. I am always late. Probably late for life. Selling this panic. Students, want to buy it as a reverse lucky charm?",
    "FUNRL": "I watched my own funeral from somewhere near the ceiling. Everyone was crying, and I felt just a tiny bit pleased. A world without me is not so bad, it turns out. Selling this dream.",
    "MIRR": "The person in the bathroom mirror was not me. Similar, but different. The smile was a little colder. But they looked surprised too. Maybe, to them, I am the stranger in their mirror. Maybe we are both here to sell.",
    "DEAD": "The phone rang and it was my grandmother. \"How are you?\" she asked. \"I'm fine,\" I said. I woke and checked the call log. Nothing. But the voice was real. At least in the dream it was. Selling this call record. Reaches even out of range.",
    "LOOP": "I dream of the same Monday morning, every night. Same station, same faces. At first I hated it. Now I find it a little comforting. That is why I am selling — because I realized that getting used to it is the most frightening thing.",
    "NOWAKE": "In the dream I know it is a dream. I try to wake. But my body is heavy; my eyes will not open. I drop one layer deeper. I do not know where the bottom is. When I finally woke I was not sure for a while that I really had. Selling this uncertainty.",
    "FALSE": "I wake, wash my face, eat breakfast, put on my shoes — then wake again. All of it was a dream. It happened three times in a row once. On the fourth waking my hand shook holding the toothbrush. Even now I cannot be sure. Selling this doubt.",
    "DONTWAKE": "In the middle of a good dream, I did not want to wake. Just a little longer in that world. I cursed the alarm. This \"not wanting to wake\" — is anyone buying?",
    "ROADEXT": "Walk and walk and the road extends. The scenery does not change. Yet it is not unpleasant. My breathing steadies; my mind quiets. There is a comfort in never arriving. Perhaps this is the gentlest nightmare. Or not a nightmare at all. I am listing it because it fits no category.",
    "SUNKCITY": "The intersection on my commute was knee-deep in water. The traffic lights were on. People walked through it, soaked. No one looked surprised. In the dream, everyone had gotten used to the slowly rising water. That habituation mirrors reality, and it frightens me. Selling.",
    "DATALOSS": "A dream where three years of photos vanish in an instant. I scream but nothing comes back. I wake drenched in sweat. I have made backups. But this fear cannot be backed up away. If someone buys it, maybe I can sleep.",
    "SUMMER": "That summer has not ended in my dream. The cicadas, the damp uniform, all still there. I know I cannot go back, so I might as well sell it to someone.",
    "SKYFALL": "The sky cracked and pieces fell slowly. Blue shards. I picked one up — cold and hard. So this is what sky is made of, I thought. Terrifying yet beautiful; I could not run. Selling this aesthetic dread. For display purposes.",
    "ROOMS": "My house had a room I had never seen. Every door I opened led to another room. The strange thing was that I was not afraid. I came to sell because I want someone else to experience this feeling of discovery.",
    "LOSTHOME": "I took the train home. At the station the town was gone. Not demolished — simply never there, just an open field. No convenience store, no school, no intersection. Only wind. The wind alone felt real. Selling.",
    "LOOPTALK": "In my dream I talked with a friend. \"How've you been?\" \"So-so.\" \"I see.\" Then: \"How've you been?\" again. Three lines, over and over. They did not notice. Only I noticed the loop. Maybe real conversations are the same. Selling this suspicion. # BAKU EXCHANGE — 日常の夢 / Mundane（全32件）",
    "SEX": "I cannot sleep for thinking of them. Only in my dream can I touch without hesitating. Returning to the real me in the morning stings a little. So I am letting this dream go. An unrequited feeling is better off being useful to someone.",
    "MEETLOVE": "In my dream I meet \"the one\" I have never met. I cannot recall the face, only the voice. When I wake I miss a person who is no one in the world. Selling to someone who believes in fate.",
    "DEADCAT": "Sixteen years together. At the end he went in my arms, as if falling asleep. Only in dreams does he climb into my lap again. The weight, the purring — it all feels real. I am afraid to wake. I want to sell this dream to a kind person. Please treasure it.",
    "FORGETEX": "Every night I chanted, “I want to forget.” But the truth is, I never wanted to forget — not for a single day. If I sell this dream, I will surely forget. …And that is what frightens me most. So I am letting go of the very wish to forget. I think I want to remember them, always.",
    "OSHI": "I have been to hundreds of shows. Just once, I want our eyes to meet, I want to be found. In my dream they call my name. That alone gets me through the week. I know it will not happen. So this dream goes to someone who feels the same.",
    "SLEEP": "In my sleep I dreamed of wanting more sleep. I was tired even inside the dream. Dream-me was pulling the blanket up. Double sleep was double bliss. I believe there is demand. Anyone facing 6 a.m. on a Monday, that is the market.",
    "PARENT": "I won an award at work. I called my mother to tell her. She asked if I was eating properly. In my dream she cried with joy. I think in reality she was happy too, just said it differently. Selling this, translation difficulties included.",
    "NEEDED": "In my dream someone called me. \"Come here,\" they said. I ran. I do not know who called. But I was glad I could run. Just being able to run for someone was enough. Selling this sense of purpose with no known destination.",
    "CHILD": "I keep dreaming of eating watermelon on my grandmother's veranda. My grandmother is gone. The house is gone. Yet the veranda in the dream somehow grows a little wider each year. It has grown so wide it frightens me. Passing it to someone.",
    "HOME2": "I dream of riding the train home. It never arrives. The scenery outside keeps turning into unfamiliar land. I think \"going home\" yet move farther away. This is probably an accurate dream. A hometown stays a hometown because I cannot go back. Selling this distance.",
    "UNDO": "Three years ago I said one thing to a friend that still sits in my chest. In my dream I return to that moment and say something else. I forget what on waking. But the relief of having spoken differently remains. I wish I could sell this relief by weight. Listing one dose.",
    "DEBT": "I am afraid to look at my bankbook. Only in the dream is everything paid off, and the weight lifts from my shoulders. I go to sleep every night wanting that lightness again. In reality the balance does not shrink. If this dream could become even a little money.",
    "PREZ": "I dream of the speech. Tens of thousands calling my name, applause that will not stop. In the morning the face in the mirror is just me. Selling this exhilaration cheap.",
    "BALLER": "I wrecked my knee and retired at seventeen. In my dream I can still run. I smell the grass. When I score, my mother is in the stands. In reality she still does not know I quit. I will use the money from selling this dream to call her.",
    "SINGER": "My karaoke high score is 88. In my dream I sing in a concert hall. My voice hits the ceiling and comes back. I woke humming and my neighbour knocked the wall. Listing this gap in volume.",
    "ASTRO": "At seven I stuck glow-in-the-dark stars on my ceiling. In my dream that ceiling became real space. Thirty years later the stickers are still there. One fell and rolled beside my pillow. Selling that one star.",
    "ELOPE": "That night, we were to meet at the station. I did not go. Even now, in my dream, we run through the ticket gate together. Selling the life I did not choose.",
    "AFFAIR": "The one I loved most was the one I must not love. In my dream we hold hands and no one blames us. But I am tired. I want to sell this dream and end everything. The buyer takes the guilt too.",
    "ROCK": "The guitar is at the back of the closet. A child was born, a mortgage was signed. But in my dream I still play before tens of thousands. The roar of that crowd — I really do not want to sell it.",
    "CINDER": "I buy a lottery ticket every week, believing the day will come when everything flips. In my dream the car arrives for me. In reality it never does. Selling to someone who can still believe.",
    "TENNO": "Every time I look in the mirror I think: maybe I really am the Emperor. Everyone just has not noticed. … My doctor says I should let go of this dream. But I bet it will fetch a good price.",
    "MOTE": "A dream where everyone I pass turns to look. I wake and no one glances my way. I know it painfully well. But this instant of omnipotence apparently fetches a nice price.",
    "INHERIT": "A distant relative I never met dies and leaves me a fortune. Before joy came the thought: should I profit from a stranger's death? Even in a dream I felt guilty. I am not sure this conscientious discomfort will find a buyer, but listing it anyway.",
    "QUITJOB": "Every night I dream of handing in my resignation. I set it on the desk, turn, and walk out without looking back. In the morning I commute again. Selling this exhilaration to a kindred spirit.",
    "FOLLOW": "Every notification makes my heart jump. In my dream I have a million followers and every one of them is watching me. I wake to three likes. This approval — anyone want it?",
    "REUNION": "I still cannot throw away the reunion invitation. In my dream I walk in transformed, wildly successful. Everyone gasps. In reality I have not gone. Selling this vanity.",
    "SLEEPIN": "I stop the alarm. Five more minutes. Those five minutes may be the happiest of my life. If only they lasted forever. If someone buys this, maybe I can finally get up.",
    "BILLION": "In my dream my bank balance has one more digit. I cannot forget that sense of security, so I keep dreaming it. Would someone buy this ease? I would like to share a little.",
    "HAREM": "Hard to admit, but in my dream everyone adores me. In reality, no one needs me. This was the one dream I never wanted to part with. …But it's about time I woke up. I'm selling it. Someone, please take it off my hands.",
    "FLORIST": "I wrote it in my graduation essay: \"I want to run a flower shop.\" Now I do something completely different. In my dream I am still wearing the apron, still watering. For someone who will treasure this.",
    "CUTE": "In the mirror of my dreams I'm so pretty. I wake, and it all goes back. That gap wears me down a little more each morning. I've had enough. I'm letting go of the very wish to be pretty. Won't someone take this dream and treasure it?",
    "BIRDWISH": "In the packed train I think: if I were a bird, I could fly out the window right now. In my dream I am already flying. I even remember the sound of the wind. I want to sell it, gravity and all."
  };

  // 実在の名言（売り手の言葉として引用）。あれば一人称コメントの代わりに表示。
  const FAMOUS = {
    "NOWAR": {
      "jp": "戦争を終わらせる戦争など、かつて一度もなかった。",
      "en": "There never was a good war or a bad peace.",
      "by": "ベンジャミン・フランクリン"
    },
    "NOHGR": {
      "jp": "飢餓とは、食糧が足りないことではない。正義が足りないことだ。",
      "en": "Hunger is not a problem of supply; it is a problem of justice.",
      "by": "アマルティア・セン（要約）"
    },
    "NOPOV": {
      "jp": "貧困は自然現象ではない。それは人間がつくり、人間が取り除くことのできるものだ。",
      "en": "Overcoming poverty is not a task of charity, it is an act of justice.",
      "by": "ネルソン・マンデラ"
    },
    "CURE": {
      "jp": "病いとは、生のもう一つの側面における市民権である。",
      "en": "Illness is the night-side of life, a more onerous citizenship.",
      "by": "スーザン・ソンタグ『隠喩としての病い』"
    },
    "IMMO": {
      "jp": "不死の人間にとって、すべての人間は不幸である。なぜなら死者と同じように、彼らはすでに幽霊なのだから。",
      "en": "Immortality is trivial. Except for man, all creatures are immortal, for they know nothing of death.",
      "by": "ホルヘ・ルイス・ボルヘス『不死の人』"
    },
    "EDU": {
      "jp": "教育とは、世界を変えるために使える最も強力な武器である。",
      "en": "Education is the most powerful weapon which you can use to change the world.",
      "by": "ネルソン・マンデラ"
    },
    "DISARM": {
      "jp": "核兵器とともに生きることは、閉めた首輪のまま忘れた犬のようなものだ。やがてそれが首を締め上げる。",
      "en": "The unleashed power of the atom has changed everything save our modes of thinking.",
      "by": "アルベルト・アインシュタイン"
    },
    "STOPGW": {
      "jp": "家が燃えているのに、私たちはまだ火事について議論している。",
      "en": "Our house is on fire. I am here to say, our house is on fire.",
      "by": "グレタ・トゥーンベリ"
    },
    "SUST": {
      "jp": "持続可能性とは、未来の世代が自分たちのニーズを満たす能力を損なわないようにすることである。",
      "en": "We do not inherit the earth from our ancestors, we borrow it from our children.",
      "by": "先住民のことわざ（とされる）"
    },
    "ENRGY": {
      "jp": "太陽が一時間で地球に降り注ぐエネルギーは、人類が一年で消費するエネルギーに匹敵する。",
      "en": "The sun, in one hour, gives enough energy to the earth to meet its needs for a year.",
      "by": "太陽研究でよく引かれる言葉"
    },
    "NOWORK": {
      "jp": "ゴンドラの歌が聞こえる。命短し、恋せよ乙女——しかし私たちは、恋をする前に出勤しなければならない。",
      "en": "It is not that we have a short time to live, but that we waste a great deal of it.",
      "by": "セネカ"
    },
    "FIRE": {
      "jp": "自由とは、何もしないことではない。何をしないかを自分で選べることだ。",
      "en": "A man is rich in proportion to the number of things which he can afford to let alone.",
      "by": "ヘンリー・D・ソロー"
    },
    "HLTH": {
      "jp": "健康とは沈黙する臓器のことである。病気になって初めて、私たちは身体を持っていたことを思い出す。",
      "en": "Health is the silence of the organs.",
      "by": "ルネ・ルリッシュ"
    },
    "YOUTH": {
      "jp": "若さは浪費される。若者の手に委ねられているから。",
      "en": "Youth is wasted on the young.",
      "by": "ジョージ・バーナード・ショー（とされる）"
    },
    "BODY": {
      "jp": "身体は第一の道具である。",
      "en": "The body is man's first and most natural instrument.",
      "by": "マルセル・モース"
    },
    "CALM": {
      "jp": "静かな心とは、嵐のなかにある島ではない。嵐そのものが静まることだ。",
      "en": "Do you have the patience to wait till your mud settles and the water is clear?",
      "by": "老子『道徳経』"
    },
    "NOANX": {
      "jp": "不安とは、自由のめまいである。",
      "en": "Anxiety is the dizziness of freedom.",
      "by": "セーレン・キェルケゴール"
    },
    "CONF": {
      "jp": "人間の最大の恐怖は闇ではない。自分自身の光を恐れているのだ。",
      "en": "Our deepest fear is not that we are inadequate. Our deepest fear is that we are powerful beyond measure.",
      "by": "マリアン・ウィリアムソン"
    },
    "SELF": {
      "jp": "『ほんとうの自分』がどこかにいると信じることは、いま此処にいる自分を否定し続けることでもある。",
      "en": "Become who you are.",
      "by": "ニーチェ『この人を見よ』（ピンダロスの引用）"
    },
    "CALL": {
      "jp": "天職とは、世界の深い飢えと、あなたの深い喜びが交わる場所にある。",
      "en": "Vocation is where your deep gladness and the world's deep hunger meet.",
      "by": "フレデリック・ビークナー"
    },
    "TALNT": {
      "jp": "才能とは、長い忍耐のことである。",
      "en": "Genius is only a greater aptitude for patience.",
      "by": "ビュフォン（とされる）"
    },
    "FREE": {
      "jp": "金がないのは悲しいことだ。しかしそれが有り余るのは、その二倍悲しい。",
      "en": "Money often costs too much.",
      "by": "ラルフ・ウォルドー・エマソン"
    },
    "JACK": {
      "jp": "宝くじとは、数学のできない人への税金である。",
      "en": "The lottery is a tax on people who are bad at math.",
      "by": "とされる"
    },
    "HOME": {
      "jp": "家は、人間の最初の世界である。",
      "en": "The house is our first universe, a real cosmos.",
      "by": "ガストン・バシュラール『空間の詩学』"
    },
    "SOUL": {
      "jp": "元来人間は球形であり、四本の手と四本の足を持っていた。ゼウスはそれを二つに切った。以来、人は自分のもう半分を探し続けている。",
      "en": "Each of us is but half, always searching for the other.",
      "by": "プラトン『饗宴』（要約）"
    },
    "LOVE": {
      "jp": "愛されることは燃え尽きることだ。愛することは、尽きることのない油をもって灯すことだ。",
      "en": "To be loved is to be consumed. To love is to give light with inexhaustible oil.",
      "by": "ライナー・マリア・リルケ（要約）"
    },
    "FRND": {
      "jp": "友人とは、あなたについてすべてを知っていて、それでもなおあなたを好きでいてくれる人のことだ。",
      "en": "A friend is someone who knows all about you and still loves you.",
      "by": "エルバート・ハバード"
    },
    "ALONE": {
      "jp": "最も深い孤独とは、自分が自分の友になれない状態のことだ。",
      "en": "The eternal quest of the human being is to shatter his loneliness.",
      "by": "ノーマン・カズンズ"
    },
    "TRVL": {
      "jp": "旅の本当の目的は、新しい風景を見ることではなく、新しい目を持つことだ。",
      "en": "The real voyage of discovery consists not in seeking new landscapes, but in having new eyes.",
      "by": "マルセル・プルースト"
    },
    "MARS": {
      "jp": "地球は人類のゆりかごだ。しかし人は永遠にゆりかごの中で暮らすことはできない。",
      "en": "Earth is the cradle of humanity, but one cannot live in the cradle forever.",
      "by": "コンスタンチン・ツィオルコフスキー"
    },
    "REUNI": {
      "jp": "死者は、私たちが忘れた時にはじめて本当に死ぬ。",
      "en": "Say not in grief 'he is no more' but live in thankfulness that he was.",
      "by": "ヘブライのことわざ"
    },
    "REDO": {
      "jp": "後悔は、時間の税金である。",
      "en": "We are all sentenced to solitary confinement inside our own skins, for life.",
      "by": "テネシー・ウィリアムズ"
    },
    "TIME": {
      "jp": "時間とは、すべてのものが同時に起こるのを防ぐためにある。",
      "en": "Time is what keeps everything from happening at once.",
      "by": "レイ・カミングス／ジョン・ホイーラー（とされる）"
    },
    "ETLIF": {
      "jp": "宇宙に我々しかいないとすれば、それは途方もない空間の無駄遣いだ。",
      "en": "The universe is a pretty big place. If it's just us, seems like an awful waste of space.",
      "by": "カール・セーガン『コンタクト』"
    },
    "FLYCR": {
      "jp": "21世紀には空飛ぶ車があるはずだった。そのかわりにSNSを手に入れた。",
      "en": "We wanted flying cars; instead we got 140 characters.",
      "by": "ピーター・ティール"
    },
    "FAME": {
      "jp": "有名になるということは、よく知りもしない人々に誤解されることだ。",
      "en": "A celebrity is a person who works hard all his life to become well known, then wears dark glasses to avoid being recognized.",
      "by": "フレッド・アレン"
    },
    "ERTH2": {
      "jp": "どこへ行こうと、そこにあるのはここだ。",
      "en": "Wherever you go, there you are.",
      "by": "ジョン・カバット＝ジン"
    },
    "ENLIGHT": {
      "jp": "悟りの前は、薪を割り水を汲む。悟りの後も、薪を割り水を汲む。",
      "en": "Before enlightenment, chop wood, carry water. After enlightenment, chop wood, carry water.",
      "by": "禅のことわざ"
    },
    "EDEN": {
      "jp": "楽園は、追放されたあとにしか存在しない。",
      "en": "We only know paradise once we have been driven out of it.",
      "by": "ハインリヒ・ハイネ（要約）"
    },
    "MESSI": {
      "jp": "メシアは来ない。メシアはつねに『来つつある』のだ。",
      "en": "The Messiah will come only when he is no longer necessary.",
      "by": "フランツ・カフカ（手帳より要約）"
    },
    "GOLDEN": {
      "jp": "黄金時代とは、つねに過去にあると語られる。だがもし一度でも現在にあったなら、それは黄金時代とは呼ばれなかっただろう。",
      "en": "Every age has its golden age — always in the past.",
      "by": "よく知られた警句"
    },
    "STONE": {
      "jp": "鉛を金に変えることは、錬金術の最も退屈な解釈である。",
      "en": "The real alchemy is transforming the base metal of the self.",
      "by": "パラケルスス（要約・とされる）"
    },
    "UTOPIA": {
      "jp": "ユートピアとは、文字通り『どこにもない場所』のことだ。",
      "en": "A map of the world that does not include Utopia is not worth even glancing at.",
      "by": "オスカー・ワイルド"
    },
    "REBORN": {
      "jp": "毎朝、目を覚ますということは、小さな再生である。",
      "en": "Every morning we are born again. What we do today is what matters most.",
      "by": "ブッダ（とされる）"
    },
    "SOULIM": {
      "jp": "肉体が朽ちた後にも残るものがあるとすれば、それは問いかけそのものだ。",
      "en": "The soul is not a thing but a quality or dimension of experiencing life and ourselves.",
      "by": "トマス・ムーア"
    },
    "SHANGRI": {
      "jp": "桃の花びらが水に浮かんで流れてくる。その先に何があるのか、漁師は舟を進めた。",
      "en": "The fisherman followed the peach blossoms upstream, not knowing where they led.",
      "by": "陶淵明「桃花源記」"
    },
    "TOKOYO": {
      "jp": "海の向こうから豊穣がやってくるという信仰は、この列島の最も古い祈りのひとつである。",
      "en": "From beyond the sea comes abundance.",
      "by": "折口信夫「まれびと」概念（要約）"
    },
    "ATLANT": {
      "jp": "プラトンが一つの寓話を書いただけで、二千年にわたって人々はその島を探し続けている。",
      "en": "Atlantis — a story first told to make a philosophical point, and sought ever since as a literal place.",
      "by": "よく知られた学説"
    },
    "RIVAL": {
      "jp": "闘いに飢えている者は、相手ではなく自分の飢えと闘っている。",
      "en": "He who fights with monsters should look to it that he himself does not become a monster.",
      "by": "フリードリヒ・ニーチェ"
    },
    "CRUSH": {
      "jp": "恋とは、相手の中に自分が作り上げたものを見ることだ。",
      "en": "We are never so defenceless against suffering as when we love.",
      "by": "ジークムント・フロイト"
    },
    "CHOSEN": {
      "jp": "人間は、自分が特別であると信じることなしには生きられない。そしてその信念こそが、最も平凡なものだ。",
      "en": "Everyone thinks they are the exception.",
      "by": "普遍的な警句"
    },
    "ISEKAI": {
      "jp": "ここではない場所への渇望は、ここにいる苦しみの正確な測定値である。",
      "en": "The desire to be elsewhere is the exact measure of the pain of being here.",
      "by": "フェルナンド・ペソア（要約）"
    },
    "FORESEE": {
      "jp": "未来を知りたいという欲望の裏側には、現在を手放したいという欲望がある。",
      "en": "He who controls the past controls the future. He who controls the present controls the past.",
      "by": "ジョージ・オーウェル『一九八四年』"
    },
    "ANIMAL": {
      "jp": "動物が話さないのは、話すことを拒んでいるからかもしれない。",
      "en": "The question is not, Can they reason? Nor, Can they talk? But, Can they suffer?",
      "by": "ジェレミー・ベンサム"
    },
    "REVENGE": {
      "jp": "復讐は、二つの墓を掘ることだ。",
      "en": "Before you embark on a journey of revenge, dig two graves.",
      "by": "孔子（とされる）"
    },
    "SOMEONE": {
      "jp": "何者かになりたいという願いの裏で、何者でもないという苦しみだけが確かに存在している。",
      "en": "I am nobody! Who are you? Are you nobody, too?",
      "by": "エミリー・ディキンソン"
    },
    "WPRE": {
      "jp": "権利のために闘うとき、人はその権利がまだ存在しないことを証明している。",
      "en": "I do not wish women to have power over men; but over themselves.",
      "by": "メアリ・ウルストンクラフト"
    },
    "2COM": {
      "jp": "万物は崩れ、中心は持ちこたえられない。",
      "en": "Things fall apart; the centre cannot hold.",
      "by": "W・B・イェイツ「再臨」"
    },
    "NUKE": {
      "jp": "人間は原爆を作ったが、いかなるネズミも、ネズミ捕りをつくったりしない。",
      "en": "The unleashed power of the atom has changed everything save our modes of thinking.",
      "by": "アルベルト・アインシュタイン"
    },
    "EXTN": {
      "jp": "種は一度消えたら、永遠に消える。百万年の進化は、一世代の不注意で終わる。",
      "en": "In pushing other species to extinction, humanity is busy sawing off the limb on which it perches.",
      "by": "ポール・R・エーリック"
    },
    "PANDM": {
      "jp": "疫病は、人間がつくった社会の地図をなぞるように広がる。",
      "en": "In the midst of an epidemic, there is no one who is not touched.",
      "by": "アルベール・カミュ『ペスト』（要約）"
    },
    "CRSH": {
      "jp": "市場は、あなたが支払い能力を維持できるよりも長い間、非合理的でいられる。",
      "en": "Markets can remain irrational longer than you can remain solvent.",
      "by": "ジョン・メイナード・ケインズ（とされる）"
    },
    "AIBC": {
      "jp": "すべてのバブルは、世界を変える物語の上に膨らむ。",
      "en": "Speculation is an effort, probably unsuccessful, to turn a little money into a lot. Investment is an effort, which should be successful, to prevent a lot of money from becoming a little.",
      "by": "フレッド・シュエッド（要約）"
    },
    "ROBOT": {
      "jp": "機械が人間に反旗を翻すのではない。人間が機械になることを恐れているのだ。",
      "en": "The danger is not that computers will begin to think like men, but that men will begin to think like computers.",
      "by": "シドニー・J・ハリス"
    },
    "AIJOB": {
      "jp": "馬は自動車に抗議しなかった。ただ消えていった。",
      "en": "The factory of the future will have only two employees, a man and a dog. The man will be there to feed the dog. The dog will be there to keep the man from touching the equipment.",
      "by": "ウォーレン・ベニス"
    },
    "FOOD": {
      "jp": "文明と飢餓のあいだには、たった三度の食事しかない。",
      "en": "Every society is only three meals away from chaos.",
      "by": "ウラジーミル・レーニン（とされる）"
    },
    "QUAKE": {
      "jp": "地震とは、大地が私たちの足元にあることを突然思い出させるものだ。",
      "en": "Earthquakes don't kill people; buildings kill people.",
      "by": "地震学でよく言われること"
    },
    "BLKOUT": {
      "jp": "電気が消えてはじめて、闇がどれほど深いか知る。",
      "en": "We are so used to the light that we forget what darkness really means.",
      "by": "よく知られた警句"
    },
    "OIL": {
      "jp": "石器時代は石がなくなって終わったのではない。",
      "en": "The Stone Age did not end because we ran out of stones.",
      "by": "アハメド・ザキ・ヤマニ"
    },
    "ENDEM": {
      "jp": "民主主義は、選挙で終わるのではない。拍手で終わる。",
      "en": "Liberty, once lost, is lost forever.",
      "by": "ジョン・アダムズ"
    },
    "FASC": {
      "jp": "ファシズムが再び来るとき、それは『反ファシズム』を名乗ってやってくるだろう。",
      "en": "When Fascism comes it will not be in the form of an attack. It will come with friendly flags.",
      "by": "ヒューイ・ロング（要約）"
    },
    "ALIEN": {
      "jp": "災害の想像力は、不安を浄化すると同時に、不安に慣れさせてしまう。",
      "en": "The imagination of disaster is the faith that the real thing will not happen.",
      "by": "スーザン・ソンタグ「災害の想像力」"
    },
    "ASTER": {
      "jp": "恐竜は望遠鏡を持っていなかった。私たちは持っている。",
      "en": "The dinosaurs did not have a space programme.",
      "by": "惑星防衛のスローガン"
    },
    "ARMAG": {
      "jp": "終わりが至るところで予感されているのに、終わりは来ない。終わりはもはや出来事ではなく、雰囲気になった。",
      "en": "The sense of an ending is pervasive, but the end itself does not come.",
      "by": "フランク・カーモード『終りの意識』（要約）"
    },
    "SURV": {
      "jp": "人は見られていることを知ったとき、すでに自由ではない。",
      "en": "If you want to keep a secret, you must also hide it from yourself.",
      "by": "ジョージ・オーウェル『一九八四年』"
    },
    "LEAK": {
      "jp": "プライバシーが贅沢品になる時代が来る。",
      "en": "In the future, privacy will be a luxury good.",
      "by": "テック業界の予言"
    },
    "JUDG": {
      "jp": "審判の日に恐ろしいのは、裁かれることではない。自分が自分を裁くことだ。",
      "en": "No one can harm you except yourself.",
      "by": "マハトマ・ガンジー（要約）"
    },
    "WEDLOCK": {
      "jp": "結婚とは、二人の人間が互いの孤独を分かち合うことだ——うまくいけば。",
      "en": "Marriage is not a noun; it's a verb. It is not something you get. It is something you do.",
      "by": "バーバラ・デ・アンジェリス"
    },
    "JPSK": {
      "jp": "この島国は、海に浮かんでいるのではない。海に沈みかけているのだ——とはまだ誰も言っていない。",
      "en": "An island is a world in miniature.",
      "by": "地理の常識を逆さにした言葉"
    },
    "GEQ": {
      "jp": "フェミニズムとは、女性も人間であるという過激な思想のことだ。",
      "en": "Feminism is the radical notion that women are people.",
      "by": "マリー・シア"
    },
    "NODISC": {
      "jp": "差別をする人間は、自分が何を恐れているかを知らない。",
      "en": "No one is born hating another person because of the colour of his skin.",
      "by": "ネルソン・マンデラ"
    },
    "FAIR": {
      "jp": "富者がその富をどう使うかについて語るとき、彼らはつねに慈善を語る。しかし貧者が語るのは正義である。",
      "en": "When I give food to the poor, they call me a saint. When I ask why the poor have no food, they call me a communist.",
      "by": "ドン・エルデル・カマラ"
    },
    "DEMO": {
      "jp": "民主主義は最悪の政治形態だ。これまで試みられた他のすべての政治形態を除いては。",
      "en": "Democracy is the worst form of Government except for all those other forms.",
      "by": "ウィンストン・チャーチル"
    },
    "CLEAN": {
      "jp": "権力は腐敗する。絶対的権力は、絶対的に腐敗する。",
      "en": "Power tends to corrupt, and absolute power corrupts absolutely.",
      "by": "アクトン卿"
    },
    "UBI": {
      "jp": "すべての人にパンを保証することは、革命ではない。文明である。",
      "en": "A nation's greatness is measured by how it treats its weakest members.",
      "by": "マハトマ・ガンジー（とされる）"
    },
    "SING": {
      "jp": "もうすぐ全てが変わると、毎年言われている。",
      "en": "The future is already here — it's just not evenly distributed.",
      "by": "ウィリアム・ギブスン"
    },
    "CLASS": {
      "jp": "歴史は、すべて階級闘争の歴史である。",
      "en": "The history of all hitherto existing society is the history of class struggles.",
      "by": "マルクス＆エンゲルス『共産党宣言』"
    },
    "PERP": {
      "jp": "永久機関を夢見るのは、物理学を学ぶ前か、学びすぎたあとだ。",
      "en": "Perpetual motion is only impossible until it isn't.",
      "by": "発明家がよく口にする言葉"
    },
    "PROG": {
      "jp": "進歩の神話が崩れるとき、進歩そのものではなく、それを信じていた自分が崩れる。",
      "en": "The idea of progress is the most important idea in the modern world, and the most dangerous.",
      "by": "クリストファー・ラッシュ（要約）"
    },
    "REASON": {
      "jp": "理性の眠りは怪物を生む。",
      "en": "The sleep of reason produces monsters.",
      "by": "フランシスコ・ゴヤ"
    },
    "ENHANCE": {
      "jp": "より良い人間を設計するとは、『より良い』を誰が定義するかを問わないことだ。",
      "en": "The question is not whether we will redesign ourselves, but who gets to decide the blueprint.",
      "by": "生命倫理でよく言われること"
    },
    "SCIFUT": {
      "jp": "科学は素晴らしい灯台だ。しかし灯台に住むことはできない。",
      "en": "Science is a wonderful thing if one does not have to earn one's living at it.",
      "by": "アルベルト・アインシュタイン"
    },
    "WREV": {
      "jp": "革命は、ディナー・パーティーではない。",
      "en": "A revolution is not a dinner party.",
      "by": "毛沢東"
    },
    "MARX": {
      "jp": "哲学者たちは世界をさまざまに解釈してきたにすぎない。肝心なのは世界を変えることである。",
      "en": "The philosophers have only interpreted the world, in various ways. The point, however, is to change it.",
      "by": "カール・マルクス「フォイエルバッハに関するテーゼ」"
    },
    "GROW": {
      "jp": "有限の惑星の上で指数関数的成長が永遠に続くと信じているのは、狂人か経済学者のどちらかだ。",
      "en": "Anyone who believes in indefinite growth in anything physical, on a physically finite planet, is either mad or an economist.",
      "by": "ケネス・ボールディング"
    },
    "PWD": {
      "jp": "自分の人生にログインできないという感覚は、21世紀の特有の悪夢である。",
      "en": "We have created a civilization in which the most crucial elements depend on things we cannot remember.",
      "by": "デジタル時代の警句"
    },
    "FALL": {
      "jp": "落ちる夢は、すべての人間が持つ最古の夢である。重力を恐れるのではなく、信頼を恐れているのだ。",
      "en": "We all fall. The question is whether there is someone to catch us.",
      "by": "心理療法のよくある言い換え"
    },
    "CHASE": {
      "jp": "夢のなかの追跡者は、つねに自分自身の影である。",
      "en": "The shadow is a moral problem that challenges the whole ego-personality.",
      "by": "カール・ユング"
    },
    "TEETH": {
      "jp": "歯が抜ける夢は、ほぼすべての文化に存在する。それは身体が自分のものでなくなる恐怖の、最も親密な表現だ。",
      "en": "The tooth-loss dream is one of the most universal across cultures.",
      "by": "夢研究でよく知られる知見"
    },
    "FLY": {
      "jp": "飛ぶ夢を見る者は、地上で何かに縛られている。",
      "en": "I fly because it releases my mind from the tyranny of petty things.",
      "by": "サン＝テグジュペリ（翻案）"
    },
    "NAKED": {
      "jp": "裸であることは、見られることではない。隠すものがなくなることだ。",
      "en": "Nakedness reveals itself. Nudity is placed on display.",
      "by": "ジョン・バージャー『イメージ 視覚とメディア』"
    },
    "MUTE": {
      "jp": "叫びたいのに声が出ない。それは夢の中だけの話ではない。",
      "en": "The most common way people give up their power is by thinking they don't have any.",
      "by": "アリス・ウォーカー"
    },
    "DROWN": {
      "jp": "溺れる者は藁をもつかむ。夢のなかでは、藁すらない。",
      "en": "Not waving but drowning.",
      "by": "スティーヴィー・スミス"
    },
    "EXAM": {
      "jp": "卒業して二十年経っても試験の夢を見るのは、私たちが決して十分だと感じないからだ。",
      "en": "Even after decades, the exam dream returns because the feeling of being tested never leaves.",
      "by": "心理学でよく言われること"
    },
    "FUNRL": {
      "jp": "自分の葬式に出席できないことは、人生における最大の不公平である。",
      "en": "I did not attend the funeral, but I sent a nice letter saying I approved of it.",
      "by": "マーク・トウェイン（とされる）"
    },
    "MIRR": {
      "jp": "鏡を見つめすぎると、鏡のほうが見つめ返してくる。",
      "en": "If you gaze long enough into an abyss, the abyss also gazes into you.",
      "by": "フリードリヒ・ニーチェ"
    },
    "DEAD": {
      "jp": "死者は電話をかけてこない。だから私たちは電話を切れないでいる。",
      "en": "The dead don't stay dead in our minds. That is their final gift and final cruelty.",
      "by": "ジョーン・ディディオン（要約）"
    },
    "LOOP": {
      "jp": "お前がいま生きているこの生を、お前はもう一度、さらに無数回にわたって生きねばならぬとすればどうする？",
      "en": "What if some day or night a demon were to steal after you and say to you: this life as you now live it, you will have to live once more and innumerable times more?",
      "by": "ニーチェ『悦ばしき知識』§341"
    },
    "NOWAKE": {
      "jp": "起きられないのではない。起きたくないのだ——と言えるうちは、まだ大丈夫。",
      "en": "Is all that we see or seem but a dream within a dream?",
      "by": "エドガー・アラン・ポー"
    },
    "FALSE": {
      "jp": "起きたと思った瞬間が、最も深い眠りだった。",
      "en": "Reality is merely an illusion, albeit a very persistent one.",
      "by": "アインシュタイン（とされる）"
    },
    "DONTWAKE": {
      "jp": "いい夢の終わりは、小さな死である。",
      "en": "All men whilst they are awake are in one common world; but each of them, when he is asleep, is in a world of his own.",
      "by": "プルタルコス"
    },
    "ROADEXT": {
      "jp": "道が目的地に着かないとき、道そのものが目的地になる。",
      "en": "It is good to have an end to journey toward; but it is the journey that matters, in the end.",
      "by": "アーシュラ・K・ル＝グウィン"
    },
    "SUNKCITY": {
      "jp": "見慣れた風景が消えるとき、それを愛していたことに気づく。",
      "en": "The true catastrophe is the slow kind, the one we adapt to.",
      "by": "レベッカ・ソルニット（要約）"
    },
    "DATALOSS": {
      "jp": "記憶とは、忘れることへの抵抗だ。デジタルの記憶は、その抵抗をすら消去する。",
      "en": "We save everything and remember nothing.",
      "by": "デジタル時代の逆説"
    },
    "SUMMER": {
      "jp": "過ぎ去った夏だけが、永遠の夏になる。",
      "en": "Summer afternoon — summer afternoon … the two most beautiful words in the English language.",
      "by": "ヘンリー・ジェイムズ"
    },
    "SKYFALL": {
      "jp": "空が落ちてくるのは、支えるものが何もないことに気づいたからだ。",
      "en": "The sky is falling — but it has always been falling. We just stopped noticing.",
      "by": "民間の知恵より"
    },
    "ROOMS": {
      "jp": "家の中に知らない部屋を見つける夢は、自分の中に知らない自分がいることの暗示である。",
      "en": "The dream of hidden rooms is one of the most commonly reported, and the most numinous.",
      "by": "ユング派の通説"
    },
    "LOSTHOME": {
      "jp": "帰る場所は、帰らないことで保存される。帰ったとき、そこはもうない。",
      "en": "You can't go home again.",
      "by": "トマス・ウルフ"
    },
    "LOOPTALK": {
      "jp": "同じことを繰り返しながら、違う結果を期待する。それを狂気と呼ぶ。",
      "en": "Insanity is doing the same thing over and over and expecting different results.",
      "by": "とされる"
    },
    "SEX": {
      "jp": "欲望とは、不在のかたちである。",
      "en": "Desire is the essence of man.",
      "by": "バールーフ・デ・スピノザ"
    },
    "MEETLOVE": {
      "jp": "会いたい人に会えないということは、その人がまだどこかにいるということだ。",
      "en": "The very existence of the beloved makes the world less solitary.",
      "by": "ライナー・マリア・リルケ（要約）"
    },
    "DEADCAT": {
      "jp": "動物を失うことは、言葉にならない悲しみだ。なぜなら動物は、言葉のない愛をくれた存在だからだ。",
      "en": "Until one has loved an animal, a part of one's soul remains unawakened.",
      "by": "アナトール・フランス"
    },
    "FORGETEX": {
      "jp": "忘れるとは、思い出の中に相手がいなくなることではない。いても平気になることだ。",
      "en": "The heart was made to be broken.",
      "by": "オスカー・ワイルド"
    },
    "OSHI": {
      "jp": "崇拝とは、自分自身に欠けているものの発見である。",
      "en": "The fan is the most loyal kind of lover — loving without hope of return.",
      "by": "ファン文化の警句"
    },
    "SLEEP": {
      "jp": "眠りは、貧者にも許された唯一の贅沢である。",
      "en": "Sleep is the interest we have to pay on the capital which is called in at death.",
      "by": "アルトゥル・ショーペンハウアー"
    },
    "PARENT": {
      "jp": "親の承認を求めることは、子どもの仕事ではない。しかし多くの大人がまだその仕事をしている。",
      "en": "It is easier to build strong children than to repair broken men.",
      "by": "フレデリック・ダグラス"
    },
    "NEEDED": {
      "jp": "人は、必要とされることを必要としている。",
      "en": "We are all of us sentenced to solitary confinement inside our own bodies.",
      "by": "テネシー・ウィリアムズ"
    },
    "CHILD": {
      "jp": "子ども時代とは、まだ語られていない物語が住んでいる家である。",
      "en": "Grown-ups never understand anything by themselves, and it is tiresome for children to be always and forever explaining things to them.",
      "by": "サン＝テグジュペリ『星の王子さま』"
    },
    "HOME2": {
      "jp": "故郷とは、場所ではなく、帰りたいと思う気持ちのことだ。",
      "en": "Home is not where you live but where they understand you.",
      "by": "クリスティアン・モルゲンシュテルン"
    },
    "UNDO": {
      "jp": "言葉は放たれた矢のようなもので、射手の手に戻ることはない。",
      "en": "Of all sad words of tongue or pen, the saddest are these: 'It might have been.'",
      "by": "ジョン・グリーンリーフ・ホイッティア"
    },
    "DEBT": {
      "jp": "負債とは、まだ完全に共同体になっていない者たちのあいだの、束の間の道徳的擬制である。",
      "en": "If you owe the bank a hundred dollars, that's your problem. If you owe the bank a hundred million, that's the bank's problem.",
      "by": "J・ポール・ゲティ（とされる）"
    },
    "PREZ": {
      "jp": "権力を望む者は、まず自分が何を恐れているかを知るべきだ。",
      "en": "Nearly all men can stand adversity, but if you want to test a man's character, give him power.",
      "by": "エイブラハム・リンカーン"
    },
    "BALLER": {
      "jp": "球を蹴るということは、地球に触れるということだ。",
      "en": "Some people believe football is a matter of life and death. I assure you it is much, much more serious than that.",
      "by": "ビル・シャンクリー"
    },
    "SINGER": {
      "jp": "歌えない人はいない。歌うことを恐れている人がいるだけだ。",
      "en": "I don't sing because I'm happy; I'm happy because I sing.",
      "by": "ウィリアム・ジェームズ"
    },
    "ASTRO": {
      "jp": "宇宙から見ると、国境は見えない。",
      "en": "When you look at the Earth from space, borders disappear.",
      "by": "宇宙飛行士がよく語る言葉"
    },
    "ELOPE": {
      "jp": "選ばなかった道は、選んだ道よりも長く残る。",
      "en": "Two roads diverged in a wood, and I — I took the one less traveled by.",
      "by": "ロバート・フロスト"
    },
    "AFFAIR": {
      "jp": "禁じられた愛は、許された愛より正確に記憶される。",
      "en": "The heart has its reasons, which reason does not know.",
      "by": "ブレーズ・パスカル"
    },
    "ROCK": {
      "jp": "ロックンロールは死んだ、と誰かが言うたびに、ロックンロールは生き返る。",
      "en": "Rock and roll is here to stay.",
      "by": "ダニー＆ザ・ジュニアーズ（1958）"
    },
    "CINDER": {
      "jp": "ガラスの靴はぴったり合ったが、それを脱いだあとの人生は誰も書かない。",
      "en": "If the shoe fits, wear it — but Cinderella never talks about the blisters.",
      "by": "現代的な言い換え"
    },
    "TENNO": {
      "jp": "ナポレオンだと名乗る患者が二人いるとき、問題はナポレオンが何人いるかではない。",
      "en": "Every man has a Napoleon inside him — the trouble starts when he acts on it.",
      "by": "精神医学のユーモア（翻案）"
    },
    "MOTE": {
      "jp": "すべての人に好かれたい者は、誰にも愛されない。",
      "en": "The desire to be loved is the last illusion. Give it up and you will be free.",
      "by": "マーガレット・アトウッド（要約）"
    },
    "INHERIT": {
      "jp": "遺産とは、死者の最後の発言であり、受け取る者の最初の試練である。",
      "en": "Inherited wealth is a real handicap to happiness.",
      "by": "ウィリアム・K・ヴァンダービルト"
    },
    "QUITJOB": {
      "jp": "仕事を辞めることは、自分を辞めないためにすることだ。",
      "en": "Choose a job you love, and you will never have to work a day in your life — unless that job loves you back, which it rarely does.",
      "by": "孔子の現代的な言い換え"
    },
    "FOLLOW": {
      "jp": "百万人のフォロワーがいて、一人も友人がいないことは可能だ。",
      "en": "I am lonely, yet not everybody will do. I don't know why, some people fill the gaps and others emphasize my loneliness.",
      "by": "アナイス・ニン"
    },
    "REUNION": {
      "jp": "同窓会とは、あの頃の自分を殺すために行く場所だ。",
      "en": "The past is never dead. It's not even past.",
      "by": "ウィリアム・フォークナー"
    },
    "SLEEPIN": {
      "jp": "『あと五分』は、人類最古の祈りである。",
      "en": "Five more minutes — the universal prayer.",
      "by": "よく知られた警句"
    },
    "BILLION": {
      "jp": "お金は幸福を買えないが、不幸をずいぶん快適にしてくれる。",
      "en": "Having money isn't everything, not having it is.",
      "by": "カニエ・ウェスト"
    },
    "HAREM": {
      "jp": "あまたに愛されたい者は、一人にも愛されていないことを知っている。",
      "en": "Don Juan's tragedy is not the number of women but the fact that none of them exists.",
      "by": "アルベール・カミュ（ドン・ジュアン論より要約）"
    },
    "FLORIST": {
      "jp": "花は、用のないものに美しさを見いだす、人間の最も古い練習だ。",
      "en": "Flowers don't worry about how they're going to bloom. They just open up and turn toward the light.",
      "by": "ジム・キャリー"
    },
    "CUTE": {
      "jp": "鏡は嘘をつかない。しかし鏡を見る目は、いつも嘘をつく。",
      "en": "You are not a drop in the ocean. You are the entire ocean in a drop.",
      "by": "ルーミー"
    },
    "BIRDWISH": {
      "jp": "鳥は翼があるから自由なのではない。飛ぶことを選べるから自由なのだ。",
      "en": "The reason birds can fly and we can't is simply because they have perfect faith.",
      "by": "J・M・バリー"
    }
  };

  // 売り手（誰が手放したか）の英訳
  const SELLER_EN = {
    "眠る人々": "Sleepers", "自分を探す人々": "Those searching for themselves", "つながりを求める人々": "Those seeking connection",
    "喪に服す人々": "The bereaved", "後悔を抱える人々": "Those who carry regret", "夜空の観測者": "Watchers of the night sky",
    "海沿いの町の住人": "Residents of a coastal town", "終末を待つ人々": "Those awaiting the end", "紛争地域の出身者": "Someone from a conflict zone",
    "核戦争の夢を見た女性たち": "Women who dreamed of nuclear war", "援助に携わる人々": "Aid workers", "支援活動の従事者": "Relief workers",
    "医療従事者": "Medical workers", "終わりを拒む人々": "Those who refuse the end", "権利を求めてきた人々": "Those who fought for their rights",
    "境界線上に暮らす人々": "Those who live on the border", "再分配を望む人々": "Those who long for redistribution", "教育に携わる人々": "Educators",
    "投票を続ける市民": "Citizens who keep voting", "清廉を望む人々": "Those who long for integrity", "軍縮を願う人々": "Those who wish for disarmament",
    "気候運動の参加者": "Climate activists", "生物多様性の研究者": "A biodiversity researcher", "環境運動の参加者": "Environmental activists",
    "開発に挑む技術者": "Engineers chasing a breakthrough", "働き疲れた人々": "The work-weary", "制度を求める人々": "Those demanding the policy",
    "堅実な貯蓄家": "A disciplined saver", "健康を願う人々": "Those who wish for health", "美容に投資する人々": "Those who invest in beauty",
    "自分を磨く人々": "Those who better themselves", "静けさを求める人々": "Those seeking quiet", "眠れない人々": "The sleepless",
    "挑戦する人々": "The daring", "働き方を探す人々": "Those searching for a way to work", "才能を信じる人々": "Those who believe in their talent",
    "自由を目指す人々": "Those who aim for freedom", "夢を買う人々": "Those who buy dreams", "家を探す人々": "Those house-hunting",
    "出会いを待つ人々": "Those waiting for an encounter", "愛を信じる人々": "Those who believe in love", "放浪を夢見る人々": "Those who dream of wandering",
    "宇宙開発の支持者": "Supporters of space exploration", "想像する人々": "The imaginative", "未来に憧れる人々": "Those who long for the future",
    "注目を求める人々": "Those who crave attention", "移住を夢見る人々": "Those who dream of migrating", "新興の信仰者たち": "New believers",
    "医療の最前線": "The medical front line", "資産を組み替えた投資家": "An investor who rebalanced", "テック業界の従事者": "Tech workers",
    "自動化を見守る人々": "Those watching automation", "職を案じる人々": "Those who fear for their jobs", "農に携わる人々": "Those who work the land",
    "都市の生活者": "City dwellers", "市場を見守る人々": "Those watching the markets", "時代を憂う人々": "Those who fear for the times",
    "歴史を知る人々": "Those who know history", "空を見上げる人々": "Those who look to the sky", "見守られる人々": "The watched",
    "つながる人々": "The connected", "夜ごとの夢想家": "A nightly dreamer", "平等を夢見る人々": "Those who dream of equality",
    "道を求める人々": "Seekers of the way", "楽園を夢見る人々": "Those who dream of paradise", "救いを待つ人々": "Those awaiting salvation",
    "古を慕う人々": "Those who yearn for the past", "錬金術師たち": "Alchemists", "発明家たち": "Inventors", "理想を描く人々": "Those who picture an ideal",
    "進歩を信じる人々": "Believers in progress", "啓蒙を信じる人々": "Believers in enlightenment", "未来の設計者たち": "Architects of the future",
    "科学を信じる人々": "Believers in science", "変革を望む人々": "Those who long for change", "再生を願う人々": "Those who wish for rebirth",
    "信仰を持つ人々": "The faithful", "理想郷を探す人々": "Seekers of utopia", "古の信仰者たち": "Ancient believers",
    "失われた大陸を追う人々": "Those who chase a lost continent", "競い合う人々": "The competitive", "恋する人々": "Those in love",
    "特別を信じる人々": "Those who believe they are special", "ここではない場所を望む人々": "Those who long for elsewhere",
    "時を覗きたい人々": "Those who wish to peer through time", "心優しい人々": "The gentle-hearted", "雪辱を期す人々": "Those awaiting vindication",
    "夜に眠れない人々": "Those who can't sleep at night", "会えない人々": "Those who cannot meet", "立ち直りたい人々": "Those who want to move on",
    "熱心なファン": "A devoted fan", "疲れた現代人": "The weary modern soul", "認められたい人々": "Those who want to be recognized",
    "孤独な人々": "The lonely", "大人になった人々": "Those who have grown up", "遠くで暮らす人々": "Those living far away",
    "返済に追われる人々": "Those hounded by debt", "野心ある人々": "The ambitious", "ボールを蹴る子どもたち": "Children kicking a ball",
    "歌う人々": "Those who sing", "空を見上げた子ども": "A child who looked up at the sky", "許されぬ恋人たち": "Forbidden lovers",
    "手放したい人々": "Those who want to let go", "かつて夢見た少年たち": "Boys who once dreamed", "一発逆転を願う人々": "Those longing for one big break",
    "自称・選ばれし者": "A self-proclaimed chosen one", "選ばれたい人々": "Those who want to be chosen", "棚ぼたを待つ人々": "Those waiting for a windfall",
    "月曜の朝の人々": "People on a Monday morning", "通知を待つ人々": "Those waiting for a notification", "あの頃を忘れない人々": "Those who can't forget the old days",
    "目覚ましと闘う人々": "Those who battle the alarm clock", "上を見続ける人々": "Those who keep looking up", "満たされたい人々": "Those who long to be fulfilled",
    "現実に戻りたくない人々": "Those who won't return to reality", "逃れたいと願う人々": "Those who wish to escape", "やさしい暮らしを願う人々": "Those who wish for a gentle life",
    "保存し忘れた人々": "Those who forgot to save", "鏡を見つめる人々": "Those who stare into the mirror", "自由を願う人々": "Those who wish for freedom",
    "元大学関係者": "A former academic", "投票を続けてきた人々": "Those who have kept voting", "長年の信徒たち": "Longtime believers",
    "各国の政府および企業": "Governments and corporations",
  };
  function sellerLabel(jp) { const en = SELLER_EN[jp]; return en ? `${en} ・ ${jp}` : jp; }

  let fieldOrbs = [], fieldRAF = null, fieldBuilt = false, fieldT = 0, lineCtx = null, fieldSel = null, fieldElapsed = 0, fieldDust = [];
  let fieldDrag = null, dragMoved = false, dragLast = { x: 0, y: 0 };
  function popularity(s) { return s.realViews ? Math.min(100, 15 + Math.log10(s.realViews + 1) * 18) : s.interest; }
  const FIELD_FB = { nightmare: [0.42, 0.12, 0.09], hope: [0.10, 0.30, 0.40], oneiric: [0.30, 0.18, 0.42], ideology: [0.42, 0.32, 0.10], mundane: [0.40, 0.16, 0.26] };
  function sizeFieldLines() { const cv = $("#fieldLines"); if (!cv) return; const dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; lineCtx = cv.getContext("2d"); lineCtx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function buildField() {
    if (fieldBuilt) return;
    if (!window.FieldGL || !FieldGL.init($("#fieldGL"))) return;
    fieldBuilt = true; sizeFieldLines();
    const W = innerWidth, H = innerHeight;
    const fScale = Math.max(0.42, Math.min(1, Math.min(W, H) / 640));   // スマホなど狭い画面では球を縮小
    state.forEach((s) => {                                              // これまでの全銘柄をマッピング
      const lastM = s.closes.length - 1, pastM = Math.max(0, lastM - 240);
      const grow = s.closes[pastM] > 0 ? s.closes[lastM] / s.closes[pastM] : 1;  // 直近20年の成長率
      const m = popularity(s) * Math.min(2.2, Math.max(0.7, grow));             // 人気度×成長（急成長を加点）
      const r = Math.round((16 + Math.pow(Math.min(m, 150) / 150, 2.4) * 122) * fScale);   // ジャンプ率を強く（最大は抑制）
      const tex = FieldGL.loadTexture(`assets/footage/${s.ticker}.jpg?v=20260622`);
      fieldOrbs.push({ s, r, tex, fb: FIELD_FB[s.category] || [0.12, 0.12, 0.14], seed: (s.idx % 17) / 17,
        x: r + Math.random() * Math.max(1, W - 2 * r), y: 90 + r + Math.random() * Math.max(1, H - 2 * r - 200),
        vx: (Math.random() - 0.5) * 0.10, vy: (Math.random() - 0.5) * 0.10, ph: Math.random() * 6.283, sc: 1,
        z: 0.18 + Math.random() * 0.82, delay: 0 });
    });
    // 保存済みユーザー夢をフィールドに追加
    loadReleasedDreams().forEach(d => _addDreamOrb(d, W, H, fScale));
    // 水中を漂う埃のような微粒子
    fieldDust = [];
    for (let i = 0; i < 150; i++) fieldDust.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.12 - 0.02,
      r: 0.4 + Math.random() * 1.8, a: 0.05 + Math.random() * 0.16, tw: 0.5 + Math.random() * 1.4, ph: Math.random() * 6.283,
    });
  }
  function fieldTick() {
    if ($("#dreamfield").classList.contains("hidden")) { fieldRAF = null; return; }
    fieldT += 0.016; fieldElapsed += 0.016;
    const W = innerWidth, H = innerHeight, top = 80;
    fieldOrbs.forEach((o) => {
      if (o === fieldDrag) return;                                     // つかんでいる球は指に追従（物理スキップ）
      // ゆらゆら蛇行（直線的にならない、流体のような揺らぎ）
      o.vx += Math.sin(fieldT * 0.24 + o.ph) * 0.004;
      o.vy += Math.cos(fieldT * 0.20 + o.ph * 1.3) * 0.004;
      // 壁はやわらかく押し返す（硬く跳ねない）
      const m = o.r + 14;
      if (o.x < m) o.vx += (m - o.x) * 0.0007;
      if (o.x > W - m) o.vx -= (o.x - (W - m)) * 0.0007;
      if (o.y < top + m) o.vy += (top + m - o.y) * 0.0007;
      if (o.y > H - m) o.vy -= (o.y - (H - m)) * 0.0007;
      o.vx *= 0.97; o.vy *= 0.97;                                       // 粘性のある減衰
      const sp = Math.hypot(o.vx, o.vy);
      if (sp > 0.5) { o.vx *= 0.5 / sp; o.vy *= 0.5 / sp; }
      o.x += o.vx; o.y += o.vy;
      o.x = Math.max(o.r, Math.min(W - o.r, o.x)); o.y = Math.max(top + o.r, Math.min(H - o.r, o.y));  // 安全クランプ
    });
    for (let i = 0; i < fieldOrbs.length; i++) {                        // ふわふわ、互いを“避ける”（繋がない）
      const a = fieldOrbs[i];
      for (let j = i + 1; j < fieldOrbs.length; j++) {
        const b = fieldOrbs[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, minD = (a.r + b.r) * 0.5;  // 1/3ほどの重なりは許容
        if (d < minD) {
          const p = (minD - d) / d * 0.12;
          if (a !== fieldDrag) { a.x -= dx * p; a.y -= dy * p; }        // つかんだ球は押しのける側（動かない）
          if (b !== fieldDrag) { b.x += dx * p; b.y += dy * p; }
          const st = 0.003; if (a !== fieldDrag) { a.vx -= dx / d * st; a.vy -= dy / d * st; } if (b !== fieldDrag) { b.vx += dx / d * st; b.vy += dy / d * st; }
        }
      }
    }
    // 水中の埃のような微粒子（#fieldLines の2Dキャンバスに描画）
    if (lineCtx) {
      lineCtx.clearRect(0, 0, W, H);
      for (const d of fieldDust) {
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0) d.x = W; else if (d.x > W) d.x = 0;
        if (d.y < 0) d.y = H; else if (d.y > H) d.y = 0;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(fieldT * d.tw + d.ph));
        lineCtx.beginPath(); lineCtx.fillStyle = `rgba(243,241,236,${(d.a * tw).toFixed(3)})`;
        lineCtx.arc(d.x, d.y, d.r, 0, 6.283); lineCtx.fill();
      }
    }
    FieldGL.begin();
    const order = fieldOrbs.slice().sort((a, b) => ((a === fieldSel) ? 2 : a.z) - ((b === fieldSel) ? 2 : b.z));  // 奥→手前
    order.forEach((o) => {
      const tgt = (o === fieldSel) ? 1.35 : 1.0; o.sc += (tgt - o.sc) * 0.12;
      const z = (o === fieldSel) ? 1 : o.z;
      const a = Math.max(0, Math.min(1, (fieldElapsed - o.delay) / 0.9)); const ap = a * a * (3 - 2 * a);  // 暗闇からフェードイン
      if (ap <= 0.003) return;
      const rr = o.r * o.sc * (0.55 + 0.6 * z);                        // 手前ほど大きい
      FieldGL.draw(o.x, o.y, rr, o.seed, o.tex, o.fb, fieldT, ap * (0.4 + 0.6 * z));  // 奥ほど暗い
    });
    fieldRAF = requestAnimationFrame(fieldTick);
  }
  function fieldHit(cx, cy) { let best = null, bd = 1e9; fieldOrbs.forEach((o) => { const er = o.r * (0.55 + 0.6 * o.z); const d = Math.hypot(cx - o.x, cy - o.y); if (d < er && d < bd) { bd = d; best = o; } }); return best; }
  // 夢の海では、各夢の「価値」を神託のように詩的に語る
  const NATURE = {
    hope: ["A glimmer of premonition, carried from afar.", "遠くからの光が運ぶ、ひとすじの予感。"],
    nightmare: ["An ominous oracle, arrived from beyond.", "外からやってきた、不吉な神託。"],
    ideology: ["An ancient dream, handed down through the ages.", "太古より受け継がれた、人類の見果てぬ夢。"],
    oneiric: ["A nightly phantom from the depths of sleep.", "まどろみの底に浮かぶ、夜ごとの幻。"],
    mundane: ["A true desire, hiding in the deep psyche.", "深層心理に潜む、本当の欲望。"],
  };
  function openPanel(s) {
    fieldSel = fieldOrbs.find((o) => o.s === s) || null;               // 選んだ夢を手前へ
    $("#fpEn").textContent = s.nameEn; $("#fpJp").textContent = s.nameJp;
    $("#fpPrice").innerHTML = `${fmt(s.price)} <small>${CUR}</small> <span class="${cls(dayChange(s))}">${pctTxt(dayChange(s))}</span>`;
    const nat = NATURE[s.category] || ["", ""];
    $("#fpNature").innerHTML = `${nat[0]}<span>${nat[1]}</span>`;
    $("#fpQuote").innerHTML = (QUOTES[s.ticker] || s.descJp) + `<span class="en">${QUOTES_EN[s.ticker] || s.descEn}</span>`;   // 売った人のコメントが主役
    $("#fpSeller").textContent = "— " + sellerLabel(s.seller);
    const fq = FAMOUS[s.ticker];                                       // 名言は下に小さく添える
    const fpf = $("#fpFamous");
    if (fq) { fpf.innerHTML = `“${fq.jp}” <span class="by">— ${fq.by}</span>`; fpf.style.display = "block"; }
    else { fpf.style.display = "none"; }
    $("#fpOpen").onclick = (e) => { e.stopPropagation(); closeField(); selectDream(s); };
    $("#fieldPanel").classList.remove("hidden");
  }
  function openField() {
    buildField();
    fieldElapsed = 0; fieldSel = null;
    fieldOrbs.forEach((o) => { o.delay = Math.random() * 3.2; o.sc = 1; });   // 暗闇からひとつずつ
    $("#dreamfield").classList.remove("hidden"); $("#fieldPanel").classList.add("hidden");
    if (!fieldRAF) fieldRAF = requestAnimationFrame(fieldTick);
  }
  function closeField() { $("#dreamfield").classList.add("hidden"); fieldSel = null; }

  // 概念ごとの論理的な歴史：誕生年（それ以前はほぼ無）＋出来事の山（年, 強さ）
  const BIRTH = { UBI: 1962, AIBC: 1956, SING: 1993, ENHANCE: 1990, ISEKAI: 2010, FLYCR: 1956, ERTH2: 1995, AIGOD: 2005, AIJOB: 1960, ROBOT: 1950, SURV: 1949, LEAK: 1995, ENRGY: 1975, SUST: 1987, DVRS: 1988, GAIA: 1988, PWD: 1995, OSHI: 2005, FOLLOW: 2006, ROCK: 1955, TOWER: 1968 };
  const EVENTS = {
    // 終末・カタストロフ
    ARMAG: [[1962, 80], [1983, 70], [1999, 150], [2012, 100], [2020, 120]],
    PANDM: [[1918, 110], [2009, 60], [2020, 190]],
    NUKE: [[1945, 110], [1962, 150], [1983, 120], [2022, 110], [2026, 130]],  // 2026: 戦争継続で恐怖が再び高い
    CRSH: [[1929, 150], [1987, 70], [2008, 170], [2020, 80]],
    OIL: [[1973, 160], [1979, 110], [2008, 80], [2022, 90]],
    FASC: [[1933, 140], [1940, 160], [2016, 110]],
    ENDDEM: [[2016, 120], [2021, 110]],
    JPSK: [[2011, 190]], QUAKE: [[1995, 80], [2011, 130]],
    FOOD: [[1974, 90], [2008, 80], [2022, 90]],
    SURV: [[1949, 60], [2013, 140]], LEAK: [[2013, 140], [2018, 90]],
    EXTN: [[1992, 70], [2019, 110]],
    ALIEN: [[1947, 100], [1997, 90], [2019, 80]], ETLIF: [[1947, 90], [2017, 80]],
    // 思想・社会
    WREV: [[1917, 160], [1968, 110], [1989, 90]], MARX: [[1917, 120], [1968, 110]],
    CLASS: [[1917, 130], [1968, 90]], DEMO: [[1945, 80], [1989, 130], [2011, 90]],
    DISARM: [[1963, 90], [1987, 130]], GROW: [[1960, 100], [1990, 70]],
    FAIR: [[1930, 80], [2011, 110]], UBI: [[2016, 110], [2020, 150]],
    NODISC: [[1964, 120], [2020, 140]], GEQ: [[1972, 100], [2017, 120]],
    WPRE: [[1920, 80], [1972, 90], [2016, 130]], DVRS: [[1995, 80], [2015, 110]],
    // 希望・テック
    STOPGW: [[2006, 90], [2019, 150]], GAIA: [[2006, 90], [2019, 150]],
    ENRGY: [[2008, 70], [2015, 110]], SUST: [[1992, 80], [2015, 110]],
    NOWAR: [[1969, 90], [2003, 90]], PEACE: [[1969, 80], [1989, 90]],
    MARS: [[1969, 100], [2004, 70], [2020, 130]],
    AIBC: [[1985, 80], [2012, 110], [2023, 180]], SING: [[2005, 80], [2023, 140]],
    ROBOT: [[1984, 90], [2015, 100]], IMMO: [[2013, 90], [2021, 130]],
    // 信仰
    "2COM": [[1999, 100]], MESSI: [[1999, 80]],
    // 心霊主義：1848年以降に流行、二度の大戦の大量死で急増
    DEAD: [[1901, 100], [1920, 150], [1948, 130], [2001, 60]], REUNI: [[1901, 80], [1920, 130], [1948, 120]],
    // 個人
    DEBT: [[2008, 100], [2011, 80]], HOME: [[2006, 90]],
    ROCK: [[1972, 150], [1988, 90]], CINDER: [[1985, 80]], FOLLOW: [[2015, 130]], FAME: [[1985, 70], [2010, 110]],
  };
  let TL = {};   // 研究済みタイムライン（data/timelines.json）
  async function loadTimelines() {
    try { const r = await fetch("data/timelines.json"); if (r.ok) TL = await r.json(); } catch (e) {}
  }
  function applyLogicalHistory() {
    const L = TOTAL_MONTHS;
    state.forEach((s) => {
      const rec = TL[s.ticker] || { birth: BIRTH[s.ticker], events: EVENTS[s.ticker] };  // 研究データ優先、無ければ内蔵
      const birth = rec.birth, ev = rec.events;
      if (!birth && (!ev || !ev.length)) return;
      for (let m = 0; m < L; m++) {
        const y = START_YEAR + m / 12;
        if (birth) s.closes[m] *= Math.max(0.04, Math.min(1, (y - (birth - 4)) / 8));   // 誕生前はほぼ無
        if (ev) {
          let bump = 0;
          for (const e of ev) { const sig = e[0] >= 2015 ? 4.5 : 2.4; bump += e[1] * Math.exp(-((y - e[0]) * (y - e[0])) / (2 * sig * sig)); }  // 近年の山は2026まで余韻
          s.closes[m] += bump;
        }
      }
      s.price = s.closes[L - 1]; s.open = s.price; s.fair = s.price; s.tape = Array.from(s.closes.slice(-TAPE_N)); s.hasHistory = true;
    });
    idxBase = null; updateList(); updateTicker(); if (dref) updateDetail();
  }

  // ---- Wikipedia interest ----
  // interest（現実の関心）を fair に反映。momentum＞0（足元で注目上昇）なら基準価格を少し引き上げる
  function applyInterest(ok) {
    const logs = ok.map((o) => Math.log(o.avg + 1)), lo = Math.min(...logs), hi = Math.max(...logs);
    ok.forEach((o) => {
      const t = hi > lo ? (Math.log(o.avg + 1) - lo) / (hi - lo) : 0.5;
      o.s.interest = Math.round(15 + t * 80);
      if (!o.s.hasHistory) o.s.fair = 38 + o.s.interest * 4.2;
      const m = Math.max(-0.3, Math.min(0.5, o.mom || 0));          // 現実の勢いを基準価格に反映
      o.s.fair = o.s.fair * (1 + m * 0.6);
      o.s.momentum = m; o.s.realViews = Math.round(o.avg);
    });
  }
  async function loadInterest() {
    // 1) GitHub Actions が日次生成した data/interest.json を優先（速い・確実・GDELT等にも拡張可）
    try {
      const r = await fetch("data/interest.json", { cache: "no-store" });
      if (r.ok) {
        const data = await r.json(), items = data.items || {};
        const ok = state.filter((s) => items[s.ticker]).map((s) => ({ s, avg: items[s.ticker].views30, mom: items[s.ticker].momentum }));
        if (ok.length >= 2) {
          applyInterest(ok);
          setStatus(true, `Live · 現実の関心連動 (${ok.length}/${state.length}) · ${(data.generatedAt || "").slice(0, 10)}`);
          return;
        }
      }
    } catch (e) {}
    // 2) フォールバック：ブラウザから直接 Wikipedia API を叩く
    return loadInterestLive();
  }
  async function loadInterestLive() {
    const end = new Date(), start = new Date(Date.now() - 30 * 864e5);
    const f = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    const base = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user";
    const targets = state.filter((s) => s.wiki);
    const results = await Promise.allSettled(targets.map(async (s) => {
      const r = await fetch(`${base}/${encodeURIComponent(s.wiki)}/daily/${f(start)}/${f(end)}`);
      if (!r.ok) throw new Error(s.wiki + " " + r.status);
      const j = await r.json(); const views = (j.items || []).map((i) => i.views);
      if (!views.length) throw new Error("no data");
      return { s, avg: views.reduce((a, b) => a + b, 0) / views.length, mom: 0 };
    }));
    const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    if (ok.length >= 2) {
      applyInterest(ok);
      setStatus(true, `Live · Wikipedia 関心連動 (${ok.length}/${state.length})`);
    } else setStatus(false, "Simulated · オフライン（模擬データ）");
  }
  function setStatus(live, text) { $("#dataStatus").textContent = text; $("#dataDot").classList.toggle("live", !!live); }

  // 近年テック富豪らが本気で追う夢は、2020年代に急騰している（Ngramは2019まで＆書籍ベースで拾えない）
  const TREND_NOW = { IMMO: 1.0, SING: 0.85, AIBC: 0.7, ENHANCE: 0.7, MARS: 0.5 };

  // ---- historical shape from Google Ngram (data/history.json) ----
  async function loadHistory() {
    let hist = null;
    try { const r = await fetch("data/history.json"); if (r.ok) hist = await r.json(); } catch (e) {}
    if (!hist) return;
    const L = TOTAL_MONTHS;
    let n = 0;
    state.forEach((s) => {
      const ys = hist[s.ticker]; if (!ys || ys.length < 2) return;
      for (let m = 0; m < L; m++) {
        const yr = START_YEAR + m / 12;
        let v;
        if (yr <= 1900 + ys.length - 1) {
          const x = Math.max(0, Math.min(ys.length - 1, yr - 1900));
          const i0 = Math.floor(x), i1 = Math.min(ys.length - 1, i0 + 1), f = x - i0;
          v = ys[i0] * (1 - f) + ys[i1] * f;
        } else v = ys[ys.length - 1];
        s.closes[m] = 30 + v * 420;                 // 0..1 → ~30..450 BAKU
      }
      for (let m = 1; m < L; m++) s.closes[m] *= (1 + 0.015 * gauss());  // 月次のテクスチャ
      const boost = TREND_NOW[s.ticker];                                 // いま熱い夢は近年急騰
      if (boost) { const cy = _now.getFullYear(); for (let m = 0; m < L; m++) { const yr = START_YEAR + m / 12; if (yr > 2008) { const t = (yr - 2008) / (cy - 2008); s.closes[m] *= 1 + boost * 0.9 * t; } } }
      s.price = s.closes[L - 1]; s.open = s.price; s.fair = s.price;
      s.tape = Array.from(s.closes.slice(-TAPE_N));
      s.hasHistory = true; n++;
    });
    idxBase = null;                                  // 指数の基準を取り直す
    updateList(); updateTicker(); if (dref) updateDetail();
    return n;
  }

  // ============================================================
  //  BOOT
  // ============================================================
  function enter() { const tc = $("#titlecard"); tc.classList.add("hide"); setTimeout(() => (tc.style.display = "none"), 1700); }
  $("#titlecard").addEventListener("click", enter);
  $("#toField").addEventListener("click", openField);
  $("#fieldClose").addEventListener("click", closeField);
  // ---- ユーザー夢の保存・DreamField統合 ----
  const STORAGE_KEY = "baku_released_dreams";

  function loadReleasedDreams() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch(e) { return []; }
  }

  function saveReleasedDream(dream) {
    const list = loadReleasedDreams();
    list.unshift(dream); // 新しいものを先頭に
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 100))); } catch(e) {}
  }

  function formatDreamForField(transcript, matched) {
    // 物語から短いタイトルを抽出
    const shortJp = (transcript.split(/[。！？\n]/)[0] || transcript).slice(0, 18);
    // キーワードでカテゴリ推定
    const q = transcript.toLowerCase();
    const cat = /怖|悪夢|nightmare|horror|fear|暗|死|monster/.test(q) ? "nightmare"
              : /平和|happy|love|hope|願|光|beautiful|夢|sky|fly/.test(q) ? "hope"
              : "oneiric";
    const t = matched || {};
    return {
      ticker: "USR_" + Date.now(),
      nameJp: shortJp || t.nameJp || "あなたの夢",
      nameEn: t.nameEn || "Your dream",
      descJp: transcript,
      descEn: transcript,
      category: cat,
      seller: "あなた自身",
      _userDream: true,
      interest: 55 + Math.floor(Math.random() * 30),
      price: t.price || (100 + Math.floor(Math.random() * 900)),
      closes: [], tape: [],
    };
  }

  function _addDreamOrb(data, W, H, fScale) {
    if (!window.FieldGL || !fieldBuilt) return;
    fScale = fScale || Math.max(0.42, Math.min(1, Math.min(innerWidth, innerHeight) / 640));
    W = W || innerWidth; H = H || innerHeight;
    const r = Math.round(52 * fScale);
    const tex = FieldGL.loadTexture(data.imgUrl + "");
    const s = data._s || formatDreamForField(data.transcript || "", null);
    s._imgUrl = data.imgUrl; s._userDream = true;
    fieldOrbs.push({
      s, r, tex, fb: [0.28, 0.18, 0.42], seed: Math.random(),
      x: r + Math.random() * Math.max(1, W - 2 * r),
      y: 90 + r + Math.random() * Math.max(1, H - 2 * r - 200),
      vx: (Math.random() - 0.5) * 0.08, vy: (Math.random() - 0.5) * 0.08,
      ph: Math.random() * 6.283, sc: 1, z: 0.5 + Math.random() * 0.5, delay: 0,
    });
  }

  // ---- 夢を吸い出すフロー ----
  (function() {
    const PEXELS_KEY = "9heRDTAA2Hs38mjrmR4FTW81nU18jWbQF2iFQxvfXzmZNHYjUhKzERBa";

    // 瞑想ナレーション（JP→EN speech chain）
    const NAR = [
      { jp:"息を、整えます。",
        en:"Breathe." },
      { jp:"全身を楽にして。力を抜いて——目を閉じて。",
        en:"Let your whole body relax. Release the tension — and close your eyes." },
      { jp:"鼻から、ゆっくりと息を吸って、口から吐き切ります。吐き切って。もう一度。",
        en:"Breathe in, slowly, slowly, slowly, slowly, through your nose. Deep, deep, deep. Breathe out fully, through your mouth. Exhale completely. Breathe out fully. All the way out. Once more." },
      { jp:"鼻から、ゆっくりと息を吸って、口から吐き切ります。あなたの夢は、まだ、ここにあります。",
        en:"Your dream is still — here." },
      { jp:"ひとつ、思い浮かべてください。手放したい夢を。あるいは、悪夢を。",
        en:"Bring one to mind. The dream you want to release. Or the nightmare." },
      { jp:"——それはいつから、あなたのものでしたか？夢を持つことは良いことだと、私たちは子どもの頃から繰り返し言われてきました。",
        en:"— When did it become yours? — When did it become yours? — When did it become yours? We were told, as children, that having dreams was good." },
      { jp:"けれど、夢はやみくもに抱えるものではありません。それは、そもそも、ほんとうにあなたのものでしたか？",
        en:"But dreams are not things to be carried blindly. Was it ever, truly, yours?" },
      { jp:"誰かが欲しがっていたものを、あなたも欲しがっているだけかもしれません。あるいは——あなたにとって、それは怖いものかもしれません。",
        en:"Perhaps it was something someone else wanted, and you only learned to want it too. Or perhaps — it is something that frightens you." },
      { jp:"おそれと、ほんとうの望みは、表裏一体です。今いちど、その夢が本当にいらないか、自分に問うてください。",
        en:"Fear and true desire are two sides of the same coin. Ask yourself, once more, whether you really no longer need this dream." },
      { jp:"息を、ゆっくり、吐いてください。その夢のかたちを、感じてみてください。重さ。温度。輪郭。",
        en:"Breathe out — slowly. Breathe out — slowly. Breathe out — slowly. Sense the shape of it. Its weight. Its temperature. Its edges." },
      { jp:"それを、胸の中心から、ゆっくりと持ち上げます。",
        en:"Lift it, slowly, slowly, slowly, from the centre of your chest." },
      { jp:"あなたの呼吸に乗せて——私が三つ数えたら、弓を引き絞るように、一気に、吐き出します。",
        en:"Carry it on your breath — and when I count to three, release it, all at once, like an arrow loosed from a bow." },
      { jp:"3。", en:"Three.", pause:1800 },
      { jp:"2。", en:"Two.",   pause:1800 },
      { jp:"1。", en:"One.",   pause:1800 },
      { jp:"Bakuが、それを受け取ります。",
        en:"The Baku receives it.", pause:2000 },
      { jp:"あなたの夢は、これからマーケットへ放たれます。そのとき、あなたの個人情報は消されます。だから、夢のかたちは、少しだけ、変形します。あなたを守るために。——安心してください。",
        en:"Your dream is now released into the market. At that moment, your personal information is erased. Because of this, the shape of the dream will shift, slightly. To protect you. — Please, be at ease." },
      { jp:"誰かが、それを欲しがるかもしれません。誰かにとって、それは値のつくものになるかもしれません。あなたにとっては、もう、必要のないものです。",
        en:"Someone, somewhere, may want it. For someone, it may carry a price. For you, it is no longer needed." },
      { jp:"最後に、ひとつだけ、問います。——この夢を、手放していいですか？",
        en:"One last question. — Will you release this dream?", final:true },
    ];

    // 円形モニターへの送信 — Mac上でpython3 tools/pillow_server.py を起動しておく
    const PILLOW_SERVER = "http://localhost:8765";
    function sendToPillow(imgUrl, extra) {
      fetch(PILLOW_SERVER + "/dream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imgUrl, ...(extra || {}) }),
      }).catch(() => {}); // 接続できなくても無視
    }

    let meditateIv = null, narTO = null, narIdx = 0;
    let transcript = "", rec = null;
    const bgm = new Audio("music/release_your_dream.mp3");
    bgm.loop = true; bgm.volume = 0.45;
    const narAudio = new Audio("narration/test.mp3");
    narAudio.volume = 1.0;

    function goStep(n) {
      ["0","1","2","3","4","4b"].forEach(i => {
        const el = document.getElementById("sellStep" + i);
        if (el) el.classList.toggle("hidden", String(n) !== i);
      });
    }

    function stopAll() {
      clearInterval(meditateIv); clearTimeout(narTO);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (rec) { try { rec.stop(); } catch(e) {} rec = null; }
      bgm.pause(); bgm.currentTime = 0;
      narAudio.pause(); narAudio.currentTime = 0;
    }

    function resetFlow() {
      stopAll(); transcript = "";
      const mic = document.getElementById("sellMic");
      if (mic) mic.classList.remove("recording");
      const tr = document.getElementById("sellTranscript");
      if (tr) tr.textContent = "——";
      ["sellVoiceDone","sellMedNext"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove("visible");
      });
      const orb = document.getElementById("sellResultOrb");
      if (orb) { orb.innerHTML = '<div class="sell-orb-hint">tap to sell</div>'; orb.style.backgroundImage = ""; }
      goStep(0);
    }

    $("#toSell").addEventListener("click", () => { resetFlow(); $("#selldream").classList.remove("hidden"); });
    $("#sellClose").addEventListener("click", () => { stopAll(); $("#selldream").classList.add("hidden"); });

    // Step 0 → 1: start meditation
    document.getElementById("sellStart").addEventListener("click", () => {
      goStep(1);
      bgm.currentTime = 0; bgm.play().catch(() => {});
      narAudio.currentTime = 0;
      narAudio.play().catch(() => {});
      narAudio.onended = () => {
        clearInterval(meditateIv);
        document.getElementById("sellMedNext").classList.add("visible");
      };
      let secs = 0;
      const timerEl = document.getElementById("sellTimer");
      timerEl.textContent = "0:00";
      meditateIv = setInterval(() => {
        secs++;
        const m = Math.floor(secs / 60), s = secs % 60;
        timerEl.textContent = m + ":" + String(s).padStart(2, "0");
      }, 1000);
    });

    // Step 1: skip / next
    function advanceToVoice() { narAudio.onended = null; stopAll(); goStep(2); }
    document.getElementById("sellMedNext").addEventListener("click", advanceToVoice);
    document.getElementById("sellMedSkip").addEventListener("click", advanceToVoice);

    // Step 2: voice input
    function showUnrecognized() {
      const trEl = document.getElementById("sellTranscript");
      const doneBtn = document.getElementById("sellVoiceDone");
      const retakeBtn = document.getElementById("sellRetake");
      if (trEl) trEl.innerHTML = '<span style="color:var(--g2);font-style:italic;">夢が認識されませんでした。<br><small style="color:var(--g3);">Dream not recognised — please try again.</small></span>';
      if (doneBtn) doneBtn.classList.remove("visible");
      if (retakeBtn) retakeBtn.classList.add("visible");
    }

    function resetVoice() {
      if (rec) { try { rec.stop(); } catch(e) {} rec = null; }
      document.getElementById("sellMic").classList.remove("recording");
      transcript = "";
      document.getElementById("sellTranscript").textContent = "——";
      ["sellVoiceDone","sellRetake"].forEach(id => document.getElementById(id).classList.remove("visible"));
    }

    document.getElementById("sellMic").addEventListener("click", () => {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      const micBtn = document.getElementById("sellMic");
      const doneBtn = document.getElementById("sellVoiceDone");
      const retakeBtn = document.getElementById("sellRetake");
      const trEl = document.getElementById("sellTranscript");
      if (!SpeechRec) {
        const t = prompt("マイクが使えません。夢をテキストで入力してください：");
        if (t) { transcript = t; trEl.textContent = t; doneBtn.classList.add("visible"); retakeBtn.classList.add("visible"); }
        return;
      }
      if (rec) { try { rec.stop(); } catch(e) {} rec = null; micBtn.classList.remove("recording"); return; }
      rec = new SpeechRec();
      rec.lang = navigator.language.startsWith("en") ? "en-US" : "ja-JP";
      rec.interimResults = true; rec.continuous = true;
      rec.onresult = (e) => {
        transcript = Array.from(e.results).map(r => r[0].transcript).join("");
        trEl.textContent = transcript;
        if (transcript) { doneBtn.classList.add("visible"); retakeBtn.classList.add("visible"); }
      };
      rec.onend = () => { rec = null; micBtn.classList.remove("recording"); };
      rec.start(); micBtn.classList.add("recording");
    });

    document.getElementById("sellRetake").addEventListener("click", resetVoice);

    document.getElementById("sellVoiceDone").addEventListener("click", async () => {
      if (rec) { try { rec.stop(); } catch(e) {} rec = null; }
      document.getElementById("sellMic").classList.remove("recording");
      // Claude APIで分析を試みる（pillow serverが起動していれば）
      try {
        const res = await fetch(PILLOW_SERVER + "/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript }),
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const analysis = await res.json();
          return matchAndLoadWithAnalysis(analysis);
        }
      } catch(e) {}
      // フォールバック: ローカルマッチング
      matchAndLoad();
    });

    function matchAndLoadWithAnalysis(analysis) {
      const { ticker, keywords_en, summary_jp } = analysis;
      if (ticker) {
        const s = byTicker.get(ticker);
        if (s) {
          const price = s.price ? Math.round(s.price) : Math.floor(Math.random() * 900 + 100);
          return loadOrb(summary_jp || s.nameJp, "assets/footage/" + s.ticker + ".mp4?v=20260622", "assets/footage/" + s.ticker + ".jpg?v=20260622", price);
        }
      }
      // ティッカーマッチなし → Pexels
      fetchPexelsEn(keywords_en || "dream surreal abstract");
    }

    async function fetchPexelsEn(keywords, title, price) {
      const q = encodeURIComponent(keywords.slice(0, 80));
      const finalPrice = price || Math.floor(Math.random() * 900 + 100);
      let vidUrl = null, imgUrl = null;
      try {
        const [vRes, pRes] = await Promise.all([
          fetch("https://api.pexels.com/videos/search?query=" + q + "&per_page=1", { headers: { Authorization: PEXELS_KEY } }),
          fetch("https://api.pexels.com/v1/search?query=" + q + "&per_page=1&orientation=square", { headers: { Authorization: PEXELS_KEY } }),
        ]);
        const vData = await vRes.json(), pData = await pRes.json();
        const files = vData.videos?.[0]?.video_files || [];
        const sd = files.filter(f => f.quality === "sd");
        const chosen = (sd.length ? sd : files).sort((a,b) => (a.width||9999)-(b.width||9999));
        vidUrl = chosen[0]?.link || null;
        imgUrl = pData.photos?.[0]?.src?.large || null;
      } catch(e) {}
      const fb = state[Math.floor(Math.random() * state.length)];
      loadOrb(title || transcript.slice(0, 16) || fb.nameJp,
        vidUrl || "assets/footage/" + fb.ticker + ".mp4?v=20260622",
        imgUrl  || "assets/footage/" + fb.ticker + ".jpg?v=20260622", finalPrice);
    }

    // ── 視覚名詞テーブル（具体的に見えるもの → Pexels直接検索・長い語優先）──
    // キー: 日本語（漢字/カタカナ/ひらがな全て） → ローカルファイルslug
    const VISUAL_NOUNS = {
      // 恐竜
      "ティラノサウルス":"dinosaur","てぃらのさうるす":"dinosaur","velociraptor":"dinosaur",
      "ヴェロキラプトル":"dinosaur","プテラノドン":"dinosaur","トリケラトプス":"dinosaur",
      "恐竜":"dinosaur","きょうりゅう":"dinosaur","マンモス":"dinosaur",
      "まんもす":"dinosaur","dinosaur":"dinosaur","prehistoric":"dinosaur",
      // ドラゴン
      "ドラゴン":"dragon","どらごん":"dragon","龍":"dragon","りゅう":"dragon",
      "竜":"dragon","dragon":"dragon","フェニックス":"phoenix","ふぇにっくす":"phoenix",
      "フェニクス":"phoenix","phoenix":"phoenix","グリフィン":"griffin","ユニコーン":"unicorn",
      "ゆにこーん":"unicorn","人魚":"mermaid","にんぎょ":"mermaid","mermaid":"mermaid",
      // オオカミ
      "ウェアウルフ":"werewolf","うぇあうるふ":"werewolf","狼男":"werewolf","おおかみおとこ":"werewolf",
      "werewolf":"werewolf","狼":"wolf","おおかみ":"wolf","オオカミ":"wolf","wolf":"wolf",
      // クマ
      "グリズリー":"bear","ぐりずりー":"bear","ホッキョクグマ":"bear","ほっきょくぐま":"bear",
      "熊":"bear","くま":"bear","クマ":"bear","bear":"bear",
      // トラ・ライオン
      "チーター":"tiger","ヒョウ":"tiger","豹":"tiger","ひょう":"tiger",
      "虎":"tiger","とら":"tiger","tiger":"tiger","ライオン":"lion",
      "らいおん":"lion","lion":"lion","ゴリラ":"gorilla","ごりら":"gorilla",
      "gorilla":"gorilla","象":"elephant","ぞう":"elephant","elephant":"elephant",
      // サメ
      "ホホジロザメ":"shark","ほほじろざめ":"shark","サメ":"shark","さめ":"shark",
      "ジョーズ":"shark","shark":"shark","深海":"deep_sea","しんかい":"deep_sea",
      "海底":"deep_sea","かいてい":"deep_sea","ダイオウイカ":"octopus",
      "タコ":"octopus","たこ":"octopus","octopus":"octopus",
      "クラゲ":"jellyfish","くらげ":"jellyfish","jellyfish":"jellyfish",
      "クジラ":"whale","くじら":"whale","whale":"whale",
      "シャチ":"whale","しゃち":"whale",
      // 蛇
      "コブラ":"snake","こぶら":"snake","アナコンダ":"snake","あなこんだ":"snake",
      "ニシキヘビ":"snake","にしきへび":"snake","蛇":"snake","へび":"snake",
      "ヘビ":"snake","snake":"snake","ワニ":"crocodile","わに":"crocodile",
      "クロコダイル":"crocodile","くろこだいる":"crocodile","crocodile":"crocodile",
      "トカゲ":"snake","とかげ":"snake","爬虫類":"snake","はちゅうるい":"snake",
      // 蜘蛛・虫
      "タランチュラ":"spider","たらんちゅら":"spider","蜘蛛":"spider","くも":"spider",
      "クモ":"spider","spider":"spider","サソリ":"scorpion","さそり":"scorpion",
      "scorpion":"scorpion","スズメバチ":"bee_swarm","すずめばち":"bee_swarm",
      "蜂":"bee_swarm","はち":"bee_swarm","ハチ":"bee_swarm","bee":"bee_swarm",
      "ゴキブリ":"spider","ごきぶり":"spider","虫":"spider","むし":"spider",
      // ゾンビ・アンデッド
      "ゾンビ":"zombie","ぞんび":"zombie","zombie":"zombie","アンデッド":"zombie",
      "スケルトン":"skeleton","すけるとん":"skeleton","skeleton":"skeleton",
      "ミイラ":"mummy","みいら":"mummy","mummy":"mummy",
      "吸血鬼":"vampire","きゅうけつき":"vampire","ヴァンパイア":"vampire","vampire":"vampire",
      // 幽霊・悪魔
      "幽霊":"ghost","ゆうれい":"ghost","お化け":"ghost","おばけ":"ghost",
      "お化":"ghost","ghost":"ghost","怨霊":"ghost","おんりょう":"ghost",
      "悪霊":"ghost","あくりょう":"ghost","ポルターガイスト":"ghost",
      "悪魔":"demon","あくま":"demon","デビル":"demon","devil":"demon",
      "demon":"demon","地獄":"demon","じごく":"demon","鬼が":"demon","おにが":"demon",
      "鬼は":"demon","鬼に":"demon","赤鬼":"demon","青鬼":"demon","鬼の":"demon",
      "呪い":"ritual","のろい":"ritual","儀式":"ritual","ぎしき":"ritual",
      // 宇宙人
      "宇宙人":"alien","うちゅうじん":"alien","エイリアン":"alien","alien":"alien","UFO":"alien",
      "怪物":"monster","かいぶつ":"monster","化け物":"monster","ばけもの":"monster",
      "monster":"monster","怪獣":"kaiju","かいじゅう":"kaiju","kaiju":"kaiju",
      "巨人":"kaiju","きょじん":"kaiju","giant":"kaiju",
      // 自然災害
      "火山":"volcano","かざん":"volcano","溶岩":"volcano","ようがん":"volcano","volcano":"volcano",
      "津波":"tsunami","つなみ":"tsunami","tsunami":"tsunami",
      "竜巻":"tornado","たつまき":"tornado","tornado":"tornado",
      "ハリケーン":"tornado","台風":"tornado","たいふう":"tornado",
      "雷":"lightning","かみなり":"lightning","lightning":"lightning",
      "山火事":"wildfire","やまかじ":"wildfire","wildfire":"wildfire",
      "嵐":"lightning","あらし":"lightning","storm":"lightning",
      "洪水":"flood","こうずい":"flood","flood":"flood",
      "地震":"earthquake","じしん":"earthquake","earthquake":"earthquake",
      "雪崩":"avalanche","なだれ":"avalanche","avalanche":"avalanche",
      "砂嵐":"sandstorm","すなあらし":"sandstorm","sandstorm":"sandstorm",
      // 場所
      "廃墟":"ruins","はいきょ":"ruins","廃病院":"ruins","廃屋":"ruins","ruins":"ruins",
      "洞窟":"cave","どうくつ":"cave","洞":"cave","cave":"cave",
      "迷宮":"labyrinth","めいきゅう":"labyrinth","迷路":"labyrinth","labyrinth":"labyrinth",
      "城":"castle","しろ":"castle","城塞":"castle","castle":"castle",
      "要塞":"castle","ようさい":"castle","fortress":"castle",
      "墓地":"cemetery","ぼち":"cemetery","墓":"cemetery","はか":"cemetery","cemetery":"cemetery",
      "地下牢":"dungeon","ちかろう":"dungeon","牢":"dungeon","dungeon":"dungeon",
      "ピラミッド":"pyramid","ぴらみっど":"pyramid","pyramid":"pyramid",
      "深海":"deep_sea","しんかい":"deep_sea","海溝":"deep_sea","deep sea":"deep_sea",
      "暗い森":"forest_dark","くらいもり":"forest_dark","霧の森":"forest_dark",
      "霧":"fog","きり":"fog","fog":"fog",
      // 武器・その他
      "剣":"sword","つるぎ":"sword","けん":"sword","sword":"sword","刀":"sword","かたな":"sword",
      "炎":"fire","ほのお":"fire","火":"fire","fire":"fire",
      "爆発":"explosion","ばくはつ":"explosion","explosion":"explosion",
      "血":"blood","blood":"blood",
      "鎖":"chain","くさり":"chain","chain":"chain",
      "鏡":"mirror_dark","かがみ":"mirror_dark","時計":"clock","とけい":"clock",
      "宇宙船":"spaceship","うちゅうせん":"spaceship","spacecraft":"spaceship","spaceship":"spaceship",
      "ブラックホール":"black_hole","ぶらっくほーる":"black_hole","black hole":"black_hole",
      "サムライ":"samurai","さむらい":"samurai","侍":"samurai","samurai":"samurai",
      "忍者":"ninja","にんじゃ":"ninja","ninja":"ninja",
      "ロボット":"robot_dark","ろぼっと":"robot_dark","robot":"robot_dark",
      "サイボーグ":"cyborg","さいぼーぐ":"cyborg","cyborg":"cyborg",
      // ── 動物（追加） ──
      "馬":"horse","うま":"horse","ウマ":"horse","horse":"horse",
      "キツネ":"fox","きつね":"fox","狐":"fox","fox":"fox",
      "鹿":"deer","しか":"deer","シカ":"deer","deer":"deer",
      "ウサギ":"rabbit","うさぎ":"rabbit","兎":"rabbit","rabbit":"rabbit",
      "黒猫":"cat_black","くろねこ":"cat_black","黒い猫":"cat_black","black cat":"cat_black",
      "コウモリ":"bat","こうもり":"bat","bat":"bat",
      "蝶":"butterfly","ちょうちょ":"butterfly","バタフライ":"butterfly","butterfly":"butterfly",
      "カエル":"frog","かえる":"frog","蛙":"frog","frog":"frog",
      "カラスの群":"crow_flock","むれのからす":"crow_flock","鴉の群":"crow_flock","crow flock":"crow_flock",
      "魚の群":"fish_school","さかなのむれ":"fish_school","群れの魚":"fish_school","fish school":"fish_school",
      "イルカ":"dolphin","いるか":"dolphin","dolphin":"dolphin",
      "ペンギン":"penguin","ぺんぎん":"penguin","penguin":"penguin",
      "タカ":"hawk","たか":"hawk","鷹":"hawk","hawk":"hawk",
      "フラミンゴ":"flamingo","ふらみんご":"flamingo","flamingo":"flamingo",
      "クジャク":"peacock","くじゃく":"peacock","孔雀":"peacock","peacock":"peacock",
      "ネズミ":"rat","ねずみ":"rat","鼠":"rat","rat":"rat",
      "豚":"pig","ぶた":"pig","ブタ":"pig","pig":"pig",
      "牛":"cow","うし":"cow","ウシ":"cow","cow":"cow",
      "サル":"monkey","さる":"monkey","猿":"monkey","monkey":"monkey",
      "ラクダ":"camel","らくだ":"camel","camel":"camel",
      "オウム":"parrot","おうむ":"parrot","parrot":"parrot",
      "カメ":"turtle","かめ":"turtle","亀":"turtle","turtle":"turtle",
      "カニ":"crab","かに":"crab","蟹":"crab","crab":"crab",
      "蚊":"mosquito","か":"mosquito","モスキート":"mosquito","mosquito":"mosquito",
      "イナゴ":"locust","いなご":"locust","バッタ":"locust","locust":"locust",
      // ── 場所（追加） ──
      "病室":"hospital_room","びょうしつ":"hospital_room","hospital room":"hospital_room",
      "教室":"classroom","きょうしつ":"classroom","classroom":"classroom",
      "独房":"prison_cell","どくぼう":"prison_cell","prison cell":"prison_cell","独居房":"prison_cell",
      "暗い図書館":"library_dark","くらいとしょかん":"library_dark","dark library":"library_dark",
      "夜の電車":"train_night","よるのでんしゃ":"train_night","night train":"train_night",
      "地下鉄":"subway","ちかてつ":"subway","subway":"subway",
      "空港":"airport","くうこう":"airport","airport":"airport",
      "港":"harbor","みなと":"harbor","ハーバー":"harbor","harbor":"harbor",
      "暗い橋":"bridge_dark","くらいはし":"bridge_dark","dark bridge":"bridge_dark",
      "夜の高層ビル":"skyscraper_night","よるのこうそうびる":"skyscraper_night","skyscraper night":"skyscraper_night",
      "教会":"church","きょうかい":"church","church":"church",
      "神社":"japanese_shrine","じんじゃ":"japanese_shrine","shrine":"japanese_shrine",
      "古代寺院":"temple_ancient","こだいじいん":"temple_ancient","ancient temple":"temple_ancient",
      "市場":"marketplace","いちば":"marketplace","marketplace":"marketplace",
      "劇場":"theater_dark","げきじょう":"theater_dark","theater":"theater_dark",
      "スタジアム":"stadium_night","すたじあむ":"stadium_night","stadium":"stadium_night",
      "灯台":"lighthouse","とうだい":"lighthouse","lighthouse":"lighthouse",
      "屋敷":"mansion","やしき":"mansion","mansion":"mansion","洋館":"mansion","ようかん":"mansion",
      "屋上":"rooftop","おくじょう":"rooftop","rooftop":"rooftop",
      "下水道":"sewer","げすいどう":"sewer","sewer":"sewer",
      "夜の遊園地":"carnival_night","よるのゆうえんち":"carnival_night","carnival night":"carnival_night",
      "古い町":"old_town","ふるいまち":"old_town","old town":"old_town",
      "宇宙ステーション":"space_station","うちゅうすてーしょん":"space_station","space station":"space_station",
      "北極":"arctic","ほっきょく":"arctic","arctic":"arctic","南極":"arctic","なんきょく":"arctic",
      "ジャングル":"jungle","じゃんぐる":"jungle","jungle":"jungle",
      "夜の海岸":"beach_night","よるのかいがん":"beach_night","beach night":"beach_night",
      "雪原":"snow_field","ゆきはら":"snow_field","snow field":"snow_field",
      "紅葉の森":"autumn_forest","こうようのもり":"autumn_forest","autumn forest":"autumn_forest",
      "霧の墓地":"graveyard_fog","きりのぼち":"graveyard_fog","graveyard fog":"graveyard_fog",
      "地下壕":"underground_bunker","ちかごう":"underground_bunker","bunker":"underground_bunker",
      // ── ホラー・ダーク（追加） ──
      "影の人影":"shadow_figure","かげのひとかげ":"shadow_figure","shadow figure":"shadow_figure",
      "不気味な人形":"creepy_doll","きみわるいにんぎょう":"creepy_doll","creepy doll":"creepy_doll",
      "ホラーピエロ":"clown_horror","ほらーぴえろ":"clown_horror","horror clown":"clown_horror",
      "かかし":"scarecrow","案山子":"scarecrow","スケアクロウ":"scarecrow","scarecrow":"scarecrow",
      "死神":"grim_reaper","しにがみ":"grim_reaper","grim reaper":"grim_reaper","グリムリーパー":"grim_reaper",
      "堕天使":"dark_angel","だてんし":"dark_angel","dark angel":"dark_angel","fallen angel":"dark_angel",
      "魔女":"witch_dark","まじょ":"witch_dark","witch":"witch_dark",
      "ホラーマスク":"mask_horror","ほらーますく":"mask_horror","horror mask":"mask_horror",
      "マネキン":"mannequin_dark","まねきん":"mannequin_dark","mannequin":"mannequin_dark",
      "割れたガラス":"broken_glass","われたがらす":"broken_glass","broken glass":"broken_glass",
      "手が伸びてくる":"hand_reaching","てがのびてくる":"hand_reaching","hand reaching":"hand_reaching",
      "目が見ている":"eye_watching","めがみている":"eye_watching","eye watching":"eye_watching",
      "人形劇":"puppet_dark","にんぎょうげき":"puppet_dark","puppet":"puppet_dark",
      "暗い廊下":"dark_corridor","くらいろうか":"dark_corridor","dark corridor":"dark_corridor",
      "点滅する光":"flickering_light","てんめつするひかり":"flickering_light","flickering light":"flickering_light",
      // ── 超自然・神話（追加） ──
      "天使":"angel_white","てんし":"angel_white","angel":"angel_white","エンジェル":"angel_white",
      "天狗":"tengu","てんぐ":"tengu","tengu":"tengu",
      "河童":"kappa","かっぱ":"kappa","kappa":"kappa",
      "雪女":"snow_woman","ゆきおんな":"snow_woman","snow woman":"snow_woman",
      "鬼の顔":"oni_face","おにのかお":"oni_face","鬼面":"oni_face","oni":"oni_face",
      "鳥居":"torii_gate","とりい":"torii_gate","torii":"torii_gate",
      "夜の神社":"shrine_night","よるのじんじゃ":"shrine_night","shrine night":"shrine_night",
      "死の擬人化":"death_personified","しのぎじんか":"death_personified","death figure":"death_personified",
      "黒い猫の夜":"black_cat_night","くろいねこのよる":"black_cat_night","black cat night":"black_cat_night",
      "カラスの予兆":"crow_omen","からすのよちょう":"crow_omen","crow omen":"crow_omen",
      "大きな蜘蛛の巣":"spider_web_large","おおきなくものす":"spider_web_large","spider web":"spider_web_large",
      // ── オブジェクト・シンボル（追加） ──
      "古い鍵":"key_old","ふるいかぎ":"key_old","old key":"key_old",
      "暗い扉":"door_dark","くらいとびら":"door_dark","dark door":"door_dark",
      "宝箱":"treasure_chest","たからばこ":"treasure_chest","treasure chest":"treasure_chest",
      "王冠":"crown_royal","おうかん":"crown_royal","crown":"crown_royal","クラウン":"crown_royal",
      "砂時計":"hourglass_dark","すなどけい":"hourglass_dark","hourglass":"hourglass_dark",
      "望遠鏡":"telescope_night","ぼうえんきょう":"telescope_night","telescope":"telescope_night",
      "古い本":"ancient_book","ふるいほん":"ancient_book","魔法書":"ancient_book","ancient book":"ancient_book",
      "ろうそく":"candle_dark","蝋燭":"candle_dark","キャンドル":"candle_dark","candle":"candle_dark",
      "コンパス":"compass","こんぱす":"compass","方位磁石":"compass","compass":"compass",
      "毒の瓶":"poison_bottle","どくのびん":"poison_bottle","poison bottle":"poison_bottle",
      "ウエディングドレス":"wedding_dress","うえでぃんぐどれす":"wedding_dress","wedding dress":"wedding_dress",
      "割れた鏡":"broken_mirror","われたかがみ":"broken_mirror","broken mirror":"broken_mirror",
      "古い写真":"old_photograph","ふるいしゃしん":"old_photograph","old photo":"old_photograph",
      "鍵のかかった箱":"locked_box","かぎのかかったはこ":"locked_box","locked box":"locked_box",
      "金の鳥籠":"golden_cage","きんのとりかご":"golden_cage","golden cage":"golden_cage",
      "お守り":"amulet","おまもり":"amulet","amulet":"amulet","護符":"amulet","ごふ":"amulet",
      "古地図":"ruins_map","ふるちず":"ruins_map","treasure map":"ruins_map",
      // ── 感情（視覚）（追加） ──
      "孤独な空間":"loneliness_empty","こどくなくうかん":"loneliness_empty","loneliness":"loneliness_empty",
      "お祭りの喜び":"joy_festival","おまつりのよろこび":"joy_festival","joy festival":"joy_festival",
      "懐かしさ":"nostalgia_sepia","なつかしさ":"nostalgia_sepia","nostalgia":"nostalgia_sepia",
      "怒りの炎":"rage_fire","いかりのほのお":"rage_fire","rage fire":"rage_fire",
      "悲しみの雨":"grief_rain","かなしみのあめ":"grief_rain","grief rain":"grief_rain",
      "不安な群衆":"anxiety_crowd","ふあんなぐんしゅう":"anxiety_crowd","anxiety crowd":"anxiety_crowd",
      "不思議な光":"wonder_light","ふしぎなひかり":"wonder_light","wonder light":"wonder_light",
      "恐怖の暗闇":"dread_darkness","きょうふのくらやみ":"dread_darkness","dread darkness":"dread_darkness",
      // ── 職業（夢の中の）（追加） ──
      "外科医":"surgeon_operating","げかい":"surgeon_operating","surgeon":"surgeon_operating",
      "宇宙飛行士":"astronaut_spacewalk","うちゅうひこうし":"astronaut_spacewalk","astronaut":"astronaut_spacewalk",
      "王様":"king_throne","おうさま":"king_throne","国王":"king_throne","king":"king_throne",
      "科学者":"scientist_lab","かがくしゃ":"scientist_lab","scientist":"scientist_lab",
      "スパイ":"spy_shadow","すぱい":"spy_shadow","spy":"spy_shadow",
      "騎士":"knight_armor","きし":"knight_armor","knight":"knight_armor","ナイト":"knight_armor",
      "剣闘士":"gladiator_arena","けんとうし":"gladiator_arena","gladiator":"gladiator_arena",
      "死刑執行人":"executioner_dark","しけいしっこうにん":"executioner_dark","executioner":"executioner_dark",
      "探偵":"detective_noir","たんてい":"detective_noir","detective":"detective_noir",
      "パイロット":"pilot_cockpit","ぱいろっと":"pilot_cockpit","pilot":"pilot_cockpit",
      // ── 自然・天気（追加） ──
      "虹":"rainbow","にじ":"rainbow","rainbow":"rainbow",
      "オーロラ":"aurora_borealis","おーろら":"aurora_borealis","aurora":"aurora_borealis","北極光":"aurora_borealis",
      "日食":"solar_eclipse","にっしょく":"solar_eclipse","solar eclipse":"solar_eclipse",
      "吹雪":"blizzard","ふぶき":"blizzard","blizzard":"blizzard",
      "落雷":"lightning_strike","らくらい":"lightning_strike","lightning strike":"lightning_strike",
      "流星群":"meteor_shower","りゅうせいぐん":"meteor_shower","meteor shower":"meteor_shower",
      "深海底":"deep_ocean","しんかいてい":"deep_ocean","deep ocean":"deep_ocean",
      "溶岩流":"lava_flow","ようがんりゅう":"lava_flow","lava flow":"lava_flow",
      "流砂":"quicksand","りゅうさ":"quicksand","quicksand":"quicksand",
      "渦潮":"whirlpool","うずしお":"whirlpool","whirlpool":"whirlpool",
      "キノコの森":"mushroom_forest","きのこのもり":"mushroom_forest","mushroom forest":"mushroom_forest",
      "水晶洞窟":"crystal_cave","すいしょうどうくつ":"crystal_cave","crystal cave":"crystal_cave",
      "凍った湖":"frozen_lake","こおったこ":"frozen_lake","frozen lake":"frozen_lake",
      "火山灰":"volcanic_ash","かざんばい":"volcanic_ash","volcanic ash":"volcanic_ash",
      // ── テック・SF（追加） ──
      "タイムマシン":"time_machine","たいむましん":"time_machine","time machine":"time_machine",
      "転送ポータル":"portal_vortex","てんそうぽーたる":"portal_vortex","portal":"portal_vortex",
      "AIの顔":"ai_face","えーあいのかお":"ai_face","AI face":"ai_face","人工知能の顔":"ai_face",
      "ウイルス":"virus_microscopic","びいるす":"virus_microscopic","virus":"virus_microscopic","細菌":"virus_microscopic",
      "原子力発電所":"nuclear_plant","げんしりょくはつでんしょ":"nuclear_plant","nuclear plant":"nuclear_plant",
      "ドローンの群":"drone_swarm","どろーんのむれ":"drone_swarm","drone swarm":"drone_swarm",
      "データストリーム":"data_stream","でーたすとりーむ":"data_stream","data stream":"data_stream",
      "ホログラム":"hologram","ほろぐらむ":"hologram","hologram":"hologram",
      "アンドロイドの顔":"android_face","あんどろいどのかお":"android_face","android":"android_face",
      // ── 食・身体（追加） ──
      "豪華な食卓":"feast_table","ごうかなしょくたく":"feast_table","feast":"feast_table",
      "毒の杯":"poison_cup","どくのさかずき":"poison_cup","poison cup":"poison_cup",
      "薬の暗闇":"medicine_dark","くすりのくらやみ":"medicine_dark","medicine dark":"medicine_dark",
      "注射器":"syringe_medical","ちゅうしゃき":"syringe_medical","syringe":"syringe_medical",
      "目のアップ":"eye_closeup","めのあっぷ":"eye_closeup","eye closeup":"eye_closeup",
      "歯のアップ":"teeth_close","はのあっぷ":"teeth_close","teeth closeup":"teeth_close",
      "老いた手":"hands_aging","おいたて":"hands_aging","aging hands":"hands_aging",
      "鏡の顔":"face_mirror","かがみのかお":"face_mirror","face mirror":"face_mirror",
      // ── 未参照スラグを全追加 ──
      // 感情・雰囲気
      "不安":"anxiety_crowd","ふあん":"anxiety_crowd","anxiety":"anxiety_crowd","パニック":"anxiety_crowd",
      "孤独感":"loneliness_empty","こどくかん":"loneliness_empty","loneliness":"loneliness_empty",
      "喜び":"joy_festival","よろこび":"joy_festival","joy":"joy_festival","祭り":"joy_festival","まつり":"joy_festival",
      "懐かしい":"nostalgia_sepia","なつかしい":"nostalgia_sepia","nostalgia":"nostalgia_sepia","昔の記憶":"nostalgia_sepia",
      "怒り":"rage_fire","いかり":"rage_fire","rage":"rage_fire","激怒":"rage_fire",
      "悲しみ":"grief_rain","かなしみ":"grief_rain","grief":"grief_rain","涙雨":"grief_rain",
      "恐怖":"dread_darkness","きょうふ":"dread_darkness","dread":"dread_darkness","恐れ":"dread_darkness",
      "驚き":"wonder_light","おどろき":"wonder_light","wonder":"wonder_light","奇跡の光":"wonder_light",
      // 場所・建物（未参照）
      "病室":"hospital_room","びょうしつ":"hospital_room","hospital room":"hospital_room","入院":"hospital_room",
      "夜の砂浜":"beach_night","よるのすなはま":"beach_night","beach at night":"beach_night",
      "秋の森":"autumn_forest","あきのもり":"autumn_forest","autumn forest":"autumn_forest","紅葉の森":"autumn_forest",
      "雪原":"snow_field","せつげん":"snow_field","snow field":"snow_field","雪野原":"snow_field",
      "夜の病院":"hospital_room",
      "古い町":"old_town","ふるいまち":"old_town","old town":"old_town","レトロな街":"old_town",
      "暗い橋":"bridge_dark","くらいはし":"bridge_dark","dark bridge":"bridge_dark","霧の橋":"bridge_dark",
      "夜のスタジアム":"stadium_night","よるのすたじあむ":"stadium_night","stadium night":"stadium_night",
      "夜の摩天楼":"skyscraper_night","よるのまてんろう":"skyscraper_night","skyscraper at night":"skyscraper_night",
      "夜の列車":"train_night","よるのれっしゃ":"train_night","night train":"train_night","夜汽車":"train_night",
      "宇宙ステーション":"space_station","うちゅうすてーしょん":"space_station","space station":"space_station",
      "神社の夜":"shrine_night","じんじゃのよる":"shrine_night","shrine at night":"shrine_night",
      "地下壕":"underground_bunker","ちかごう":"underground_bunker","bunker":"underground_bunker","地下シェルター":"underground_bunker",
      "廃墟の地図":"ruins_map","はいきょのちず":"ruins_map","ruins map":"ruins_map",
      "暗い図書館":"library_dark","くらいとしょかん":"library_dark","dark library":"library_dark",
      "暗い劇場":"theater_dark","くらいげきじょう":"theater_dark","dark theater":"theater_dark",
      "夜の遊園地":"carnival_night","よるのゆうえんち":"carnival_night","carnival at night":"carnival_night",
      "暗い廊下":"dark_corridor","くらいろうか":"dark_corridor","dark corridor":"dark_corridor","廊下の闇":"dark_corridor",
      "霧の墓地":"graveyard_fog","きりのぼち":"graveyard_fog","graveyard fog":"graveyard_fog","墓場の霧":"graveyard_fog",
      // ホラー・超自然（未参照）
      "不気味な人形":"creepy_doll","ふきみなにんぎょう":"creepy_doll","creepy doll":"creepy_doll","ホラー人形":"creepy_doll",
      "道化師":"clown_horror","どうけし":"clown_horror","clown":"clown_horror","ピエロ":"clown_horror","ぴえろ":"clown_horror",
      "かかし":"scarecrow","案山子":"scarecrow","scarecrow":"scarecrow",
      "黒い天使":"dark_angel","くろいてんし":"dark_angel","dark angel":"dark_angel","堕天使":"dark_angel","だてんし":"dark_angel",
      "マネキン":"mannequin_dark","まねきん":"mannequin_dark","mannequin":"mannequin_dark","不気味なマネキン":"mannequin_dark",
      "壊れた鏡":"broken_mirror","こわれたかがみ":"broken_mirror","broken mirror":"broken_mirror",
      "割れたガラス":"broken_glass","われたがらす":"broken_glass","broken glass":"broken_glass",
      "仮面":"mask_horror","かめん":"mask_horror","mask":"mask_horror","マスク":"mask_horror","能面":"mask_horror",
      "ちらつく光":"flickering_light","ちらつくひかり":"flickering_light","flickering light":"flickering_light",
      "手が伸びる":"hand_reaching","てがのびる":"hand_reaching","hand reaching":"hand_reaching","迫ってくる手":"hand_reaching",
      "監視の目":"eye_watching","かんしのめ":"eye_watching","eye watching":"eye_watching","見つめられる":"eye_watching",
      "操り人形":"puppet_dark","あやつりにんぎょう":"puppet_dark","puppet":"puppet_dark","でく人形":"puppet_dark",
      "影の人物":"shadow_figure","かげのじんぶつ":"shadow_figure","shadow figure":"shadow_figure","謎の影":"shadow_figure",
      "死の人格化":"death_personified","しのじんかくか":"death_personified","death personified":"death_personified",
      // 神話・宗教（未参照）
      "天使":"angel_white","てんし":"angel_white","angel":"angel_white","白い天使":"angel_white",
      "雪女":"snow_woman","ゆきおんな":"snow_woman","snow woman":"snow_woman","白い妖怪":"snow_woman",
      "鬼の面":"oni_face","おにのめん":"oni_face","oni mask":"oni_face","般若の面":"oni_face",
      "古い本":"ancient_book","ふるいほん":"ancient_book","ancient book":"ancient_book","魔道書":"ancient_book","まどうしょ":"ancient_book",
      "蝋燭":"candle_dark","ろうそく":"candle_dark","candle":"candle_dark","キャンドル":"candle_dark",
      "古い写真":"old_photograph","ふるいしゃしん":"old_photograph","old photograph":"old_photograph","セピア写真":"old_photograph",
      "黄金の檻":"golden_cage","おうごんのおり":"golden_cage","golden cage":"golden_cage","金の鳥かご":"golden_cage",
      "お守り":"amulet","おまもり":"amulet","amulet":"amulet","護符":"amulet",
      "毒の瓶":"poison_bottle","どくのびん":"poison_bottle","poison bottle":"poison_bottle",
      "ウェディングドレス":"wedding_dress","うえでぃんぐどれす":"wedding_dress","wedding dress":"wedding_dress","花嫁衣装":"wedding_dress",
      "望遠鏡":"telescope_night","ぼうえんきょう":"telescope_night","telescope":"telescope_night",
      "錠前":"locked_box","じょうまえ":"locked_box","locked box":"locked_box","封印された箱":"locked_box",
      "羅針盤":"compass","らしんばん":"compass","compass":"compass",
      // 食べ物・身体（未参照・食べ物系を充実）
      "ピーマン":"feast_table","食べたくない":"feast_table","嫌いな食べ物":"feast_table","食べさせられる":"feast_table",
      "食べ物":"feast_table","たべもの":"feast_table","料理":"feast_table","りょうり":"feast_table","food":"feast_table",
      "宴会":"feast_table","えんかい":"feast_table","御馳走":"feast_table","ごちそう":"feast_table","feast":"feast_table",
      "薬を飲む":"medicine_dark","くすりをのむ":"medicine_dark","medicine":"medicine_dark","薬":"medicine_dark","くすり":"medicine_dark",
      "注射":"syringe_medical","ちゅうしゃ":"syringe_medical","injection":"syringe_medical","針":"syringe_medical","はり":"syringe_medical",
      // ── Food ──
      "ラーメン":"ramen","らーめん":"ramen","ramen":"ramen","ラメン":"ramen",
      "寿司":"sushi","すし":"sushi","sushi":"sushi","お寿司":"sushi",
      "ごはん":"rice_bowl","ご飯":"rice_bowl","rice":"rice_bowl","お米":"rice_bowl",
      "ケーキ":"cake_sweet","けーき":"cake_sweet","cake":"cake_sweet","誕生日ケーキ":"cake_sweet",
      "アイスクリーム":"ice_cream","あいす":"ice_cream","ice cream":"ice_cream","ソフトクリーム":"ice_cream",
      "野菜":"vegetables","やさい":"vegetables","ピーマン":"vegetables","にんじん":"vegetables","ブロッコリー":"vegetables",
      "パン":"bread","ぱん":"bread","bread":"bread","トースト":"bread",
      "チョコレート":"chocolate","ちょこ":"chocolate","chocolate":"chocolate",
      "ピザ":"pizza","ぴざ":"pizza","pizza":"pizza",
      "ハンバーガー":"fast_food","はんばーがー":"fast_food","burger":"fast_food","ファストフード":"fast_food",
      "コーヒー":"coffee_dark","こーひー":"coffee_dark","coffee":"coffee_dark",
      "弁当":"bento","べんとう":"bento","bento":"bento","お弁当":"bento",
      "麺":"noodles","めん":"noodles","noodles":"noodles","うどん":"noodles","そば":"noodles","パスタ":"noodles",
      "給食":"school_lunch","きゅうしょく":"school_lunch","school lunch":"school_lunch","学校の食事":"school_lunch",
      "バーベキュー":"barbecue","ばーべきゅー":"barbecue","barbecue":"barbecue","BBQ":"barbecue",
      "スイカ":"watermelon","すいか":"watermelon","watermelon":"watermelon",
      "お酒":"alcohol_drink","さけ":"alcohol_drink","alcohol":"alcohol_drink","ビール":"alcohol_drink","ワイン":"alcohol_drink",
      "お茶":"tea_ceremony","おちゃ":"tea_ceremony","tea":"tea_ceremony","茶道":"tea_ceremony",
      "果物":"fruit_bowl","くだもの":"fruit_bowl","フルーツ":"fruit_bowl","fruit":"fruit_bowl",
      "ジュース":"soda_drink","じゅーす":"soda_drink","soda":"soda_drink","コーラ":"soda_drink",
      // ── Places ──
      "コンビニ":"convenience_store","こんびに":"convenience_store","convenience store":"convenience_store",
      "スーパー":"supermarket","すーぱー":"supermarket","supermarket":"supermarket","スーパーマーケット":"supermarket",
      "駅":"train_station_jp","えき":"train_station_jp","train station":"train_station_jp","鉄道":"train_station_jp",
      "オフィス":"office_building","おふぃす":"office_building","office":"office_building","職場":"office_building",
      "マンション":"apartment_night","まんしょん":"apartment_night","apartment":"apartment_night","アパート":"apartment_night",
      "レストラン":"restaurant_dark","れすとらん":"restaurant_dark","restaurant":"restaurant_dark","飲食店":"restaurant_dark",
      "喫茶店":"cafe_morning","きっさてん":"cafe_morning","cafe":"cafe_morning",
      "公園":"park_bench","こうえん":"park_bench","park":"park_bench","公園のベンチ":"park_bench",
      "遊び場":"playground","あそびば":"playground","playground":"playground","公園の遊具":"playground",
      "ゲームセンター":"arcade","げーむせんたー":"arcade","arcade":"arcade","ゲーセン":"arcade",
      "カラオケ":"karaoke","からおけ":"karaoke","karaoke":"karaoke",
      "居酒屋":"izakaya","いざかや":"izakaya","izakaya":"izakaya","居酒屋の夜":"izakaya",
      "温泉":"onsen","おんせん":"onsen","onsen":"onsen","温泉に入る":"onsen","hot spring":"onsen",
      "日本庭園":"temple_garden","にほんていえん":"temple_garden","japanese garden":"temple_garden","禅庭園":"temple_garden",
      "美術館":"museum_dark","びじゅつかん":"museum_dark","museum":"museum_dark","博物館":"museum_dark",
      "夏のビーチ":"beach_summer","なつのびーち":"beach_summer","beach summer":"beach_summer","夏の海":"beach_summer",
      "スキー場":"ski_slope","すきーじょう":"ski_slope","ski slope":"ski_slope","スキー":"ski_slope",
      "コンサートホール":"concert_hall","こんさーとほーる":"concert_hall","concert hall":"concert_hall","ホール":"concert_hall",
      "迷宮の廊下":"maze_dark","めいきゅうのろうか":"maze_dark","dark maze":"maze_dark",
      // ── Transportation ──
      "自転車":"bicycle","じてんしゃ":"bicycle","bicycle":"bicycle","チャリ":"bicycle",
      "バイク":"motorcycle","ばいく":"motorcycle","motorcycle":"motorcycle","オートバイ":"motorcycle",
      "バス":"bus_empty","ばす":"bus_empty","bus":"bus_empty","バスの中":"bus_empty",
      "タクシー":"taxi","たくしー":"taxi","taxi":"taxi","タクシーの夜":"taxi",
      "新幹線":"bullet_train","しんかんせん":"bullet_train","bullet train":"bullet_train","高速列車":"bullet_train",
      "飛行機の窓":"airplane_window","ひこうきのまど":"airplane_window","airplane window":"airplane_window","機内":"airplane_window",
      "ヘリコプター":"helicopter","へりこぷたー":"helicopter","helicopter":"helicopter",
      "船":"boat_ocean","ふね":"boat_ocean","boat":"boat_ocean","小舟":"boat_ocean",
      "潜水艦":"submarine","せんすいかん":"submarine","submarine":"submarine",
      "熱気球":"hot_air_balloon","ねつきゅう":"hot_air_balloon","hot air balloon":"hot_air_balloon","気球":"hot_air_balloon",
      "ロケット":"rocket_launch","ろけっと":"rocket_launch","rocket":"rocket_launch","打ち上げ":"rocket_launch",
      "救急車":"ambulance","きゅうきゅうしゃ":"ambulance","ambulance":"ambulance",
      "パトカー":"police_car","ぱとかー":"police_car","police car":"police_car",
      "消防車":"fire_truck","しょうぼうしゃ":"fire_truck","fire truck":"fire_truck",
      // ── Weather & Time ──
      "朝の光":"morning_light","あさのひかり":"morning_light","morning light":"morning_light","朝焼け":"morning_light",
      "真夜中の部屋":"midnight_room","まよなかのへや":"midnight_room","midnight room":"midnight_room",
      "夕焼け":"sunset_orange","ゆうやけ":"sunset_orange","sunset":"sunset_orange","夕日":"sunset_orange",
      "大雨":"heavy_rain","おおあめ":"heavy_rain","heavy rain":"heavy_rain","土砂降り":"heavy_rain",
      "静かな雪":"snowfall_quiet","しずかなゆき":"snowfall_quiet","snowfall":"snowfall_quiet","雪が降る":"snowfall_quiet",
      "深い霧":"thick_fog","ふかいきり":"thick_fog","thick fog":"thick_fog",
      "猛暑":"heatwave","もうしょ":"heatwave","heatwave":"heatwave","熱波":"heatwave",
      "雨上がり":"after_rain","あめあがり":"after_rain","after rain":"after_rain","水たまり":"after_rain",
      "窓の嵐":"storm_window","まどのあらし":"storm_window","storm window":"storm_window","窓から嵐":"storm_window",
      "強い日差し":"bright_sun","つよいひざし":"bright_sun","bright sun":"bright_sun","砂漠の太陽":"bright_sun",
      // ── Objects ──
      "スマートフォン":"smartphone","すまほ":"smartphone","smartphone":"smartphone","携帯電話":"smartphone",
      "壊れたスマホ":"broken_phone","こわれたすまほ":"broken_phone","broken phone":"broken_phone",
      "手紙":"old_letter","てがみ":"old_letter","letter":"old_letter","古い手紙":"old_letter",
      "洗面台の鏡":"mirror_bathroom","せんめんだいのかがみ":"mirror_bathroom","bathroom mirror":"mirror_bathroom",
      "空の財布":"empty_wallet","からのさいふ":"empty_wallet","empty wallet":"empty_wallet","お金がない":"empty_wallet",
      "パスポート":"passport_travel","ぱすぽーと":"passport_travel","passport":"passport_travel",
      "目覚まし時計":"alarm_clock","めざましどけい":"alarm_clock","alarm clock":"alarm_clock","アラーム":"alarm_clock",
      "鍵のかかったドア":"locked_door","かぎのかかったどあ":"locked_door","locked door":"locked_door","開かないドア":"locked_door",
      "夜の窓":"window_night","よるのまど":"window_night","window at night":"window_night","雨の窓":"window_night",
      "暗い階段":"staircase_dark","くらいかいだん":"staircase_dark","dark staircase":"staircase_dark","階段を降りる":"staircase_dark",
      "エレベーター":"elevator","えれべーたー":"elevator","elevator":"elevator","エレベーターに閉じ込め":"elevator",
      "壊れたテレビ":"broken_tv","こわれたてれび":"broken_tv","broken tv":"broken_tv","砂嵐のテレビ":"broken_tv",
      "古いラジオ":"old_radio","ふるいらじお":"old_radio","old radio":"old_radio","ラジオ":"old_radio",
      "ぬいぐるみ":"teddy_bear","テディベア":"teddy_bear","teddy bear":"teddy_bear","クマのぬいぐるみ":"teddy_bear",
      "おもちゃ箱":"toy_box","おもちゃばこ":"toy_box","toy box":"toy_box","玩具":"toy_box","おもちゃ":"toy_box",
      "結婚指輪":"wedding_ring","けっこんゆびわ":"wedding_ring","wedding ring":"wedding_ring","指輪":"wedding_ring",
      "壊れたメガネ":"glasses_broken","こわれためがね":"glasses_broken","broken glasses":"glasses_broken","メガネ":"glasses_broken",
      "カバン":"briefcase","かばん":"briefcase","briefcase":"briefcase","ブリーフケース":"briefcase",
      "買い物袋":"shopping_bag","かいものぶくろ":"shopping_bag","shopping bags":"shopping_bag","紙袋":"shopping_bag",
      "貯金箱":"piggy_bank","ちょきんばこ":"piggy_bank","piggy bank":"piggy_bank","豚の貯金箱":"piggy_bank",
      // ── People & Social ──
      "人混み":"crowd_busy","ひとごみ":"crowd_busy","crowd":"crowd_busy","雑踏":"crowd_busy",
      "誰もいない学校":"empty_school","がっこうのろうか":"empty_school","empty school":"empty_school","廃校":"empty_school",
      "授業":"classroom_kids","じゅぎょう":"classroom_kids","classroom kids":"classroom_kids","子供が勉強":"classroom_kids",
      "仕事のストレス":"office_stress","しごとのすとれす":"office_stress","office stress":"office_stress","締め切り":"office_stress",
      "家族の食事":"family_dinner","かぞくのしょくじ":"family_dinner","family dinner":"family_dinner","夕食家族":"family_dinner",
      "言い争い":"argument_people","いいあらそい":"argument_people","argument":"argument_people","喧嘩":"argument_people","けんか":"argument_people",
      "孤独な人":"lonely_person","こどくなひと":"lonely_person","lonely person":"lonely_person","一人でいる":"lonely_person",
      "遅刻":"running_late","ちこく":"running_late","running late":"running_late","走っている":"running_late",
      "迷子":"lost_person","まいご":"lost_person","lost":"lost_person","道に迷った":"lost_person",
      "面接":"job_interview","めんせつ":"job_interview","job interview":"job_interview","就職面接":"job_interview",
      "葬列":"funeral_procession","そうれつ":"funeral_procession","funeral procession":"funeral_procession","お葬式":"funeral_procession",
      "結婚式":"wedding_ceremony","けっこんしき":"wedding_ceremony","wedding":"wedding_ceremony","ブライダル":"wedding_ceremony",
      "誕生日パーティ":"birthday_party","たんじょうびぱーてぃ":"birthday_party","birthday party":"birthday_party",
      "卒業式":"graduation_ceremony","そつぎょうしき":"graduation_ceremony","graduation":"graduation_ceremony",
      "デモ活動":"protest_crowd","でもかつどう":"protest_crowd","protest":"protest_crowd","デモ":"protest_crowd",
      "スポーツ試合":"sports_game","すぽーつしあい":"sports_game","sports game":"sports_game","競技":"sports_game",
      "デート":"dating_couple","でーと":"dating_couple","date":"dating_couple","ロマンチックなディナー":"dating_couple",
      "老夫婦":"old_couple","ろうふうふ":"old_couple","elderly couple":"old_couple",
      "赤ちゃん":"newborn_baby","あかちゃん":"newborn_baby","baby":"newborn_baby","乳児":"newborn_baby",
      "診察":"doctor_patient","しんさつ":"doctor_patient","doctor visit":"doctor_patient","お医者さん":"doctor_patient",
      // ── Body & Health ──
      "走る":"running_person","はしる":"running_person","running":"running_person","マラソン":"running_person",
      "泳ぐ":"swimming_pool","およぐ":"swimming_pool","swimming":"swimming_pool","プール":"swimming_pool","すいえい":"swimming_pool",
      "ベッドで眠る":"sleeping_person","ねむる":"sleeping_person","sleeping":"sleeping_person","眠る":"sleeping_person",
      "病院のベッド":"hospital_bed","びょういんのべっど":"hospital_bed","hospital bed":"hospital_bed","入院中":"hospital_bed",
      "歯医者の椅子":"dentist_chair","はいしゃのいす":"dentist_chair","dentist chair":"dentist_chair","歯科":"dentist_chair",
      "手術室":"surgery_light","しゅじゅつしつ":"surgery_light","surgery":"surgery_light","オペ室":"surgery_light",
      "レントゲン":"x_ray","れんとげん":"x_ray","x-ray":"x_ray","骨格":"x_ray",
      "ヨガ":"yoga_meditation","よが":"yoga_meditation","yoga":"yoga_meditation","瞑想":"yoga_meditation","めいそう":"yoga_meditation",
      "泣いている":"crying_person","ないている":"crying_person","crying":"crying_person","泣く":"crying_person",
      "笑っている":"laughing_person","わらっている":"laughing_person","laughing":"laughing_person","笑う":"laughing_person",
      // ── Animals (more) ──
      "猫":"cat_sleeping","ねこ":"cat_sleeping","cat":"cat_sleeping","ネコ":"cat_sleeping","眠る猫":"cat_sleeping",
      "犬":"dog_running","いぬ":"dog_running","dog":"dog_running","イヌ":"dog_running","走る犬":"dog_running",
      "鳥籠":"bird_cage","とりかご":"bird_cage","bird cage":"bird_cage","鳥かご":"bird_cage",
      "水槽":"fish_tank","すいそう":"fish_tank","fish tank":"fish_tank","金魚":"fish_tank","きんぎょ":"fish_tank",
      "白いハト":"white_dove","しろいはと":"white_dove","white dove":"white_dove","平和の鳩":"white_dove",
      "黒鳥":"black_swan","くろとり":"black_swan","black swan":"black_swan","黒い白鳥":"black_swan",
      "白うさぎ":"rabbit_white","しろうさぎ":"rabbit_white","white rabbit":"rabbit_white","ふしぎの国":"rabbit_white",
      "暗闇の猫の目":"cat_eyes","くらやみのねこのめ":"cat_eyes","cat eyes":"cat_eyes","光る猫の目":"cat_eyes",
      // ── Nature & Seasons ──
      "桜":"cherry_blossom","さくら":"cherry_blossom","cherry blossom":"cherry_blossom","花見":"cherry_blossom",
      "紅葉の道":"autumn_path","こうようのみち":"autumn_path","autumn path":"autumn_path","秋の落ち葉":"autumn_path",
      "冬の雪景色":"winter_snow","ふゆのゆきけしき":"winter_snow","winter snow":"winter_snow","雪景色":"winter_snow",
      "夏の花畑":"summer_field","なつのはなばたけ":"summer_field","summer field":"summer_field","ひまわり畑":"summer_field",
      "雨の夜道":"rain_street","あめのよみち":"rain_street","rain street":"rain_street","雨が降る":"rain_street",
      "山から見る日の出":"sunrise_mountain","やまからみるひので":"sunrise_mountain","sunrise mountain":"sunrise_mountain",
      "満月":"full_moon","まんげつ":"full_moon","full moon":"full_moon","月夜":"full_moon",
      "流れ星":"shooting_star","ながれぼし":"shooting_star","shooting star":"shooting_star","流星":"shooting_star",
      "川の流れ":"river_flow","かわのながれ":"river_flow","river":"river_flow","小川":"river_flow",
      "水平線":"ocean_horizon","すいへいせん":"ocean_horizon","ocean horizon":"ocean_horizon","海の向こう":"ocean_horizon",
      "地震の亀裂":"earthquake_crack","じしんのきれつ":"earthquake_crack","earthquake crack":"earthquake_crack",
      "洪水の街":"flood_street","こうずいのまち":"flood_street","flood street":"flood_street","水没した道":"flood_street",
      "燃える木":"wildfire_tree","もえるき":"wildfire_tree","wildfire tree":"wildfire_tree","山火事の木":"wildfire_tree",
      "氷の嵐":"ice_storm","こおりのあらし":"ice_storm","ice storm":"ice_storm","凍てつく嵐":"ice_storm",
      "干ばつの大地":"drought_land","かんばつのだいち":"drought_land","drought land":"drought_land","ひび割れた土地":"drought_land",
      // ── Surreal / Dream Scenarios ──
      "テレポート":"teleportation","てれぽーと":"teleportation","teleportation":"teleportation","瞬間移動":"teleportation",
      "透明人間":"invisibility","とうめいにんげん":"invisibility","invisible":"invisibility","透明になる":"invisibility",
      "合わせ鏡":"mirror_infinite","あわせかがみ":"mirror_infinite","infinite mirror":"mirror_infinite","無限回廊":"mirror_infinite",
      "無人の街":"empty_city","むじんのまち":"empty_city","empty city":"empty_city","誰もいない街":"empty_city",
      "空に浮かぶ島":"floating_island","そらにうかぶしま":"floating_island","floating island":"floating_island","天空の島":"floating_island",
      "ぽつんと立つドア":"door_nowhere","door standing alone":"door_nowhere","孤独な扉":"door_nowhere","どこにもないドア":"door_nowhere",
      "果てしない道":"endless_road","はてしないみち":"endless_road","endless road":"endless_road","続く道":"endless_road",
      "逆さに落ちる":"falling_upward","さかさにおちる":"falling_upward","falling upward":"falling_upward","上に落ちる":"falling_upward",
      "水中の都市":"underwater_city","すいちゅうのとし":"underwater_city","underwater city":"underwater_city","海底の廃墟":"underwater_city",
      "巨人と小人":"giant_small","きょじんとこびと":"giant_small","giant small":"giant_small","スケールが狂う夢":"giant_small",
    };

    // ── 夢テーマテーブル（感情・体験 → キュレーション済みティッカー映像）──
    const THEME_KW = [
      { w:["空を飛","飛んでいた","飛んだ","fly","flying","soar","float","鳥になった","翼"],  t:"FLY" },
      { w:["落ちる","落下","崖から落","落ちていく","falling","dropped","奈落"],              t:"FALL" },
      { w:["追われ","逃げ","追いかけ","chase","escape","run away","逃げ回","迫って"],        t:"CHASE" },
      { w:["溺れ","溺れた","水没","drown","underwater","flood","水の中に"],                 t:"DROWN" },
      { w:["試験","テスト","受験","exam","test","学校に遅刻","試験会場"],                    t:"EXAM" },
      { w:["歯が抜け","歯がぐらぐら","teeth fell","tooth falling"],                         t:"TEETH" },
      { w:["裸で","服を着ていない","naked","nude","恥ずかしい姿で"],                          t:"NAKED" },
      { w:["声が出ない","叫べない","叫ぼうとした","金縛り","mute","cannot scream"],          t:"MUTE" },
      { w:["同じ夢","繰り返し","ループ","また同じ","loop","repeating dream"],                t:"LOOP" },
      { w:["愛している","恋人","kiss","kissed","romantic","大好きな人","抱きしめ"],          t:"LOVE" },
      { w:["失恋","元カ","忘れられ","忘れたい","forgetex","forget ex"],                     t:"FORGETEX" },
      { w:["死んだ","葬式","cemetery","funeral","亡くなった","弔い"],                        t:"FUNRL" },
      { w:["宇宙を旅","宇宙へ","space travel","outer space","galaxy","無重力"],              t:"MARS" },
      { w:["お金持ち","宝くじ","大金","lottery","jackpot","億万長者"],                       t:"JACK" },
      { w:["戦争","爆発","nuclear","ミサイル","bomb","戦場"],                                t:"NUKE" },
      { w:["世界の終わり","終末","apocalypse","humanity ends","世界崩壊"],                   t:"ARMAG" },
      { w:["地震","earthquake","崩壊","disaster","建物が倒れ"],                              t:"QUAKE" },
      { w:["親に","両親に認められ","褒められた","parent approval","親の承認"],               t:"PARENT" },
      { w:["仕事を辞め","会社を辞め","resign","quit job","クビになった"],                    t:"QUITJOB" },
      { w:["有名になった","スターになった","celebrity","famous","テレビに出た"],              t:"FAME" },
      { w:["歌手になった","歌えた","singer","concert stage","ステージで歌"],                 t:"SINGER" },
      { w:["平和な","争いのない","peaceful world","no war","平和が来た"],                    t:"NOWAR" },
      { w:["ひとりぼっち","孤独","alone","lonely","誰もいない","孤立"],                       t:"ALONE" },
      { w:["楽園","天国","paradise","heaven","eden","神様に会った"],                         t:"EDEN" },
      { w:["生まれ変わり","転生","reborn","rebirth","前世","来世"],                           t:"REBORN" },
      { w:["タイムトラベル","過去に戻","time travel","back in time","未来へ"],               t:"TIME" },
      { w:["可愛くなった","綺麗になった","pretty","beautiful mirror","変身した"],             t:"CUTE" },
      { w:["結婚","プロポーズ","wedding","marry","式を挙げた"],                              t:"WEDLOCK" },
      { w:["桃源郷","理想郷","shangri-la","hidden paradise","隠れた楽園"],                   t:"SHANGRI" },
      { w:["ロボット","android","AI","機械になった","自動化"],                               t:"ROBOT" },
      { w:["旅","adventure","journey","世界中を旅","バックパック"],                          t:"TRVL" },
      { w:["家に帰れない","帰り道","迷子","道に迷","lost way","cannot go home","家に戻れ"],   t:"ROOMS" },
      { w:["走っても進まない","走れない","足が動か","legs won't move","body won't move"],     t:"MUTE" },
      { w:["叫んでも聞こえない","誰も助けて","誰も来ない","alone no one","無視される"],       t:"ALONE" },
      { w:["時間が止まった","時が止まる","time stopped","止まった世界"],                       t:"LOOP" },
      // 動詞・行動
      { w:["消えた","消えてしまった","disappeared","vanished","いなくなった"],               t:"ALONE" },
      { w:["助けられた","救われた","saved","rescued","助けてくれた"],                         t:"REUNI" },
      { w:["殺された","殺される","killed","murdered","暗殺","刺された","撃たれた"],           t:"FUNRL" },
      { w:["閉じ込められ","逃げられない","trapped","escape impossible","出られない","鍵が"],  t:"MUTE" },
      { w:["忘れた","忘れてしまった","forgotten","cannot remember","思い出せない"],           t:"FORGETEX" },
      { w:["爆発した","爆発する","exploded","blast","崩れ落ち","崩壊した"],                   t:"QUAKE" },
      { w:["眠れない","眠ろうとした","can't sleep","insomnia","起きられない"],               t:"NOWAKE" },
      { w:["浮かんだ","浮いた","floating","levitating","宙に浮","weightless"],              t:"FLY" },
      { w:["泣いた","泣いていた","crying","sobbing","涙が止まら"],                           t:"ALONE" },
      { w:["笑えない","笑えなかった","couldn't laugh","forced smile"],                       t:"MUTE" },
      // 場所
      { w:["学校","教室","廊下","校舎","school building","classroom"],                       t:"EXAM" },
      { w:["病院","手術室","待合室","hospital room","operating room","検査"],               t:"CURE" },
      { w:["刑務所","牢屋","監獄","prison","jail","locked up","独房"],                      t:"SURV" },
      { w:["空港","飛行機","搭乗","航空機","airplane","plane crash","墜落"],                 t:"TRVL" },
      { w:["海の底","海底","深い海","bottom of the sea","beneath the ocean"],               t:"DROWN" },
      { w:["山","崖","頂上","断崖","cliff","mountain top","転落"],                          t:"FALL" },
      { w:["屋根の上","高い場所","ビルの上","top of building","高所","高いところ"],           t:"FALL" },
      { w:["お風呂","裸で外","公衆の面前","public place naked","人前で"],                    t:"NAKED" },
      { w:["遊園地","迷路","テーマパーク","amusement park","haunted house"],                 t:"ROOMS" },
      { w:["砂漠","荒野","草原","savannah","wasteland","何もない場所"],                      t:"ALONE" },
      { w:["宇宙空間","無重力","宇宙ステーション","space station","weightlessness"],          t:"MARS" },
      { w:["地下","地底","洞窟の中","cave","underground","地下鉄","トンネル"],               t:"NOWAKE" },
      // 政治・権力・社会
      { w:["独裁","独裁者","独裁政権","dictator","dictatorship","tyranny","専制"],          t:"FASC" },
      { w:["ファシズム","全体主義","fascism","totalitarian","権威主義","支配者"],            t:"FASC" },
      { w:["革命","クーデター","反乱","revolution","coup","uprising","民衆が立ち上"],        t:"WREV" },
      { w:["監視社会","盗聴","surveillance","tracked","見張られ","監視カメラ"],              t:"SURV" },
      { w:["核戦争","核爆発","原爆","放射能","nuclear war","mushroom cloud"],               t:"NUKE" },
      { w:["テロリスト","terrorism","爆弾テロ","爆破"],                                     t:"NUKE" },
      { w:["格差社会","貧困","不平等","inequality","poverty"],                              t:"FAIR" },
      { w:["民主主義","democracy","投票","選挙不正"],                                       t:"DEMO" },
      { w:["AI支配","シンギュラリティ","singularity","AGI","超知性"],                       t:"SING" },
      { w:["パンデミック","感染爆発","pandemic","病原体","ウイルスが広がる"],                 t:"PANDM" },
      { w:["経済崩壊","株価暴落","リーマン","financial crisis","破産した"],                  t:"CRSH" },
      { w:["温暖化","気候変動","climate change","地球が燃え"],                              t:"STOPGW" },
      // 家族・人間関係
      { w:["家族が死","親が死","友達が死","死んでしまった","亡くなっていた","loved one died"], t:"FUNRL" },
      { w:["お父さん","父","パパ","父親","father","dad","daddy"],                            t:"PARENT" },
      { w:["お母さん","母","ママ","母親","mother","mom","mommy"],                            t:"PARENT" },
      { w:["おじいさん","祖父","じいじ","おじいちゃん","grandfather","grandpa"],             t:"PARENT" },
      { w:["おばあさん","祖母","ばあば","おばあちゃん","grandmother","grandma"],             t:"PARENT" },
      { w:["おじさん","叔父","伯父","uncle"],                                               t:"PARENT" },
      { w:["おばさん","叔母","伯母","aunt"],                                                t:"PARENT" },
      { w:["兄","お兄さん","兄貴","older brother"],                                         t:"FRND" },
      { w:["姉","お姉さん","姉貴","older sister"],                                          t:"FRND" },
      { w:["弟","おとうと","younger brother"],                                              t:"CHILD" },
      { w:["妹","いもうと","younger sister"],                                               t:"CHILD" },
      { w:["子供","息子","娘","子ども","kid","child","son","daughter"],                     t:"CHILD" },
      { w:["先生","教師","teacher","恩師","怖い先生","strict teacher"],                      t:"EXAM" },
      { w:["上司","ボス","社長","boss","manager","先輩","同僚"],                             t:"QUITJOB" },
      { w:["初恋","好きだった人","元彼","元彼女","ex","first love","昔の恋人"],              t:"FORGETEX" },
      { w:["死んだ人","亡くなった人","故人","deceased","dead person","お墓参り"],            t:"FUNRL" },
      { w:["知らない人","見知らぬ人","stranger","見たことない人","謎の人物"],                 t:"DEAD" },
      { w:["友人","友達","幼なじみ","childhood friend","親友","best friend"],               t:"FRND" },
      { w:["神様","神に会","god appeared","神が現れ","神の声","神のお告げ"],                  t:"EDEN" },
      { w:["天使","エンジェル","angel","神の使い","翼の生えた人"],                            t:"EDEN" },
      { w:["死神","グリムリーパー","grim reaper","死の使い","連れて行かれる"],               t:"FUNRL" },
      { w:["前世","過去生","前の人生","past life","輪廻","魂が"],                            t:"REBORN" },
      { w:["体が溶ける","体が変わる","変身","体が消える","body melting","transformation"],   t:"MUTE" },
      { w:["歯医者","注射","手術","病院に連れ","強制的に","強制","医者"],                     t:"CURE" },
      { w:["高所恐怖","高いところが怖","ビルから落ちそう","屋上から","heights","vertigo"],    t:"FALL" },
      { w:["食べ物","御馳走","宴会","food","feast","美味しい","食べていた"],                  t:"JACK" },
    ];

    // 視覚名詞を抽出（長い語を優先）
    function extractVisualNoun(text) {
      let bestSlug = null, bestJp = null, bestLen = 0;
      Object.entries(VISUAL_NOUNS).forEach(([jp, slug]) => {
        if (jp.length < 2) return; // 単文字は誤マッチするので除外
        if (text.includes(jp) && jp.length > bestLen) {
          bestSlug = slug; bestJp = jp; bestLen = jp.length;
        }
      });
      return bestSlug ? { slug: bestSlug, jp: bestJp } : null;
    }

    // 話した夢の内容から表示用タイトルを生成
    function generateDreamTitle(visualMatch, matchedTicker) {
      if (visualMatch) return (visualMatch.jp || visualMatch.slug) + "の夢";
      if (matchedTicker) return matchedTicker.nameJp;

      const isEnglish = /[a-zA-Z]/.test(transcript) && transcript.replace(/[a-zA-Z\s]/g, "").length < transcript.length * 0.3;

      if (isEnglish) {
        // 英語: フィラーと定型文を除去
        const clean = transcript
          .replace(/^(um+|uh+|so|like|i mean|well|okay|you know)[,\s]*/gi, "")
          .replace(/\b(i had a dream (about|where|that)|i dreamed (about|of)|in my dream|dream about)\b/gi, "")
          .replace(/[.,!?]/g, " ")
          .trim();
        // 最初の3〜4語を取る
        const words = clean.split(/\s+/).filter(w => w.length > 1).slice(0, 4);
        const phrase = words.join(" ").slice(0, 30);
        if (phrase.length > 2) return phrase;
        return "Your dream";
      } else {
        // 日本語: 枕詞・口語・フィラーを除去
        const clean = transcript
          .replace(/^(夢の中で|夢の中に|夢の中では|夢の中の|夢の中|夢で|夢に)[、\s]*/g, "")
          .replace(/^(えーと|えー|あのー|あの|その|なんか|こう|ちょっと|まあ)[、\s]*/g, "")
          .replace(/という夢(を見た|です|でした)?/g, "")
          .replace(/(夢を見た|夢でした|夢です|夢の話|夢なんですが|夢を見ました)/g, "")
          .replace(/[、。！？…‥～〜]/g, " ")
          .trim();
        const phrase = clean
          .split(/\s+/)[0]
          .replace(/[をにがはもでへよりの].*/, "")
          // 動詞語幹・形容詞で終わっていたらそれ以降を削除
          .replace(/(て|で|た|たら|ている|していた|してい|しかけ|かけ|られ|られた|させ|させた)$/, "")
          .slice(0, 12);
        // 1文字以下 or 動詞っぽい語尾なら認識失敗扱い
        if (phrase.length > 1 && !/[うくすつぬふむゆるる]$/.test(phrase)) {
          return phrase + "の夢";
        }
        return null; // 呼び出し元でshowUnrecognizedに流す
      }
    }

    function matchAndLoad() {
      // 「夢の中で〜」などの枕詞を除去してからマッチング
      const q = transcript
        .replace(/^(夢の中で|夢の中に|夢の中では|夢の中|夢で|夢に)[、\s]*/g, "");
      const ql = q.toLowerCase();

      // 1. 視覚名詞（具体的に見えるもの）→ ローカルconceptファイル直接表示
      const visual = extractVisualNoun(q);
      if (visual) {
        const title = generateDreamTitle(visual, null);
        const price = Math.floor(Math.random() * 900 + 100);
        const imgUrl = "assets/footage/concept_" + visual.slug + ".jpg?v=20260622g";
        return loadOrb(title, null, imgUrl, price);
      }

      // 2. 夢テーマ（感情・体験）→ ティッカー映像
      let themeBest = null, themeScore = 0;
      THEME_KW.forEach(entry => {
        const score = entry.w.reduce((a, w) => a + (ql.includes(w.toLowerCase()) ? w.length : 0), 0);
        if (score > themeScore) { themeScore = score; themeBest = entry.t; }
      });
      if (themeBest && themeScore > 0) {
        const s = byTicker.get(themeBest);
        if (s) {
          const price = s.price ? Math.round(s.price) : Math.floor(Math.random() * 900 + 100);
          const title = generateDreamTitle(null, s);
          return loadOrb(title, "assets/footage/" + s.ticker + ".mp4?v=20260622", "assets/footage/" + s.ticker + ".jpg?v=20260622", price);
        }
      }

      // 3. 認識できなかった場合 → ユーザーに通知して再録音を促す
      const title = generateDreamTitle(null, null);
      if (!title) {
        showUnrecognized();
      } else {
        fetchPexels(transcript, title);
      }
    }

    // 日本語テキストをPexels検索用英語に変換
    function toEnKeywords(text) {
      const jpToEn = {
        "飛":"flying","空":"sky","海":"ocean","山":"mountain","森":"forest",
        "川":"river","湖":"lake","砂漠":"desert","火":"fire","水":"water",
        "愛":"love","恋":"romantic","怖":"fear dark","孤独":"loneliness",
        "自由":"freedom","希望":"hope","絶望":"despair dark",
        "走":"running","追":"chasing","落":"falling","泳":"swimming",
        "眠":"sleeping","笑":"laughing","泣":"crying tearful",
        "光":"light","闇":"darkness","風":"wind","夜":"night",
        "星":"stars sky","花":"flowers","木":"tree","雨":"rain","雪":"snow",
        "家":"home house","学校":"school","宇宙":"space universe",
        "未来":"future technology","過去":"vintage historical",
        "血":"blood dark red","死":"death dark cemetery",
        "剣":"sword battle","戦":"war battle","爆発":"explosion",
      };
      let en = text;
      Object.entries(jpToEn).forEach(([jp, e]) => { if (text.includes(jp)) en += " " + e; });
      const enOnly = en.replace(/[\u3000-\u9fff\uf900-\ufaff]/g, " ").replace(/\s+/g, " ").trim();
      return (enOnly.length > 3 ? enOnly : "dream surreal abstract").slice(0, 80);
    }

    async function fetchPexels(query, title) {
      const keywords = toEnKeywords(query);
      const q = encodeURIComponent(keywords);
      let vidUrl = null, imgUrl = null;
      try {
        const [vRes, pRes] = await Promise.all([
          fetch("https://api.pexels.com/videos/search?query=" + q + "&per_page=1", { headers: { Authorization: PEXELS_KEY } }),
          fetch("https://api.pexels.com/v1/search?query=" + q + "&per_page=1&orientation=square", { headers: { Authorization: PEXELS_KEY } }),
        ]);
        const vData = await vRes.json(), pData = await pRes.json();
        const files = vData.videos?.[0]?.video_files || [];
        const sd = files.filter(f => f.quality === "sd");
        const chosen = (sd.length ? sd : files).sort((a,b) => (a.width||9999)-(b.width||9999));
        vidUrl = chosen[0]?.link || null;
        imgUrl = pData.photos?.[0]?.src?.large || null;
      } catch(e) {}
      const price = Math.floor(Math.random() * 900 + 100);
      const fb = state[Math.floor(Math.random() * state.length)];
      loadOrb(title || transcript.slice(0, 16) || fb.nameJp,
        vidUrl || "assets/footage/" + fb.ticker + ".mp4?v=20260622",
        imgUrl  || "assets/footage/" + fb.ticker + ".jpg?v=20260622", price);
    }

    function loadOrb(name, vidUrl, imgUrl, price) {
      sendToPillow(imgUrl); // 円形モニターへ送信
      goStep(3);
      document.getElementById("sellResultName").textContent = name;
      document.getElementById("sellResultPrice").textContent = price + " BAKU";
      const orb = document.getElementById("sellResultOrb");
      orb.innerHTML = '<div class="sell-orb-hint">tap to sell</div>';
      orb.style.backgroundImage = "";
      // OrbGLのcanvasを借用してWebGLエフェクトを適用
      if (window.OrbGL && OrbGL.ok() && orbCanvas) {
        orbCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border-radius:50%;";
        orb.insertBefore(orbCanvas, orb.firstChild);
        const FB = [0.18, 0.12, 0.28];
        OrbGL.setMedia(imgUrl, vidUrl, FB, 0.42);
      } else {
        // フォールバック: 動画/画像を直接表示
        if (vidUrl) {
          const vid = document.createElement("video");
          vid.src = vidUrl; vid.autoplay = true; vid.loop = true; vid.muted = true; vid.playsInline = true;
          vid.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;";
          vid.onerror = () => { orb.style.backgroundImage = "url(" + imgUrl + ")"; orb.style.backgroundSize = "cover"; };
          orb.insertBefore(vid, orb.firstChild);
        } else if (imgUrl) {
          orb.style.backgroundImage = "url(" + imgUrl + ")"; orb.style.backgroundSize = "cover";
        }
      }
      orb.onclick = () => {
        if (orbCanvas && orb.contains(orbCanvas)) { const dest = $(".orb"); if (dest) dest.appendChild(orbCanvas); }
        // 夢を保存
        const s = formatDreamForField(transcript, null);
        const dreamData = { id: Date.now(), transcript, name, imgUrl, vidUrl: vidUrl || null, price, ts: Date.now(), _s: s };
        saveReleasedDream(dreamData);
        _addDreamOrb(dreamData);
        sendToPillow(imgUrl, { name, transcript, price });
        goStep(4);
      };
    }

    // Step 3: cancel — orbCanvasを元の場所に戻す
    document.getElementById("sellNo").addEventListener("click", () => {
      try { if (orbCanvas && orbCanvas.parentElement) orbCanvas.parentElement.removeChild(orbCanvas); } catch(e) {}
      goStep("4b");
    });
    document.getElementById("sellKeepClose").addEventListener("click", () => {
      stopAll(); $("#selldream").classList.add("hidden");
    });
    document.getElementById("sellRedo").addEventListener("click", () => {
      try { if (orbCanvas && orbCanvas.parentElement) orbCanvas.parentElement.removeChild(orbCanvas); } catch(e) {}
      resetVoice();
      goStep(2);
    });

    // Step 4: go to DreamField
    document.getElementById("sellToField").addEventListener("click", () => {
      $("#selldream").classList.add("hidden"); openField();
    });
  })();
  $("#fieldPanel").addEventListener("click", (e) => e.stopPropagation());
  const fieldXY = (e, el) => { const rc = el.getBoundingClientRect(); return { x: (e.touches ? e.touches[0].clientX : e.clientX) - rc.left, y: (e.touches ? e.touches[0].clientY : e.clientY) - rc.top }; };
  $("#fieldGL").addEventListener("pointerdown", (e) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}   // iPadで掴みを確実に
    const p = fieldXY(e, e.currentTarget); const o = fieldHit(p.x, p.y);
    if (o) { fieldDrag = o; dragMoved = false; dragLast = p; o.vx = 0; o.vy = 0; }
    else { $("#fieldPanel").classList.add("hidden"); fieldSel = null; }
    if (e.cancelable) e.preventDefault();
  });
  $("#fieldGL").addEventListener("pointermove", (e) => {
    if (!fieldDrag) return;
    const p = fieldXY(e, e.currentTarget), dx = p.x - dragLast.x, dy = p.y - dragLast.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
    fieldDrag.x = p.x; fieldDrag.y = p.y; fieldDrag.vx = dx * 0.5; fieldDrag.vy = dy * 0.5;  // フリック用の勢い
    dragLast = p; if (e.cancelable) e.preventDefault();
  });
  const endFieldDrag = () => { if (!fieldDrag) return; if (!dragMoved) openPanel(fieldDrag.s); fieldDrag = null; };  // 動かさなければタップ＝詳細
  $("#fieldGL").addEventListener("pointerup", endFieldDrag);
  $("#fieldGL").addEventListener("pointercancel", endFieldDrag);
  window.addEventListener("resize", () => sizeFieldLines());

  orbCanvas = document.createElement("canvas"); orbCanvas.id = "orbGL";
  if (window.OrbGL) OrbGL.init(orbCanvas);
  buildList(); buildTicker(); buildDetail(); setupSort();
  document.querySelectorAll(".mtab").forEach((b) => b.addEventListener("click", () => setPanel(b.dataset.panel)));
  setPanel("list");   // スマホ初期表示は一覧
  updateFearGreed(); updateMainIndex(); updateDoom();
  setStatus(false, "connecting… 接続中");
  loadHistory().then(loadTimelines).then(() => { applyLogicalHistory(); loadInterest(); });
  setInterval(step, TICK_MS);
  window.addEventListener("resize", () => { if (dref) updateDetail(); });
  setTimeout(() => { if ($("#titlecard").style.display !== "none") enter(); }, 9000);
  if (location.search.indexOf("field") >= 0) { enter(); setTimeout(openField, 300); }   // ?field= で夢の海を自動表示（確認用）
})();
