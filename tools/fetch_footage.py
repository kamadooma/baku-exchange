#!/usr/bin/env python3
"""全銘柄のテーマ画像を、銘柄ごとに手で選んだ English Wikipedia 記事の
代表画像(originalimage)から取得して assets/footage/<TICKER>.jpg に保存する。
抽象的な夢は名画を割り当て(夢らしく映える)。該当なし/SVGはスキップ→グラデ表示。
※ 画像は CC/PD 中心。展示で使う際は出典・ライセンス確認を。"""
import json, os, re, time, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "footage")
UA = "BakuExchange/1.0 (student speculative-design project; madoolittle609@gmail.com)"

# 銘柄 → 代表画像が的確な Wikipedia 記事（en）
IMG_WIKI = {
  "NOWAR":"Peace_symbols", "NUKE":"Nuclear_weapon", "NOHGR":"Famine", "NOPOV":"Poverty",
  "CURE":"Vaccine", "IMMO":"Fountain_of_Youth", "GEQ":"Gender_equality", "NODISC":"Civil_rights_movement",
  "FAIR":"Economic_inequality", "EDU":"Education", "DEMO":"Democracy", "CLEAN":"Political_corruption",
  "DISARM":"Nuclear_disarmament", "STOPGW":"Wind_power", "EXTN":"Dodo", "SUST":"Solar_power",
  "ENRGY":"Wind_power", "NOWORK":"Hammock", "UBI":"Banknote", "FIRE":"Beach", "HLTH":"Jogging",
  "YOUTH":"Fountain_of_Youth", "BODY":"Physical_fitness", "CALM":"Meditation", "NOANX":"Meditation",
  "CONF":"Self-confidence", "SELF":"Mirror", "CALL":"Artisan", "TALNT":"Piano", "FREE":"Bird",
  "JACK":"Lottery", "HOME":"House", "SOUL":"Romeo_and_Juliet", "LOVE":"The_Kiss_(Klimt)",
  "FRND":"Friendship", "ALONE":"Loneliness", "TRVL":"Tourism", "MARS":"Mars", "REUNI":"Heaven",
  "REDO":"Hourglass", "TIME":"Time_travel", "ETLIF":"Unidentified_flying_object", "FLYCR":"Flying_car",
  "FAME":"Celebrity", "ERTH2":"Exoplanet", "SING":"Humanoid_robot",
  "PANDM":"Pandemic", "CRSH":"Wall_Street_Crash_of_1929", "AIBC":"Data_center", "ROBOT":"Robot",
  "AIJOB":"Automation", "FOOD":"Agriculture", "QUAKE":"Earthquake", "BLKOUT":"Power_outage",
  "OIL":"1973_oil_crisis", "ENDDEM":"Protest", "FASC":"Fasces", "ALIEN":"Flying_saucer",
  "ASTER":"Impact_event", "ARMAG":"The_Great_Day_of_His_Wrath", "SURV":"Closed-circuit_television",
  "LEAK":"Security_hacker",
  "PWD":"Password", "FALL":"Cloud", "CHASE":"Forest", "TEETH":"Human_tooth", "FLY":"Bird",
  "NAKED":"The_Birth_of_Venus", "MUTE":"The_Nightmare", "DROWN":"Ophelia_(painting)",
  "EXAM":"Test_(assessment)", "FUNRL":"Funeral", "MIRR":"Mirror", "DEAD":"Telephone",
  "LOOP":"Clock", "NOWAKE":"Sleep", "FALSE":"Dream",
  "MEETLOVE":"The_Kiss_(Hayez)", "DEADCAT":"Cat", "FORGETEX":"Rain",
  "OSHI":"Concert", "SLEEP":"Sleep", "PARENT":"Family", "NEEDED":"Hug", "CHILD":"Child",
  "HOME2":"Village", "UNDO":"Letter_(message)", "DEBT":"Debt", "PREZ":"White_House",
  "BALLER":"Association_football", "SINGER":"Singing", "ASTRO":"Astronaut", "ELOPE":"Elopement",
  "CLASS":"Communist_symbolism", "ENLIGHT":"Gautama_Buddha", "EDEN":"Garden_of_Eden",
  "JUDG":"The_Last_Judgment_(Michelangelo)", "MESSI":"Jesus", "GOLDEN":"Golden_Age", "STONE":"Philosopher's_stone",
  "PERP":"Perpetual_motion", "UTOPIA":"Utopia", "PROG":"Steam_locomotive", "REASON":"Age_of_Enlightenment",
  "ENHANCE":"Transhumanism", "SCIFUT":"Laboratory", "WREV":"Liberty_Leading_the_People",
  "REBORN":"Nelumbo_nucifera", "SOULIM":"Soul", "SHANGRI":"Potala_Palace", "ATLANT":"Atlantis",
  "RIVAL":"Sprint_(running)", "CRUSH":"Romance_(love)", "CHOSEN":"Excalibur", "FORESEE":"Crystal_ball",
  "ANIMAL":"Dog", "REVENGE":"Revenge",
  "MARX":"Karl_Marx", "WPRE":"Women's_suffrage", "2COM":"Second_Coming",
  "JPSK":"2011_Tōhoku_earthquake_and_tsunami", "GROW":"Skyscraper",
}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=20)

def parse_wiki_fallback():
    src = open(os.path.join(ROOT, "data.js"), encoding="utf-8").read()
    out = {}
    for m in re.finditer(r'ticker:\s*"([^"]+)".*?wiki:\s*"([^"]*)"', src, re.S):
        out[m.group(1)] = m.group(2)
    return out

def lead_image(article):
    title = urllib.parse.quote(article, safe="")
    data = json.load(get(f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}"))
    for key in ("originalimage", "thumbnail"):
        src = (data.get(key) or {}).get("source")
        if src and not src.lower().endswith(".svg"):
            return src
    return None

def main():
    os.makedirs(OUT, exist_ok=True)
    for fn in os.listdir(OUT):
        if re.search(r" \d+\.jpg$", fn):
            os.remove(os.path.join(OUT, fn))
    fallback = parse_wiki_fallback()
    tickers = list(dict.fromkeys(list(IMG_WIKI) + list(fallback)))
    ok = skip = 0
    for t in tickers:
        article = IMG_WIKI.get(t) or fallback.get(t)
        if not article:
            print(f"--  {t}: 記事なし→グラデ"); skip += 1; continue
        try:
            img = lead_image(article)
            if not img:
                print(f"!!  {t}: 画像なし ({article})"); skip += 1; continue
            raw = get(img).read()
            with open(os.path.join(OUT, f"{t}.jpg"), "wb") as f:
                f.write(raw)
            print(f"OK  {t:8s} <- {article}  ({len(raw)//1024}KB)"); ok += 1
            time.sleep(0.25)
        except Exception as e:
            print(f"!!  {t}: {e}"); skip += 1
    print(f"\n取得 {ok} / スキップ {skip}  -> {OUT}")

if __name__ == "__main__":
    main()
