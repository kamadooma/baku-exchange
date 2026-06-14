#!/usr/bin/env python3
"""各銘柄の「歴史的な注目度」を Google Books Ngram (1900-2019, en-2019) から取得し
data/history.json に保存する。各値はその銘柄の最大値で正規化(0..1)。
銘柄ごとに語(NGRAM)を指定。無指定の銘柄は履歴を持たず、アプリ側で合成にフォールバック。
例: 'nuclear war' は冷戦期(1980s)に山、'Marxism' は20世紀半ばが高く以降低下。"""
import json, os, re, time, urllib.request, urllib.parse, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(ROOT, "data")
UA = {"User-Agent": "Mozilla/5.0 BakuExchange (student project)"}

NGRAM = {
  "NOWAR":"world peace", "NUKE":"nuclear war", "NOHGR":"famine", "NOPOV":"poverty",
  "CURE":"disease", "IMMO":"immortality", "GEQ":"gender equality", "NODISC":"discrimination",
  "FAIR":"inequality", "EDU":"education", "DEMO":"democracy", "CLEAN":"corruption",
  "DISARM":"disarmament", "STOPGW":"global warming", "EXTN":"extinction", "SUST":"sustainability",
  "ENRGY":"renewable energy", "NOWORK":"automation", "UBI":"basic income", "FIRE":"retirement",
  "HLTH":"health", "YOUTH":"youth", "BODY":"diet", "CALM":"mindfulness", "NOANX":"anxiety",
  "CONF":"self-esteem", "SELF":"identity", "FREE":"freedom", "JACK":"lottery",
  "HOME":"mortgage", "SOUL":"soulmate", "LOVE":"true love", "FRND":"friendship",
  "ALONE":"loneliness", "TRVL":"tourism", "MARS":"Mars", "REUNI":"afterlife", "REDO":"regret",
  "TIME":"time travel", "ETLIF":"extraterrestrial", "FAME":"celebrity", "SING":"singularity",
  "PANDM":"pandemic", "CRSH":"financial crisis", "AIBC":"artificial intelligence", "ROBOT":"robot",
  "AIJOB":"unemployment", "FOOD":"food security", "QUAKE":"earthquake", "OIL":"oil crisis",
  "ENDDEM":"authoritarianism", "FASC":"fascism", "ALIEN":"flying saucer", "ASTER":"asteroid",
  "ARMAG":"apocalypse", "SURV":"surveillance", "LEAK":"privacy",
  "CLASS":"communism", "ENLIGHT":"enlightenment", "EDEN":"paradise", "JUDG":"judgment day",
  "MESSI":"messiah", "GOLDEN":"golden age", "STONE":"alchemy", "UTOPIA":"utopia",
  "PROG":"progress", "REASON":"reason", "ENHANCE":"eugenics", "SCIFUT":"science",
  "WREV":"revolution", "REBORN":"reincarnation", "SOULIM":"soul", "ATLANT":"Atlantis",
  "FORESEE":"prophecy", "REVENGE":"revenge",
  "MARX":"Marxism", "WPRE":"feminism", "2COM":"second coming", "GROW":"economic growth",
  "DEBT":"debt", "PARENT":"family", "SEX":"sex", "SLEEP":"sleep",
}

def ngram(phrase):
    url = "https://books.google.com/ngrams/json?" + urllib.parse.urlencode(
        {"content": phrase, "year_start": "1900", "year_end": "2019", "corpus": "en-2019", "smoothing": "3"})
    d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25))
    if not d:
        return None
    ts = d[0]["timeseries"]
    mx = max(ts) or 1.0
    return [round(v / mx, 4) for v in ts]   # 0..1 normalized

def main():
    os.makedirs(OUTDIR, exist_ok=True)
    path = os.path.join(OUTDIR, "history.json")
    out = {}
    if os.path.exists(path):
        try: out = json.load(open(path))
        except Exception: out = {}
    ok = fail = 0
    for ticker, phrase in NGRAM.items():
        if ticker in out:            # 再開：取得済みはスキップ
            continue
        got = False
        for attempt in range(5):
            try:
                ys = ngram(phrase)
                if not ys:
                    print(f"!!  {ticker}: no data ({phrase})"); break
                out[ticker] = ys
                peak = 1900 + max(range(len(ys)), key=lambda i: ys[i])
                print(f"OK  {ticker:8s} <- {phrase!r:24s} peak {peak}")
                ok += 1; got = True
                with open(path, "w") as f: json.dump(out, f, separators=(",", ":"))  # 逐次保存
                break
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    wait = 25 * (attempt + 1)
                    print(f"..  {ticker}: 429, {wait}s 待機"); time.sleep(wait); continue
                print(f"!!  {ticker}: {e}"); break
            except Exception as e:
                print(f"!!  {ticker}: {e}"); break
        if not got and ticker not in out:
            fail += 1
        time.sleep(2.0)              # レート制限を避けるためゆっくり
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"\n今回取得 {ok} / 失敗 {fail} / 合計 {len(out)}  -> data/history.json")

if __name__ == "__main__":
    main()
