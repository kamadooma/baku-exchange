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
      p += p * s.volatility * 0.045 * gauss() + (s.fair - p) * 0.012;
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
  function dreamersTxt(s) { const n = s.realViews ? s.realViews : Math.round(s.interest * 200 + 300); return `≈ ${n.toLocaleString()} 人/日`; }
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
        <div><div class="tk">${s.ticker}</div><div class="nm">${s.nameJp} · ${s.nameEn}</div></div>
        <canvas class="spark" width="56" height="24"></canvas>
        <div><div class="pr num"></div><div class="ch num"></div></div>`;
      row.addEventListener("click", () => selectDream(s));
      el.appendChild(row);
      rowRefs.set(s.ticker, { row, pr: row.querySelector(".pr"), ch: row.querySelector(".ch"), spark: row.querySelector(".spark") });
    });
    updateList();
  }
  function updateList() {
    state.forEach((s) => {
      const r = rowRefs.get(s.ticker); if (!r) return;
      const ch = dayChange(s);
      r.pr.textContent = fmt(s.price);
      r.ch.textContent = pctTxt(ch); r.ch.className = "ch num " + cls(ch);
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
      <div class="seller">供給元 / supplied by：<span>${s.seller}</span></div>
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
    if (window.OrbGL && OrbGL.ok()) OrbGL.setMedia(`assets/footage/${s.ticker}.jpg`, `assets/footage/${s.ticker}.mp4`, FB, (s.idx % 17) / 17);

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

    $("#buyBtn").addEventListener("click", () => toast(`ご注文を受け付けました · Order received<br/>「${s.nameJp}」を ${CUR} で取得しました。`));
    $("#sellBtn").addEventListener("click", () => toast(`売却が成立しました · Sold<br/>「${s.nameJp}」を手放しました。`));
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
      p += p * s.volatility * 0.011 * gauss() + (s.fair - p) * MEAN_REVERT + p * mood + bias;
      p = Math.max(1, p); s.price = p;
      s.closes[TOTAL_MONTHS - 1] = p;
      s.tape.push(p); if (s.tape.length > TAPE_N) s.tape.shift();
    });
    maybeTrade();
    updateList(); updateTicker(); updateDetail();
    updateFearGreed(); updateMainIndex(); updateDoom();
  }
  function updateMainIndex() { const idx = computeIndices().all; $("#dreamIndex").innerHTML = `${idx.val.toFixed(2)} <span class="${cls(idx.chg)}" style="font-size:.62em">${pctTxt(idx.chg)}</span>`; }

  const BUYERS = ["匿名の投資家", "夢中毒者", "終末論者", "美術館", "退屈した億万長者", "眠れない子ども", "アルゴリズム取引bot", "コレクター", "未来からの旅行者", "占い師"];
  function maybeTrade() {
    const feed = $("#tradeFeed"); const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const s = state[Math.floor(Math.random() * state.length)], buy = Math.random() > 0.5;
      const who = BUYERS[Math.floor(Math.random() * BUYERS.length)], qty = (Math.random() * 12 + 0.1).toFixed(2);
      const div = document.createElement("div"); div.className = "trade";
      div.innerHTML = `<span class="who">${who}</span> が <b>${s.ticker}</b> を ${qty}口 <span class="num">${fmt(s.price)} ${CUR}</span> で <span class="num ${buy ? "up" : "down"}">${buy ? "購入" : "売却"}</span>`;
      feed.insertBefore(div, feed.firstChild);
    }
    while (feed.children.length > 26) feed.removeChild(feed.lastChild);
  }

  let toastT = null;
  function toast(html) { const t = $("#toast"); t.innerHTML = html; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 4200); }

  // ---- Wikipedia interest ----
  async function loadInterest() {
    const end = new Date(), start = new Date(Date.now() - 30 * 864e5);
    const f = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    const base = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user";
    const targets = state.filter((s) => s.wiki);
    const results = await Promise.allSettled(targets.map(async (s) => {
      const r = await fetch(`${base}/${encodeURIComponent(s.wiki)}/daily/${f(start)}/${f(end)}`);
      if (!r.ok) throw new Error(s.wiki + " " + r.status);
      const j = await r.json(); const views = (j.items || []).map((i) => i.views);
      if (!views.length) throw new Error("no data");
      return { s, avg: views.reduce((a, b) => a + b, 0) / views.length };
    }));
    const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    if (ok.length >= 2) {
      const logs = ok.map((o) => Math.log(o.avg + 1)), lo = Math.min(...logs), hi = Math.max(...logs);
      ok.forEach((o) => { const t = hi > lo ? (Math.log(o.avg + 1) - lo) / (hi - lo) : 0.5; o.s.interest = Math.round(15 + t * 80); if (!o.s.hasHistory) o.s.fair = 38 + o.s.interest * 4.2; o.s.realViews = Math.round(o.avg); });
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
      if (boost) { const cy = _now.getFullYear(); for (let m = 0; m < L; m++) { const yr = START_YEAR + m / 12; if (yr > 2008) { const t = (yr - 2008) / (cy - 2008); s.closes[m] *= 1 + boost * 1.9 * t; } } }
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

  orbCanvas = document.createElement("canvas"); orbCanvas.id = "orbGL";
  if (window.OrbGL) OrbGL.init(orbCanvas);
  buildList(); buildTicker(); buildDetail(); setupSort();
  updateFearGreed(); updateMainIndex(); updateDoom();
  setStatus(false, "connecting… 接続中");
  loadHistory().then(loadInterest);
  setInterval(step, TICK_MS);
  window.addEventListener("resize", () => { if (dref) updateDetail(); });
  setTimeout(() => { if ($("#titlecard").style.display !== "none") enter(); }, 9000);
})();
