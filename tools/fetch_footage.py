#!/usr/bin/env python3
"""全銘柄のテーマ画像を Wikimedia Commons から取得して
assets/footage/<TICKER>.jpg に保存（足場用プレースホルダ）。
銘柄ごとに検索語(QUERY)を指定し、わかりやすい写真を拾う。
※ Commons の画像は CC/PD 中心。展示で使う際は出典・ライセンス確認を。"""
import json, os, re, time, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "footage")
UA = "BakuExchange/1.0 (student speculative-design project; madoolittle609@gmail.com)"

# 銘柄ごとの検索語（夢が「わかる」写真になるよう調整）。無指定は nameEn を使用。
QUERY = {
  "NOWAR":"peace dove sky", "NUKE":"nuclear explosion mushroom cloud", "NOHGR":"wheat field harvest",
  "NOPOV":"coins donation hands", "CURE":"vaccine laboratory medicine", "IMMO":"fountain of youth",
  "GEQ":"gender equality", "NODISC":"diverse hands together", "FAIR":"scales of justice balance",
  "EDU":"classroom children books", "DEMO":"ballot box voting", "CLEAN":"anti corruption protest",
  "DISARM":"missile dismantling", "STOPGW":"wind turbines field", "EXTN":"extinct animal skeleton museum",
  "SUST":"solar panels green landscape", "ENRGY":"solar wind power plant", "NOWORK":"hammock relaxation beach",
  "UBI":"cash money banknotes", "FIRE":"relaxing beach retirement", "HLTH":"running healthy nature",
  "YOUTH":"youthful skin face", "BODY":"fitness gym training", "CALM":"calm lake meditation",
  "NOANX":"calm meditation sunrise", "CONF":"confident person sunrise", "SELF":"mirror reflection portrait",
  "CALL":"craftsman working hands", "TALNT":"pianist performance stage", "FREE":"freedom open road sunset",
  "JACK":"lottery jackpot money", "HOME":"house keys home", "SOUL":"couple silhouette sunset",
  "LOVE":"couple love heart", "FRND":"friends laughing together", "ALONE":"friends embrace hug",
  "TRVL":"travel suitcase world map", "MARS":"mars rover red planet", "REUNI":"light through clouds heaven",
  "REDO":"hourglass sand time", "TIME":"clock time travel", "ETLIF":"ufo night sky stars",
  "FLYCR":"flying car concept", "FAME":"red carpet celebrity", "ERTH2":"earth like exoplanet",
  "SING":"artificial intelligence brain network",
  "PANDM":"face mask pandemic virus", "CRSH":"stock market crash chart", "AIBC":"stock market screen chart",
  "ROBOT":"humanoid robot", "AIJOB":"robot factory automation", "FOOD":"empty supermarket shelves",
  "QUAKE":"earthquake collapsed building", "BLKOUT":"city blackout dark night", "OIL":"oil refinery industry",
  "ENDDEM":"protest crowd democracy", "FASC":"barbed wire fence", "ALIEN":"ufo flying saucer",
  "ASTER":"asteroid impact earth", "ARMAG":"apocalypse fire sky", "SURV":"surveillance camera city",
  "LEAK":"data code screen",
  "PWD":"login password screen", "FALL":"falling sky clouds", "CHASE":"running shadow night",
  "TEETH":"dental teeth", "FLY":"bird flying sky", "NAKED":"silhouette body", "MUTE":"dark bedroom night",
  "DROWN":"underwater drowning", "EXAM":"exam classroom clock", "FUNRL":"funeral flowers candle",
  "MIRR":"mirror face reflection", "DEAD":"vintage telephone", "LOOP":"calendar repeating", "NOWAKE":"sleeping person bed",
  "FALSE":"blurry bedroom waking",
  "SEX":"lovers silhouette sunset", "MEETLOVE":"reaching hands couple", "DEADCAT":"cat portrait",
  "FORGETEX":"rain window sad", "OSHI":"concert stage crowd lights", "SLEEP":"sleeping in bed morning",
  "PARENT":"parent child family", "NEEDED":"holding hands support", "CHILD":"child playing field",
  "HOME2":"countryside train window", "UNDO":"crumpled letter handwriting", "DEBT":"empty wallet coins",
  "PREZ":"podium speech politician", "BALLER":"soccer player stadium", "SINGER":"singer microphone stage",
  "ASTRO":"astronaut space", "ELOPE":"couple running away night", "AFFAIR":"secret lovers silhouette",
  "CLASS":"workers solidarity crowd", "ENLIGHT":"buddha meditation light", "EDEN":"garden paradise painting",
  "JUDG":"last judgment fresco painting", "MESSI":"jesus light religious painting", "GOLDEN":"golden age painting",
  "STONE":"alchemy laboratory", "PERP":"perpetual motion machine drawing", "UTOPIA":"utopia city illustration",
  "PROG":"steam locomotive history", "REASON":"enlightenment philosophy painting", "ENHANCE":"cyborg human augmentation",
  "SCIFUT":"futuristic laboratory science", "WREV":"revolution crowd flag", "REBORN":"lotus flower water",
  "SOULIM":"spirit light soul", "SHANGRI":"mountain valley paradise", "TOKOYO":"japanese sea island mist",
  "ATLANT":"underwater ruins",
  "RIVAL":"race finish line competition", "CRUSH":"young couple love blush", "CHOSEN":"hero light silhouette",
  "ISEKAI":"fantasy portal landscape", "FORESEE":"crystal ball fortune", "ANIMAL":"person with animals nature",
  "REVENGE":"dramatic silhouette dark", "SOMEONE":"spotlight stage person",
  "MARX":"karl marx statue", "WPRE":"suffragette women voting", "2COM":"second coming jesus painting",
  "JPSK":"tsunami wave", "GROW":"city skyline construction crane",
}

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=20)

def parse_dreams():
    src = open(os.path.join(ROOT, "data.js"), encoding="utf-8").read()
    out = []
    for m in re.finditer(r'ticker:\s*"([^"]+)".*?nameEn:\s*"([^"]*)"', src, re.S):
        out.append((m.group(1), m.group(2)))
    return out

def commons_image(query):
    q = urllib.parse.quote("filetype:bitmap " + query)
    url = ("https://commons.wikimedia.org/w/api.php?action=query&format=json"
           "&generator=search&gsrsearch=" + q + "&gsrnamespace=6&gsrlimit=8"
           "&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=1200")
    data = json.load(get(url))
    pages = (data.get("query", {}) or {}).get("pages", {})
    cand = sorted(pages.values(), key=lambda p: p.get("index", 999))
    for p in cand:
        ii = (p.get("imageinfo") or [{}])[0]
        mime = ii.get("mime", "")
        if mime in ("image/jpeg", "image/png") and ii.get("thumburl") and (ii.get("thumbwidth", 0) >= 600):
            return ii["thumburl"]
    return None

def main():
    os.makedirs(OUT, exist_ok=True)
    # 重複 (" 2.jpg" 等) を掃除
    for fn in os.listdir(OUT):
        if re.search(r" \d+\.jpg$", fn):
            os.remove(os.path.join(OUT, fn)); print("削除(重複):", fn)
    dreams = parse_dreams()
    ok = fail = 0
    for ticker, nameEn in dreams:
        q = QUERY.get(ticker, nameEn)
        dest = os.path.join(OUT, f"{ticker}.jpg")
        try:
            img = commons_image(q)
            if not img:
                print(f"!!  {ticker}: 該当なし ({q})"); fail += 1; continue
            raw = get(img).read()
            with open(dest, "wb") as f:
                f.write(raw)
            print(f"OK  {ticker} <- \"{q}\"  ({len(raw)//1024}KB)"); ok += 1
            time.sleep(0.25)
        except Exception as e:
            print(f"!!  {ticker}: {e}"); fail += 1
    print(f"\n取得 {ok} / 失敗 {fail}  -> {OUT}")

if __name__ == "__main__":
    main()
