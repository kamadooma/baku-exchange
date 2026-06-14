# BAKU EXCHANGE — A Market of Dreams / 夢の取引所

> Speculative Design Project 2: *Apocalypse–Cosmogeny*
> School of Design & Science

幻影のウォール街（Phantom Wall Street）。
未来。人々は「いらない夢」を手放し、対価として怪しい暗号通貨 **〈BAKU〉** を受け取る。
夢は幻影として証券取引所〈**BAKU EXCHANGE**〉で売買される。

> 夢の取引なんてディストピアだ。
> けれど株式とは、私たちが共に見る、いちばん大きな夢だ。
> *The stock market is the largest dream we share.*

ある人の悪夢が、別の人にとっては価値になる。核戦争の悪夢を見た女性たちがそれを手放すと、
市場ではその夢が「トレンディ」な銘柄として高値で取引される。
そして人々は皆、終末の到来を予感している——その予感そのものが、市場に反映される。
**私たちは、共有された“終末の予感”すら売買可能な指数に変えてしまった。それがディストピアだ。**

---

## 作品の構造 / Structure

| 層 | 正体 | メディア |
|---|---|---|
| 🛏 枕（バク型） | 眠るとガイド音声が夢の手放しを誘導し、夢を市場へ売る装置 | 物理オブジェ＋音声・ESP32-S3 円形LCD ×3 |
| 📱 iPad | **BAKU EXCHANGE**（このリポジトリ） | Web |

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

サーバー不要。ただしブラウザの制約で、ローカルでは簡易サーバー経由が安全：

```bash
python3 -m http.server 8137
# ブラウザで http://localhost:8137 を開く
```

GitHub Pages に公開すれば、iPad の Safari で URL を開くだけで動く。

## 技術 / Tech

- 素の HTML / CSS / JavaScript（フレームワークなし、ビルド不要）
- チャートは Canvas で自前描画（オフラインでも動作）
- フォントは Apple 標準（Didot 等）でネット接続なしでも美しく表示
- データ：`data.js` に夢の銘柄を定義 → `app.js` が価格をライブにシミュレート
- 現実データ：Wikipedia Pageviews API（無料・キー不要）。X(Twitter) はAPI制限のため非採用

## ファイル / Files

- `index.html` — 画面構成
- `styles.css` — A24風シネマティックなスタイル
- `app.js` — 市場シミュレーション・描画・指数・終末ロジック
- `data.js` — 夢の銘柄データ
- `要件定義.md` — 要件定義書（制作の指針）

---

*Made by madoka × Claude.*
