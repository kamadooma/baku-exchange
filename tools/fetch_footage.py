#!/usr/bin/env python3
"""各銘柄のテーマ画像を English Wikipedia の代表画像から取得し
assets/footage/<TICKER>.jpg に保存する（足場用のプレースホルダ）。
※ Wikipedia の画像は多くが PD/CC。展示で使う際は出典・ライセンス確認を。"""
import json, os, re, sys, time, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "footage")
UA = "BakuExchange/1.0 (student speculative-design project; contact: madoolittle609@gmail.com)"

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=15)

def parse_dreams():
    src = open(os.path.join(ROOT, "data.js"), encoding="utf-8").read()
    out = []
    for m in re.finditer(r'ticker:\s*"([^"]+)".*?wiki:\s*"([^"]*)"', src, re.S):
        out.append((m.group(1), m.group(2)))
    return out

def summary_image(wiki):
    title = urllib.parse.quote(wiki, safe="")
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
    data = json.load(get(url))
    for key in ("originalimage", "thumbnail"):
        if key in data and "source" in data[key]:
            return data[key]["source"]
    return None

def main():
    os.makedirs(OUT, exist_ok=True)
    dreams = parse_dreams()
    ok = skip = fail = 0
    for ticker, wiki in dreams:
        dest = os.path.join(OUT, f"{ticker}.jpg")
        if not wiki:
            print(f"--  {ticker}: wikiなし（グラデ仮表示）"); skip += 1; continue
        if os.path.exists(dest):
            print(f"==  {ticker}: 既存スキップ"); skip += 1; continue
        try:
            img = summary_image(wiki)
            if not img or img.lower().endswith(".svg"):
                print(f"!!  {ticker}: 画像なし/SVG ({wiki})"); fail += 1; continue
            raw = get(img).read()
            with open(dest, "wb") as f:
                f.write(raw)
            print(f"OK  {ticker} <- {wiki}  ({len(raw)//1024}KB)"); ok += 1
            time.sleep(0.3)
        except Exception as e:
            print(f"!!  {ticker}: {e}"); fail += 1
    print(f"\n取得 {ok} / スキップ {skip} / 失敗 {fail}  -> {OUT}")

if __name__ == "__main__":
    main()
