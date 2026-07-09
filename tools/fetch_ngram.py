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
  "2COM":"second coming", "AFFAIR":"love affair", "AIBC":"artificial intelligence", "AIJOB":"technological unemployment",
  "ALIEN":"alien invasion", "ALONE":"loneliness", "ANIMAL":"talking animals", "ARMAG":"Armageddon",
  "ASTER":"asteroid impact", "ASTRO":"astronaut", "ATLANT":"Atlantis", "BALLER":"professional footballer",
  "BILLION":"billionaire", "BIRDWISH":"free as a bird", "BLKOUT":"power failure", "BODY":"body image",
  "CALL":"dream job", "CALM":"peace of mind", "CHASE":"being chased", "CHILD":"childhood memories",
  "CHOSEN":"the chosen one", "CINDER":"Cinderella story", "CLASS":"classless society", "CLEAN":"political corruption",
  "CONF":"self-confidence", "CRSH":"financial crisis", "CRUSH":"puppy love", "CURE":"conquest of disease",
  "CUTE":"kawaii", "DATALOSS":"data loss", "DEAD":"spirit communication", "DEADCAT":"beloved cat",
  "DEBT":"debt", "DEMO":"democracy", "DISARM":"nuclear disarmament", "DONTWAKE":"escapism",
  "DROWN":"fear of drowning", "EDEN":"paradise", "EDU":"universal education", "ELOPE":"elopement",
  "ENDEM":"death of democracy", "ENHANCE":"eugenics", "ENLIGHT":"satori", "ENRGY":"renewable energy",
  "ERTH2":"Earth-like planet", "ETLIF":"extraterrestrial life", "EXAM":"test anxiety", "EXTN":"mass extinction",
  "FAIR":"income inequality", "FALL":"falling dream", "FALSE":"false awakening", "FAME":"celebrity",
  "FASC":"fascism", "FIRE":"early retirement", "FLORIST":"flower shop", "FLY":"flying dream",
  "FLYCR":"flying car", "FOLLOW":"social media followers", "FOOD":"food shortage", "FORESEE":"prophecy",
  "FORGETEX":"broken heart", "FREE":"financial independence", "FRND":"friendship", "FUNRL":"own funeral",
  "GEQ":"women's rights", "GOLDEN":"golden age", "GROW":"economic growth", "HAREM":"harem",
  "HLTH":"perfect health", "HOME":"home ownership", "HOME2":"homesickness", "IMMO":"immortality",
  "INHERIT":"inheritance", "ISEKAI":"portal fantasy", "JACK":"lottery", "JPSK":"tsunami",
  "JUDG":"judgment day", "LEAK":"data breach", "LOOP":"eternal return", "LOOPTALK":"deja vu",
  "LOSTHOME":"childhood home", "LOVE":"true love", "MARS":"Mars", "MARX":"Marxism",
  "MEETLOVE":"true love", "MESSI":"messiah", "MIRR":"stranger in the mirror", "MOTE":"sex appeal",
  "MUTE":"sleep paralysis", "NAKED":"naked in public", "NEEDED":"to be needed", "NOANX":"anxiety",
  "NODISC":"discrimination", "NOHGR":"famine", "NOPOV":"poverty", "NOWAKE":"unable to wake",
  "NOWAR":"world peace", "NOWORK":"automation", "NUKE":"nuclear war", "OIL":"oil crisis",
  "OSHI":"fan club", "PANDM":"pandemic", "PARENT":"parental approval", "PERP":"perpetual motion",
  "PREZ":"run for president", "PROG":"idea of progress", "PWD":"forgotten password", "QUAKE":"earthquake",
  "QUITJOB":"quit my job", "REASON":"age of reason", "REBORN":"reincarnation", "REDO":"second chance",
  "REUNI":"afterlife", "REUNION":"class reunion", "REVENGE":"revenge", "RIVAL":"rivalry",
  "ROADEXT":"endless road", "ROBOT":"robot", "ROCK":"rock star", "ROOMS":"hidden rooms",
  "SCIFUT":"scientism", "SELF":"self-discovery", "SEX":"sex", "SHANGRI":"Shangri-La",
  "SING":"technological singularity", "SINGER":"pop star", "SKYFALL":"sky is falling", "SLEEP":"sleep",
  "SLEEPIN":"snooze button", "SOMEONE":"self-made man", "SOUL":"soulmate", "SOULIM":"immortal soul",
  "STONE":"philosopher's stone", "STOPGW":"global warming", "SUMMER":"endless summer", "SUNKCITY":"sunken city",
  "SURV":"surveillance", "SUST":"sustainability", "TALNT":"natural talent", "TEETH":"teeth falling out",
  "TENNO":"delusions of grandeur", "TIME":"time travel", "TOKOYO":"otherworld", "TRVL":"tourism",
  "UBI":"basic income", "UNDO":"eat my words", "UTOPIA":"utopia", "WEDLOCK":"arranged marriage",
  "WPRE":"woman president", "WREV":"world revolution", "YOUTH":"eternal youth",
}

# 一次語がコーパスでヒットしない場合のフォールバック
ALT = {
  "2COM":"second advent", "AFFAIR":"extramarital affair", "AIBC":"AI winter", "AIJOB":"automation",
  "ALIEN":"flying saucer", "ALONE":"isolation", "ANIMAL":"animal language", "ARMAG":"apocalypse",
  "ASTER":"asteroid", "ASTRO":"space travel", "ATLANT":"lost continent", "BALLER":"football star",
  "BILLION":"self-made millionaire", "BIRDWISH":"fly like a bird", "BLKOUT":"blackout", "BODY":"physical fitness",
  "CALL":"vocation", "CALM":"inner peace", "CHASE":"chased in a dream", "CHILD":"simpler times",
  "CHOSEN":"chosen one", "CINDER":"rags to riches", "CLASS":"communism", "CLEAN":"corruption",
  "CONF":"self-esteem", "CRSH":"stock market crash", "CRUSH":"unrequited love", "CURE":"wonder drug",
  "CUTE":"cute", "DATALOSS":"lost files", "DEAD":"talking to the dead", "DEADCAT":"loss of a pet",
  "DEBT":"in the red", "DEMO":"self-government", "DISARM":"disarmament", "DONTWAKE":"dream world",
  "DROWN":"drowning dream", "EDEN":"Garden of Eden", "EDU":"literacy", "ELOPE":"run away together",
  "ENDEM":"crisis of democracy", "ENHANCE":"human betterment", "ENLIGHT":"spiritual enlightenment", "ENRGY":"solar power",
  "ERTH2":"exoplanet", "ETLIF":"extraterrestrial", "EXAM":"exam nerves", "EXTN":"species extinction",
  "FAIR":"distribution of wealth", "FALL":"fear of falling", "FALSE":"lucid dreaming", "FAME":"fame",
  "FASC":"authoritarianism", "FIRE":"retirement", "FLORIST":"florist", "FLY":"dream of flying",
  "FLYCR":"flying automobile", "FOLLOW":"go viral", "FOOD":"food crisis", "FORESEE":"clairvoyance",
  "FORGETEX":"heartbreak", "FREE":"financial freedom", "FRND":"best friend", "FUNRL":"funeral",
  "GEQ":"sex equality", "GOLDEN":"golden era", "GROW":"gross national product", "HAREM":"seraglio",
  "HLTH":"wellness", "HOME":"mortgage", "HOME2":"homecoming", "IMMO":"eternal life",
  "INHERIT":"windfall", "ISEKAI":"parallel world", "JACK":"jackpot", "JUDG":"Last Judgment",
  "LEAK":"identity theft", "LOOP":"time loop", "LOOPTALK":"circular conversation", "LOSTHOME":"hometown",
  "LOVE":"romance", "MARS":"planet Mars", "MARX":"Marxist", "MEETLOVE":"soulmate",
  "MESSI":"savior", "MIRR":"depersonalization", "MOTE":"irresistible charm", "MUTE":"night terror",
  "NAKED":"naked dream", "NEEDED":"sense of purpose", "NOANX":"anxiety disorder", "NODISC":"civil rights",
  "NOHGR":"hunger", "NOPOV":"the poor", "NOWAKE":"eternal sleep", "NOWAR":"no more war",
  "NOWORK":"leisure society", "NUKE":"atomic bomb", "OIL":"energy crisis", "OSHI":"teen idol",
  "PANDM":"epidemic", "PARENT":"father's approval", "PERP":"perpetual motion machine", "PREZ":"presidential candidate",
  "PROG":"human progress", "PWD":"password reset", "QUAKE":"seismic", "QUITJOB":"job burnout",
  "REASON":"rationalism", "REBORN":"rebirth", "REDO":"do over", "REUNI":"reunited in heaven",
  "REUNION":"high school reunion", "REVENGE":"vengeance", "RIVAL":"competitiveness", "ROADEXT":"open road",
  "ROBOT":"automaton", "ROCK":"rock and roll", "ROOMS":"secret rooms", "SCIFUT":"technocracy",
  "SELF":"finding yourself", "SEX":"make love", "SING":"singularity", "SINGER":"become a singer",
  "SKYFALL":"Chicken Little", "SLEEP":"nap", "SLEEPIN":"five more minutes", "SOMEONE":"self-actualization",
  "SOUL":"the one", "SOULIM":"soul", "STONE":"alchemy", "STOPGW":"climate change",
  "SUMMER":"long hot summer", "SUNKCITY":"rising sea levels", "SURV":"wiretapping", "SUST":"sustainable development",
  "TALNT":"hidden talent", "TEETH":"losing teeth", "TENNO":"Napoleon complex", "TIME":"time machine",
  "TOKOYO":"Elysian Fields", "TRVL":"wanderlust", "UBI":"guaranteed income", "UNDO":"eat his words",
  "UTOPIA":"utopian", "WEDLOCK":"forced marriage", "WPRE":"female president", "WREV":"permanent revolution",
  "YOUTH":"fountain of youth",
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
                if not ys and ticker in ALT:
                    time.sleep(2.0); ys = ngram(ALT[ticker])
                    if ys: print(f"..  {ticker}: fallback {ALT[ticker]!r}")
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
