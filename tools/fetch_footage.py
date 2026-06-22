#!/usr/bin/env python3
"""全銘柄のテーマ画像・動画を Pexels API で取得して assets/footage/<TICKER>.{jpg,mp4} に保存する。
動画があれば .mp4、なければ .jpg にフォールバック（orb.js が自動で切り替え）。
使い方:
  export PEXELS_API_KEY=your_key_here
  python3 tools/fetch_footage.py            # 不足分のみ取得
  python3 tools/fetch_footage.py --force    # 全件再取得
  python3 tools/fetch_footage.py PARENT SEX # 指定銘柄のみ再取得
APIキー取得: https://www.pexels.com/api/ (無料・月20万リクエスト)
"""
import json, os, sys, time, urllib.request, urllib.parse, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "footage")
API_KEY = os.environ.get("PEXELS_API_KEY", "")

# 銘柄 → Pexels 検索キーワード
IMG_QUERY = {
  # 世界課題・希望
  "NOWAR":   "peace dove white",
  "NUKE":    "nuclear explosion mushroom cloud",
  "NOHGR":   "famine hunger poverty",
  "NOPOV":   "poverty slum urban",
  "CURE":    "vaccine syringe medicine",
  "IMMO":    "fountain eternal youth",
  "GEQ":     "gender equality women empowerment",
  "NODISC":  "civil rights protest equality",
  "FAIR":    "economic inequality wealth gap",
  "EDU":     "education school learning",
  "DEMO":    "democracy voting election",
  "CLEAN":   "political corruption justice",
  "DISARM":  "berlin wall fall 1989",
  "STOPGW":  "wind turbine renewable energy",
  "EXTN":    "dodo bird extinct",
  "SUST":    "solar panel sustainable energy",
  "ENRGY":   "wind energy turbine",
  # 個人・日常
  "NOWORK":  "hammock relaxing vacation",
  "UBI":     "banknote money cash",
  "FIRE":    "beach sunset relaxing",
  "HLTH":    "jogging running health",
  "YOUTH":   "young beauty eternal youth",
  "BODY":    "fitness gym workout",
  "CALM":    "meditation zen peaceful",
  "NOANX":   "calm serene nature tranquil",
  "CONF":    "confidence success achievement",
  "SELF":    "mirror reflection self portrait",
  "CALL":    "artisan craft workshop hands",
  "TALNT":   "piano music performance",
  "FREE":    "bird flying freedom sky",
  "JACK":    "lottery jackpot winner",
  "HOME":    "house family home cozy",
  # 感情・関係
  "SOUL":    "romantic couple romeo juliet balcony",
  "LOVE":    "couple kiss romantic intimate",
  "FRND":    "friends laughing friendship",
  "ALONE":   "loneliness solitude person alone",
  "TRVL":    "travel adventure tourism",
  "MARS":    "mars planet red surface",
  "REUNI":   "reunion family hug embrace",
  "REDO":    "hourglass time vintage",
  "TIME":    "clock time surreal dreamlike",
  "ETLIF":   "ufo alien sky night",
  "FLYCR":   "flying car futuristic",
  "FAME":    "celebrity fame crowd paparazzi",
  "ERTH2":   "exoplanet space galaxy",
  "SING":    "humanoid robot android",
  # 事件・社会
  "PANDM":   "pandemic mask protective",
  "CRSH":    "stock market crash financial crisis",
  "AIBC":    "data center server technology",
  "ROBOT":   "robot machine automation",
  "AIJOB":   "automation factory machine",
  "FOOD":    "agriculture farm harvest",
  "QUAKE":   "earthquake destruction ruins",
  "BLKOUT":  "power outage blackout dark city",
  "OIL":     "oil crisis gas station",
  "ENDDEM":  "protest demonstration crowd",
  "FASC":    "military parade soldiers march totalitarian",
  "ALIEN":   "flying saucer ufo",
  "ASTER":   "asteroid space impact meteor",
  "ARMAG":   "apocalypse storm dramatic sky",
  "SURV":    "surveillance camera security cctv",
  "LEAK":    "hacker dark screen code",
  # 夢・悪夢
  "PWD":     "password computer screen login",
  "FALL":    "falling dream surreal sky",
  "CHASE":   "running forest chase dark",
  "TEETH":   "teeth dental smile close up",
  "FLY":     "person flying sky freedom aerial",
  "NAKED":   "birth of venus painting renaissance",
  "MUTE":    "nightmare dark surreal dream",
  "DROWN":   "woman floating water dreamy",
  "EXAM":    "exam test school stress",
  "FUNRL":   "funeral cemetery mourning",
  "MIRR":    "mirror reflection dark mysterious",
  "DEAD":    "old telephone vintage rotary",
  "LOOP":    "clock loop time repeat",
  "NOWAKE":  "sleeping peaceful night bedroom",
  "FALSE":   "dream surreal abstract",
  # 欲望・感情
  "SEX":     "steam engine pistons locomotive mechanics",
  "MEETLOVE":"couple romantic first meeting",
  "DEADCAT": "cat sleeping peaceful",
  "FORGETEX":"rain window melancholy alone",
  "OSHI":    "concert crowd music stage",
  "SLEEP":   "sleeping peaceful night",
  "PARENT":  "vintage family portrait old photograph",
  "NEEDED":  "hug embrace comfort care",
  "CHILD":   "child playing innocent",
  "HOME2":   "village countryside peaceful",
  "UNDO":    "letter writing vintage paper",
  "DEBT":    "debt money stress bills",
  "PREZ":    "white house government",
  "BALLER":  "football soccer sport",
  "SINGER":  "singing microphone performance",
  "ASTRO":   "astronaut space suit",
  "ELOPE":   "elopement wedding couple",
  # 思想・宗教
  "CLASS":   "communist revolution red flag",
  "ENLIGHT": "buddha meditation enlightenment",
  "EDEN":    "garden paradise lush green",
  "JUDG":    "last judgment religious painting",
  "MESSI":   "jesus christ religious",
  "GOLDEN":  "golden age prosperity abundance",
  "STONE":   "alchemy philosopher stone ancient",
  "PERP":    "perpetual motion machine mechanical",
  "UTOPIA":  "utopia perfect world city",
  "PROG":    "steam locomotive vintage train",
  "REASON":  "enlightenment philosophy books library",
  "ENHANCE": "cyborg transhumanism future body",
  "SCIFUT":  "laboratory science research",
  "WREV":    "revolution protest crowd flag",
  "REBORN":  "lotus flower rebirth water",
  "SOULIM":  "soul spirit ethereal light",
  "SHANGRI": "tibet monastery mountain paradise",
  "ATLANT":  "underwater ruins ancient city",
  # 競争・運命
  "RIVAL":   "running race sprint competition",
  "CRUSH":   "romantic crush love",
  "CHOSEN":  "sword stone legend medieval",
  "FORESEE": "crystal ball fortune telling",
  "ANIMAL":  "dog pet loyal faithful",
  "REVENGE": "revenge anger dramatic",
  "MARX":    "karl marx communist",
  "WPRE":    "women suffrage protest march",
  "2COM":    "second coming religious dramatic sky",
  "JPSK":    "tsunami ocean wave destruction",
  "GROW":    "skyscraper city urban growth",
  # 追加銘柄
  "ROCK":    "electric guitar rock music",
  "CINDER":  "cinderella fairy tale princess ball",
  "TENNO":   "coronation ceremony royal crown",
  "TOWER":   "skyscraper tall building city",
  "INHERIT": "gold bars wealth treasure",
  "FOLLOW":  "social media followers phone screen",
  "SLEEPIN": "sleeping bed bedroom cozy",
  "BILLION": "luxury private jet billionaire mansion",
  "HAREM":   "opulent ornate luxury room",
  "WEDLOCK": "wedding portrait couple vintage",
  "FLORIST": "sunflowers yellow flower field",
  "ROADEXT": "road highway endless horizon",
  "SUNKCITY":"flood city underwater",
  "DATALOSS":"hard drive computer data loss",
  "SUMMER":  "beach summer ocean sunshine",
  "SKYFALL": "storm dramatic sky lightning",
  "ROOMS":   "stairs corridor architecture",
  "LOSTHOME":"ghost town abandoned building",
  "LOOPTALK":"infinity loop spiral abstract",
  "QUITJOB": "office desk corporate empty",
  "MOTE":    "aphrodite goddess sculpture ancient",
  "DONTWAKE":"sleeping woman fairy tale forest",
  "REUNION": "party celebration reunion",
  "CUTE":    "selfie girl phone social media",
}

# seed値上位25銘柄（--priority フラグで動画取得対象を絞る用）
TOP_TICKERS = {
    "CUTE","NUKE","AIBC","GROW","SING","MARS","STOPGW","PANDM","CRSH",
    "ENRGY","AIJOB","EXTN","NOWAR","ROBOT","CURE","DEMO","FREE","QUAKE",
    "SURV","WPRE","GEQ","FASC","SUST","HLTH","ARMAG",
}

HEADERS = {
    "Authorization": API_KEY,
    "User-Agent": "BakuExchange/1.0 (student speculative-design project; madoolittle609@gmail.com)",
}

def pexels_photo(query):
    q = urllib.parse.quote(query)
    url = f"https://api.pexels.com/v1/search?query={q}&per_page=1&orientation=square"
    req = urllib.request.Request(url, headers=HEADERS)
    data = json.load(urllib.request.urlopen(req, timeout=20))
    photos = data.get("photos", [])
    if not photos:
        return None
    return photos[0]["src"]["large"]

def pexels_video(query):
    q = urllib.parse.quote(query)
    url = f"https://api.pexels.com/videos/search?query={q}&per_page=1&orientation=square"
    req = urllib.request.Request(url, headers=HEADERS)
    data = json.load(urllib.request.urlopen(req, timeout=20))
    videos = data.get("videos", [])
    if not videos:
        return None
    # SD画質を優先（ファイルサイズ節約）、なければHD
    files = videos[0].get("video_files", [])
    sd = [f for f in files if f.get("quality") == "sd"]
    hd = [f for f in files if f.get("quality") == "hd"]
    chosen = (sd or hd or files)
    if not chosen:
        return None
    # 解像度が小さい方を選ぶ
    chosen.sort(key=lambda f: f.get("width", 9999))
    return chosen[0].get("link")

def download(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60).read()

def parse_data_js_queries():
    """data.js の wiki フィールドをフォールバック検索クエリとして使う"""
    src = open(os.path.join(ROOT, "data.js"), encoding="utf-8").read()
    out = {}
    for m in re.finditer(r'ticker:\s*"([^"]+)".*?wiki:\s*"([^"]*)"', src, re.S):
        wiki = m.group(2).strip()
        if wiki:
            out[m.group(1)] = wiki.replace("_", " ")
    return out

def main():
    if not API_KEY:
        print("エラー: PEXELS_API_KEY が設定されていません。")
        print("  export PEXELS_API_KEY=あなたのキー")
        print("  APIキー取得: https://www.pexels.com/api/")
        sys.exit(1)

    if "--concepts" in sys.argv:
        os.makedirs(OUT, exist_ok=True)
        download_concepts()
        return

    force    = "--force"    in sys.argv
    priority = "--priority" in sys.argv
    targets  = [a for a in sys.argv[1:] if not a.startswith("--")]

    os.makedirs(OUT, exist_ok=True)
    fallback = parse_data_js_queries()
    all_queries = {**fallback, **IMG_QUERY}  # IMG_QUERY が優先

    if targets:
        tickers = targets
    elif priority:
        tickers = [t for t in all_queries if t in TOP_TICKERS]
    else:
        tickers = list(all_queries)

    ok_v = ok_i = skip = 0
    for t in tickers:
        query = all_queries.get(t)
        if not query:
            print(f"--  {t}: クエリなし→スキップ"); skip += 1; continue

        vid_path = os.path.join(OUT, f"{t}.mp4")
        img_path = os.path.join(OUT, f"{t}.jpg")
        already_vid = os.path.exists(vid_path)
        already_img = os.path.exists(img_path)
        if already_vid and already_img and not force and not targets:
            continue

        try:
            # 動画を試みる（--priority 時は TOP_TICKERS のみ）
            want_video = not already_vid or force or targets
            if want_video and (not priority or t in TOP_TICKERS):
                vid_url = pexels_video(query)
                if vid_url:
                    raw = download(vid_url)
                    with open(vid_path, "wb") as f:
                        f.write(raw)
                    print(f"VID {t:8s} <- \"{query}\"  ({len(raw)//1024}KB)")
                    ok_v += 1
                    time.sleep(0.1)

            # 画像も取得（動画なし銘柄のフォールバック用）
            if not already_img or force or targets:
                img_url = pexels_photo(query)
                if img_url:
                    raw = download(img_url)
                    with open(img_path, "wb") as f:
                        f.write(raw)
                    print(f"IMG {t:8s} <- \"{query}\"  ({len(raw)//1024}KB)")
                    ok_i += 1
                else:
                    print(f"!!  {t}: 画像なし ({query})"); skip += 1
                time.sleep(0.1)

        except Exception as e:
            print(f"!!  {t}: {e}"); skip += 1

    print(f"\n動画 {ok_v} / 画像 {ok_i} / スキップ {skip}  -> {OUT}")

# ── 視覚コンセプト画像の事前ダウンロード ──────────────────────────────────────
# python3 tools/fetch_footage.py --concepts   で実行
# assets/footage/concept_<slug>.jpg に保存
CONCEPT_QUERIES = {
  # 怖い生き物
  "dinosaur":       "dinosaur tyrannosaurus prehistoric",
  "dragon":         "dragon fire flying mythical",
  "wolf":           "wolf howling dark forest",
  "bear":           "bear grizzly wild forest",
  "tiger":          "tiger wild orange stripe",
  "lion":           "lion roaring mane savanna",
  "shark":          "shark underwater dark ocean",
  "snake":          "snake reptile coiled",
  "crocodile":      "crocodile jaws water",
  "spider":         "spider web dark creepy",
  "scorpion":       "scorpion desert venom",
  "bee_swarm":      "bees swarm hive dark",
  "whale":          "whale ocean deep blue",
  "octopus":        "octopus tentacles underwater",
  "jellyfish":      "jellyfish glowing ocean",
  "gorilla":        "gorilla jungle powerful",
  "elephant":       "elephant wild africa",
  "eagle":          "eagle soaring sky",
  "owl":            "owl dark night forest",
  "crow":           "crow black dark ominous",
  # 超自然・ホラー
  "zombie":         "zombie horror dark abandoned",
  "ghost":          "ghost transparent ethereal dark",
  "demon":          "demon dark supernatural fire",
  "skeleton":       "skeleton dark bones creepy",
  "vampire":        "vampire gothic castle dark",
  "mummy":          "mummy ancient bandage",
  "werewolf":       "werewolf dark full moon",
  "alien":          "alien ufo spaceship gray",
  "monster":        "monster creature dark scary",
  "kaiju":          "giant monster city destruction",
  # 自然災害
  "volcano":        "volcano eruption lava dramatic",
  "tsunami":        "tsunami giant wave destruction",
  "tornado":        "tornado dark spinning destruction",
  "lightning":      "lightning storm dramatic sky",
  "wildfire":       "wildfire forest fire dramatic",
  "flood":          "flood water disaster",
  "earthquake":     "earthquake destruction ruins",
  "avalanche":      "avalanche snow mountain",
  "sandstorm":      "sandstorm desert orange",
  # 場所
  "cave":           "cave dark underground mysterious",
  "labyrinth":      "labyrinth maze dark corridor",
  "ruins":          "abandoned ruins dark overgrown",
  "castle":         "castle medieval dark stone",
  "cemetery":       "cemetery dark fog tombstone",
  "dungeon":        "dungeon dark stone prison",
  "pyramid":        "pyramid egypt ancient desert",
  "deep_sea":       "deep sea ocean abyss dark bioluminescent",
  "forest_dark":    "dark forest mysterious fog",
  "desert":         "desert sand dunes vast",
  "mountain":       "mountain peak dramatic sky",
  "waterfall":      "waterfall nature dramatic",
  # その他
  "sword":          "sword medieval battle shining",
  "fire":           "fire flames burning dramatic",
  "explosion":      "explosion fire dramatic",
  "blood":          "blood dark red dramatic",
  "chain":          "chain metal dark bound",
  "mirror_dark":    "mirror dark reflection mysterious",
  "clock":          "clock time surreal dark",
  "fog":            "fog dark mysterious forest",
  "ritual":         "ritual dark candles circle",
  "spaceship":      "spacecraft spaceship orbit",
  "black_hole":     "black hole space dramatic",
  "mermaid":        "mermaid underwater ocean fantasy",
  "phoenix":        "phoenix fire rebirth flames",
  "griffin":        "griffin mythical creature sky",
  "unicorn":        "unicorn magical white fantasy",
  "samurai":        "samurai warrior armor sword",
  "ninja":          "ninja dark shadow warrior",
  "robot_dark":     "robot machine dark sci-fi",
  "cyborg":         "cyborg human machine technology",
}

def download_concepts():
    if not API_KEY:
        print("PEXELS_API_KEY が必要です"); return
    ok = skip = 0
    for slug, query in CONCEPT_QUERIES.items():
        out_path = os.path.join(OUT, f"concept_{slug}.jpg")
        if os.path.exists(out_path):
            continue
        try:
            img_url = pexels_photo(query)
            if not img_url:
                print(f"!!  concept_{slug}: 画像なし"); skip += 1; continue
            raw = download(img_url)
            with open(out_path, "wb") as f:
                f.write(raw)
            print(f"OK  concept_{slug:20s} <- \"{query[:40]}\"  ({len(raw)//1024}KB)")
            ok += 1; time.sleep(0.15)
        except Exception as e:
            print(f"!!  concept_{slug}: {e}"); skip += 1
    print(f"\n取得 {ok} / スキップ {skip}")

if __name__ == "__main__":
    main()

