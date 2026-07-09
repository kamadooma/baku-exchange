#!/usr/bin/env python3
"""Ngram(2019で途切れる)の先を埋めるため、各銘柄の「近年の関心」を
English Wikipedia の月次ページビュー(2015-07〜直近の完了月)から取得し
data/recent.json に保存する。各系列はその銘柄の最大値で正規化(0..1)。

app.js loadHistory は Ngram(1900-2019)にこの近年系列を継ぎ足し(2018-19でクロスフェード、
2020以降は実測に置換)、COVID・AIブーム・戦争の時代の“集合的関心”を実データで描く。

ソース: Wikimedia REST API pageviews per-article monthly。
  例: PANDM(Pandemic) は 2020 春に急騰するはず。
resumable: 取得済み銘柄はスキップ・逐次保存。レート制限に配慮し 0.3s スリープ。"""
import json, os, re, time, urllib.request, urllib.parse, urllib.error

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


def end_candidates(n=4):
    # 当月は未確定なので前月から。monthlyは月頭タイムスタンプで範囲内の月を返すので、
    # end=最終完了月の月頭にすると当月(不完全)を除ける。ただし不人気記事は最新月の集計が
    # 未公開で範囲全体が404になるため、月を1つずつ遡る候補も用意する（UTC基準）。
    t = time.gmtime()
    y, mo = t.tm_year, t.tm_mon - 1
    if mo == 0:
        y, mo = y - 1, 12
    out = []
    for _ in range(n):
        out.append((f"{y}{mo:02d}", f"{y}{mo:02d}01"))
        mo -= 1
        if mo == 0:
            y, mo = y - 1, 12
    return out


def fetch_monthly(wiki, ends):
    # end候補を新しい順に試し、404(最新月未公開)なら1つ前の月で再試行。
    # 返り値: (実際の開始月 "YYYY-MM", views[])。記事が後年作成の場合APIは
    # その作成月からしか返さないので、開始月は先頭itemのタイムスタンプから採る。
    last_err = None
    for _label, end in ends:
        url = f"{BASE}/{urllib.parse.quote(wiki, safe='')}/monthly/20150701/{end}"
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                j = json.load(r)
            items = j.get("items", [])
            if items:
                ts = items[0]["timestamp"]                       # 例 "2015070100"
                start = f"{ts[:4]}-{ts[4:6]}"
                return start, [it["views"] for it in items]
        except urllib.error.HTTPError as e:
            if e.code == 404:
                last_err = e; time.sleep(0.3); continue   # 最新月が未公開→前月で再試行
            raise
    if last_err:
        raise last_err
    return None, []


def main():
    os.makedirs(DATA, exist_ok=True)
    path = os.path.join(DATA, "recent.json")
    out = {}
    if os.path.exists(path):
        try: out = json.load(open(path))
        except Exception: out = {}
    targets = tickers_with_wiki()
    ends = end_candidates()
    end_label = ends[0][0]
    ok = fail = 0
    for tk, wiki in targets:
        if tk in out:                       # 再開：取得済みはスキップ
            continue
        try:
            start, v = fetch_monthly(wiki, ends)
            if not v:
                print(f"..  {tk}: no data ({wiki})"); fail += 1; time.sleep(0.3); continue
            mx = max(v) or 1.0
            norm = [round(x / mx, 4) for x in v]   # 0..1 正規化
            out[tk] = {"start": start, "monthly": norm}
            peak = max(range(len(v)), key=lambda i: v[i])
            print(f"OK  {tk:8s} <- {wiki!r:28s} n={len(v):3d} peakIdx={peak} maxViews={max(v)}")
            ok += 1
            with open(path, "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, separators=(",", ":"))  # 逐次保存
        except urllib.error.HTTPError as e:
            if e.code == 404:
                print(f"!!  {tk}: 404 renamed/missing ({wiki})"); fail += 1   # 記事改名など→静かにスキップ
            elif e.code == 429:
                print(f"..  {tk}: 429 rate-limit, 20s 待機"); time.sleep(20); continue
            else:
                print(f"!!  {tk}: {e} ({wiki})"); fail += 1
        except Exception as e:
            print(f"!!  {tk}: {e} ({wiki})"); fail += 1
        time.sleep(0.3)                     # 礼儀正しく
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\n近年系列 取得 {ok} / 失敗 {fail} / 合計 {len(out)}  (〜{end_label})  -> data/recent.json")


if __name__ == "__main__":
    main()
