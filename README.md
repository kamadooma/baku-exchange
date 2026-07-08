# BAKU EXCHANGE / 夢の取引所

**Madoka**

🔗 **Live: <https://kamadooma.github.io/baku-exchange/>**

---

## Statement

Where do dreams come from?

In medieval Japan, dreams were not thought to well up from within the individual, but to arrive from outside — as revelations from gods and buddhas, or as things handed over from another. The *Uji Shūi Monogatari* records the strange act of purchasing another person's auspicious dream. Even then, dreams were already a kind of exchangeable good.

**BAKU EXCHANGE** takes that old sensibility as its point of departure, and imagines a future in which dreams are bought and sold in public. Here, the viewer relinquishes an unwanted dream and receives, in return, a fictional cryptocurrency called **BAKU**. The surrendered dream is then listed on the exchange as a tradable asset, and one person's nightmare becomes another's market price. Private unconsciousness is passed through the currency and converted, at last, into a public index — and it is this very flow that forms the critical spine of the work.

The name *BAKU* derives from the mythical dream-eating chimera — with the trunk of an elephant, the eyes of a rhinoceros, the tail of an ox, and the paws of a tiger — placed beside the pillow to guard those who sleep. In this work, however, the baku no longer eats nightmares; it commodifies them.

The installation unfolds in two layers. A baku-shaped **pillow device**, guided by voice, leads the viewer into the act of "letting the dream go" — the entrance, where the living body is plugged into the market. On the adjacent screen, the **exchange** itself flickers into being: DREAM INDEX, FEAR & GREED, APOCALYPSE METER. Each listed dream is tethered to the real-time page views of its English Wikipedia entry, so that a fictional market is silently woven into the currents of the world's collective attention. In quantifying the sense of the end, in converting fear and hope into indices, this market suggests that Apocalypse and Cosmogeny are not opposing terms but two phases of a single loop, endlessly summoning one another within the movement of capital.

A piece of music titled *Just Buy Nightmare!* drifts through the space. In it, a fictional "dream economist" analyzes the trading market, while, alongside, a non-human voice reflects on how the story of the end has been told by human beings.

### Dream Contagion

Another small work is placed nearby, as if leaning quietly against the installation.

In a home video taken by my mother, a very young version of myself films her back with a toy camera. Seeing, filming, keeping — these acts pass through one another like reflections in a mirror, across generations. In that brief instant, one can glimpse a small original of what runs beneath this exhibition: that dreams may not be enclosed within the individual at all, but might be something contagious, something that repeats itself in others.

---

## 作品の構造 / Structure

| 層 | 正体 | メディア |
|---|---|---|
| 🛏 枕（バク型） | 眠るとガイド音声が夢の手放しを誘導し、夢を市場へ売る装置 | 物理オブジェ＋音声・ESP32-S3 円形LCD ×3 |
| 📱 スクリーン | **BAKU EXCHANGE**（このリポジトリ） | Web |
| 🎵 音楽 | *Just Buy Nightmare!* — 架空の「夢経済学者」による市場分析と、人ならざる声による終末の語り | サウンド |
| 📼 併置作品 | *Dream Contagion* — 母の撮ったホームビデオをめぐる小品 | 映像 |

通貨〈BAKU〉のコインは中国の古銭（円形・角穴）風で、図像は獏の合成獣
（象の鼻・犀の目・牛の尾・虎の足）。

## 主な機能 / Features

- 📈 ライブに動く夢の価格・**ローソク足（蝋燭足）**・出来高
- 📊 **DREAM INDEX**（夢幻指数）／ NIGHTMARE・HOPE のサブ指数
- 😱 **FEAR & GREED** ゲージ
- ☠️ **終末感（Apocalypse）メーター** — じわじわ上昇し、限界で市場が崩壊→再生する
- 🔗 **現実の関心と連動**：各銘柄を英語版 Wikipedia 記事に対応づけ、その閲覧数（＝その夢を見ている人数）を基準価格に反映
- 🛍 銘柄をクリックすると夢の内容・売り手・「この夢を見た人はこんな夢も…」を表示

## 動かし方 / Run locally

公開版は GitHub Pages でそのまま動く： **<https://kamadooma.github.io/baku-exchange/>**

ローカルではブラウザの制約により、簡易サーバー経由が安全：

```bash
python3 -m http.server 8137
# ブラウザで http://localhost:8137 を開く
```

## 技術 / Tech

- 素の HTML / CSS / JavaScript（フレームワークなし、ビルド不要）
- チャートは Canvas で自前描画（オフラインでも動作）
- フォントは Apple 標準（Didot 等）でネット接続なしでも美しく表示
- データ：`data.js` に夢の銘柄を定義 → `app.js` が価格をライブにシミュレート
- 現実データ：Wikipedia Pageviews API（無料・キー不要）。X(Twitter) はAPI制限のため非採用
- 枕デバイス：ESP32-S3 ＋ 円形LCD（`firmware/`）

## ファイル / Files

- `index.html` — 画面構成
- `styles.css` — A24風シネマティックなスタイル
- `app.js` — 市場シミュレーション・描画・指数・終末ロジック
- `data.js` — 夢の銘柄データ
- `firmware/` — 枕デバイス（ESP32-S3）のファームウェア
- `要件定義.md` — 要件定義書（制作の指針）

---

*Made by madoka × Claude.*
