#!/usr/bin/env python3
"""現実の「いまの関心」を毎日スナップショットして data/interest.json に保存する。
GitHub Actions から日次で実行する想定（サーバー側なのでCORS/レート制限に強い）。

ソース: English Wikipedia pageviews（per-article daily）。
  - views30: 直近30日の平均閲覧数（その夢を“いま見ている人数”の代理）
  - views7 : 直近7日の平均（足元の勢い）
  - momentum: views7/views30 - 1（＞0なら現実で注目が上昇中→価格に上向きバイアス）

クライアント(app.js loadInterest)はこのファイルを優先して読む。無ければ従来どおり
ブラウザから直接 Wikipedia API を叩くフォールバックに切り替わる。
"""
import json, os, re, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
UA = "DreamDock/1.0 (student speculative-design project; madoolittle609@gmail.com)"
BASE = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user"


def tickers_with_wiki():
    src = open(os.path.join(ROOT, "data.js"), encoding="utf-8").read()
    out = []
    for m in re.finditer(r'ticker:"([^"]+)"[^}]*?wiki:"([^"]*)"', src, re.S):
        tk, wiki = m.group(1), m.group(2)
        if wiki:
            out.append((tk, wiki))
    return out


def fetch_views(wiki):
    # UTCの昨日まで31日分（当日は未確定なので除く）
    end = time.gmtime(time.time() - 86400)
    start = time.gmtime(time.time() - 86400 - 31 * 86400)
    f = lambda t: time.strftime("%Y%m%d", t)
    url = f"{BASE}/{urllib.parse.quote(wiki, safe='')}/daily/{f(start)}/{f(end)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.load(r)
    views = [it["views"] for it in j.get("items", [])]
    return views


def main():
    import urllib.parse  # noqa
    targets = tickers_with_wiki()
    items, ok = {}, 0
    for tk, wiki in targets:
        try:
            v = fetch_views(wiki)
            if not v:
                continue
            v30 = v[-30:] if len(v) >= 30 else v
            v7 = v[-7:] if len(v) >= 7 else v
            avg30 = sum(v30) / len(v30)
            avg7 = sum(v7) / len(v7)
            items[tk] = {
                "wiki": wiki,
                "views30": round(avg30),
                "views7": round(avg7),
                "momentum": round(avg7 / avg30 - 1, 3) if avg30 > 0 else 0,
            }
            ok += 1
        except Exception as e:
            print(f"  skip {tk} ({wiki}): {e}")
        time.sleep(0.15)  # 礼儀正しく
    out = {"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "source": "en.wikipedia pageviews (per-article daily)",
           "count": ok, "items": items}
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, "interest.json")
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {path}: {ok}/{len(targets)} tickers")


if __name__ == "__main__":
    import urllib.parse
    main()
