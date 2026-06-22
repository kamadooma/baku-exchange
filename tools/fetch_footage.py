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
  "FASC":    "crowd rally protest propaganda dark dramatic",
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
  # ── 動物 ──
  "horse":          "horse running wild freedom",
  "fox":            "fox forest cunning dark",
  "deer":           "deer forest gentle nature",
  "rabbit":         "rabbit white fluffy nature",
  "cat_black":      "black cat night mysterious",
  "bat":            "bat dark night flying cave",
  "butterfly":      "butterfly colorful wings flower",
  "frog":           "frog pond rain green",
  "crow_flock":     "crow flock dark sky ominous",
  "fish_school":    "fish school underwater blue ocean",
  "dolphin":        "dolphin ocean jumping blue",
  "penguin":        "penguin snow ice cold",
  "hawk":           "hawk bird prey sky hunting",
  "flamingo":       "flamingo pink water elegant",
  "peacock":        "peacock feathers colorful display",
  "rat":            "rat dark city sewer",
  "pig":            "pig farm animal mud",
  "cow":            "cow farm pastoral meadow",
  "monkey":         "monkey jungle tree climbing",
  "camel":          "camel desert sand caravan",
  "parrot":         "parrot colorful tropical bird",
  "turtle":         "turtle slow ancient shell ocean",
  "crab":           "crab beach ocean claws",
  "mosquito":       "mosquito insect dark macro close",
  "locust":         "locust swarm plague destruction field",
  # ── 場所 ──
  "hospital_room":  "hospital room bed dark empty",
  "classroom":      "empty classroom school desks dark",
  "prison_cell":    "prison cell bars dark confined",
  "library_dark":   "dark library old books mysterious",
  "train_night":    "night train window dark motion blur",
  "subway":         "subway underground tunnel dark",
  "airport":        "airport terminal night empty",
  "harbor":         "harbor night water reflection fog",
  "bridge_dark":    "bridge dark night fog dramatic",
  "skyscraper_night":"skyscraper night city lights dark",
  "church":         "church dark interior candles Gothic",
  "japanese_shrine":"Japanese shrine torii gate forest",
  "temple_ancient": "ancient temple ruins jungle",
  "marketplace":    "crowded marketplace night market",
  "theater_dark":   "empty theater dark stage spotlight",
  "stadium_night":  "stadium night lights crowd",
  "lighthouse":     "lighthouse storm ocean dramatic",
  "mansion":        "mansion dark haunted abandoned",
  "rooftop":        "rooftop city night skyline",
  "sewer":          "sewer dark underground water",
  "carnival_night": "carnival night dark rides lights",
  "old_town":       "old town narrow alley dark night",
  "space_station":  "space station orbit Earth view",
  "arctic":         "arctic ice snow vast desolate",
  "jungle":         "jungle dense tropical green dark",
  "beach_night":    "beach night dark ocean waves",
  "snow_field":     "snow field white vast empty",
  "autumn_forest":  "autumn forest orange red leaves fog",
  "graveyard_fog":  "graveyard fog night tombstone dark",
  "underground_bunker": "underground bunker dark concrete",
  # ── ホラー・ダーク ──
  "shadow_figure":  "shadow figure silhouette dark mysterious",
  "creepy_doll":    "creepy doll old porcelain dark",
  "clown_horror":   "horror clown dark scary mask",
  "scarecrow":      "scarecrow field dark crow ominous",
  "grim_reaper":    "grim reaper death dark scythe",
  "dark_angel":     "dark angel wings black fallen",
  "witch_dark":     "witch dark forest night magic",
  "mask_horror":    "horror mask dark mysterious",
  "mannequin_dark": "mannequin dark store window eerie",
  "broken_glass":   "broken glass shattered dark dramatic",
  "hand_reaching":  "hand reaching out dark dramatic",
  "eye_watching":   "eye watching dark close up intense",
  "puppet_dark":    "puppet marionette dark strings",
  "dark_corridor":  "dark corridor hallway empty eerie",
  "flickering_light":"flickering light dark horror",
  # ── 超自然・神話 ──
  "angel_white":    "angel white wings light divine",
  "tengu":          "tengu Japanese mythical creature mask",
  "kappa":          "kappa Japanese river creature mythical",
  "snow_woman":     "snow woman winter white mysterious Japanese",
  "oni_face":       "oni Japanese demon mask red",
  "torii_gate":     "torii gate red Japan forest",
  "shrine_night":   "Japanese shrine night dark lanterns",
  "death_personified": "death personified dark abstract figure",
  "black_cat_night":"black cat night dark mysterious",
  "crow_omen":      "crow dark omen bad luck perched",
  "spider_web_large":"spider web large dark dew drops",
  # ── オブジェクト・シンボル ──
  "key_old":        "old key antique dark rusty",
  "door_dark":      "dark door mysterious old wood",
  "treasure_chest": "treasure chest gold ancient dark",
  "crown_royal":    "crown royal gold jewels",
  "hourglass_dark": "hourglass dark time sand",
  "telescope_night":"telescope night sky stars observatory",
  "ancient_book":   "ancient book old dark magic",
  "candle_dark":    "candle flame dark night dramatic",
  "compass":        "compass old antique navigation",
  "poison_bottle":  "poison bottle dark mysterious glass",
  "wedding_dress":  "wedding dress white elegant",
  "broken_mirror":  "broken mirror shattered dark reflection",
  "old_photograph": "old photograph vintage sepia faded",
  "locked_box":     "locked box dark mysterious",
  "golden_cage":    "golden cage bird ornate",
  "amulet":         "amulet talisman dark mystic ancient",
  "ruins_map":      "ancient map ruins treasure parchment",
  # ── 感情（視覚） ──
  "loneliness_empty":"loneliness empty room solitude dark",
  "joy_festival":   "joy festival celebration crowd lights",
  "nostalgia_sepia":"nostalgia sepia old memory vintage",
  "rage_fire":      "rage anger fire dramatic dark",
  "grief_rain":     "grief rain crying alone dark",
  "anxiety_crowd":  "anxiety crowd overwhelmed dark blur",
  "wonder_light":   "wonder light magical glowing",
  "dread_darkness": "dread darkness horror dark abstract",
  # ── 職業（夢の中の） ──
  "surgeon_operating":"surgeon operating room dark dramatic",
  "astronaut_spacewalk":"astronaut spacewalk space dramatic",
  "king_throne":    "king throne royal crown gold",
  "scientist_lab":  "scientist laboratory dark experiment",
  "spy_shadow":     "spy shadow dark silhouette",
  "knight_armor":   "knight armor medieval sword",
  "gladiator_arena":"gladiator arena ancient combat",
  "executioner_dark":"executioner dark hood medieval",
  "detective_noir": "detective noir dark rain shadow",
  "pilot_cockpit":  "pilot cockpit airplane dark night",
  # ── 自然・天気 ──
  "rainbow":        "rainbow sky colorful dramatic",
  "aurora_borealis":"aurora borealis northern lights sky",
  "solar_eclipse":  "solar eclipse dark dramatic sky",
  "blizzard":       "blizzard snow storm white dark",
  "lightning_strike":"lightning strike dramatic night sky",
  "meteor_shower":  "meteor shower night sky shooting stars",
  "deep_ocean":     "deep ocean dark abyss bioluminescent",
  "lava_flow":      "lava flow volcano dramatic dark",
  "quicksand":      "quicksand sinking desert dangerous",
  "whirlpool":      "whirlpool water vortex dark",
  "mushroom_forest":"mushroom forest dark fairy tale",
  "crystal_cave":   "crystal cave glowing dark blue",
  "frozen_lake":    "frozen lake ice dark winter",
  "volcanic_ash":   "volcanic ash dark sky dramatic",
  # ── テック・SF ──
  "time_machine":   "time machine vintage sci-fi dark",
  "portal_vortex":  "portal vortex energy sci-fi dramatic",
  "ai_face":        "artificial intelligence face digital",
  "virus_microscopic":"virus microscopic electron microscope",
  "nuclear_plant":  "nuclear power plant dark dramatic",
  "drone_swarm":    "drone swarm sky dark technology",
  "data_stream":    "data stream digital code dark",
  "hologram":       "hologram digital projection sci-fi",
  "android_face":   "android face robot human-like",
  # ── 食・身体 ──
  "feast_table":    "feast table food banquet dark",
  "poison_cup":     "poison cup dark mysterious glass",
  "medicine_dark":  "medicine dark pills syringe medical",
  "syringe_medical":"syringe needle medical dark close",
  "eye_closeup":    "eye close up dramatic dark macro",
  "teeth_close":    "teeth close up macro dramatic",
  "hands_aging":    "aging hands wrinkled dark close up",
  "face_mirror":    "face mirror reflection dark dramatic",

  # ── Food & Drink ──
  "ramen":          "ramen noodle soup bowl japanese",
  "sushi":          "sushi plate japanese food",
  "rice_bowl":      "rice bowl japanese food",
  "bread":          "fresh bread bakery warm",
  "cake_sweet":     "birthday cake sweet dessert",
  "ice_cream":      "ice cream cone melting",
  "vegetables":     "fresh vegetables colorful market",
  "fruit_bowl":     "fruit bowl colorful fresh",
  "coffee_dark":    "coffee cup dark morning",
  "school_lunch":   "school lunch cafeteria tray",
  "fast_food":      "fast food burger fries",
  "pizza":          "pizza slice cheese pull",
  "chocolate":      "chocolate dark sweet",
  "watermelon":     "watermelon slice summer",
  "barbecue":       "barbecue grill meat outdoor",
  "noodles":        "noodles pasta bowl steam",
  "bento":          "japanese bento box lunch",
  "soda_drink":     "soda drink bubbles cold",
  "alcohol_drink":  "whiskey glass dark bar",
  "tea_ceremony":   "japanese tea ceremony serene",

  # ── Everyday Places ──
  "convenience_store": "convenience store night japan",
  "supermarket":    "supermarket aisle products",
  "train_station_jp": "japanese train station busy platform",
  "office_building": "office building interior corporate",
  "apartment_night": "apartment building night windows",
  "restaurant_dark": "restaurant interior dim cozy",
  "cafe_morning":   "cafe morning light coffee table",
  "park_bench":     "park bench autumn leaves",
  "playground":     "empty playground swing night",
  "shopping_street": "shopping street japan busy",
  "arcade":         "arcade game center japan night",
  "karaoke":        "karaoke microphone stage lights",
  "izakaya":        "izakaya japanese bar night lanterns",
  "onsen":          "onsen hot spring steam outdoor",
  "temple_garden":  "japanese garden zen peaceful",
  "beach_summer":   "beach summer ocean sunny",
  "ski_slope":      "ski slope snow winter mountain",
  "concert_hall":   "concert hall empty stage",
  "museum_dark":    "museum dark corridor art",
  "maze_dark":      "dark maze corridor endless",

  # ── Transportation ──
  "bicycle":        "bicycle road street riding",
  "motorcycle":     "motorcycle road speed dark",
  "bus_empty":      "empty bus night interior",
  "taxi":           "taxi cab night city street",
  "bullet_train":   "shinkansen bullet train speed blur",
  "airplane_window": "airplane window clouds view",
  "helicopter":     "helicopter flying city night",
  "boat_ocean":     "small boat ocean alone",
  "submarine":      "submarine underwater dark",
  "hot_air_balloon": "hot air balloon sky sunrise",
  "rocket_launch":  "rocket launch fire smoke",
  "old_car":        "vintage old car abandoned",
  "ambulance":      "ambulance night emergency lights",
  "police_car":     "police car night lights",
  "fire_truck":     "fire truck emergency night",

  # ── Weather & Time ──
  "morning_light":  "morning golden light bedroom",
  "midnight_room":  "room midnight dark blue",
  "sunset_orange":  "sunset orange dramatic sky",
  "heavy_rain":     "heavy rain storm street",
  "snowfall_quiet": "snowfall quiet street night",
  "thick_fog":      "thick fog street mysterious",
  "heatwave":       "heat wave summer dry cracked",
  "after_rain":     "after rain puddle reflection",
  "storm_window":   "storm outside window looking",
  "bright_sun":     "bright sun desert bleached",

  # ── Everyday Objects ──
  "smartphone":     "smartphone screen dark glowing",
  "broken_phone":   "broken cracked phone screen",
  "old_letter":     "handwritten letter envelope vintage",
  "mirror_bathroom": "bathroom mirror reflection morning",
  "empty_wallet":   "empty wallet money gone",
  "passport_travel": "passport travel documents",
  "alarm_clock":    "alarm clock ringing morning",
  "locked_door":    "locked door dark hallway",
  "window_night":   "window looking out night rain",
  "staircase_dark": "staircase dark empty echoing",
  "elevator":       "elevator door opening dark",
  "broken_tv":      "broken television static dark",
  "old_radio":      "vintage radio old music",
  "teddy_bear":     "teddy bear old worn child",
  "toy_box":        "toy box childhood memories",
  "wedding_ring":   "wedding ring alone abandoned",
  "glasses_broken": "glasses broken floor",
  "briefcase":      "briefcase work office dark",
  "shopping_bag":   "shopping bags many consumer",
  "piggy_bank":     "piggy bank broken coins",

  # ── People & Social Situations ──
  "crowd_busy":     "crowd busy street people moving",
  "empty_school":   "empty school hallway lockers",
  "classroom_kids": "school classroom children studying",
  "office_stress":  "office worker stress deadline",
  "family_dinner":  "family dinner table together",
  "argument_people": "two people arguing confrontation",
  "lonely_person":  "lonely person sitting alone dark",
  "running_late":   "person running late rush street",
  "lost_person":    "person lost confused street map",
  "job_interview":  "job interview table formal",
  "funeral_procession": "funeral procession cemetery dark",
  "wedding_ceremony": "wedding ceremony aisle flowers",
  "birthday_party": "birthday party celebration candles",
  "graduation_ceremony": "graduation ceremony diploma stage",
  "protest_crowd":  "protest crowd street signs",
  "sports_game":    "sports game competition running",
  "dating_couple":  "couple dating romantic dinner",
  "old_couple":     "elderly couple hand in hand",
  "newborn_baby":   "newborn baby sleeping peaceful",
  "doctor_patient": "doctor patient hospital consultation",

  # ── Body & Health ──
  "running_person": "person running marathon road",
  "swimming_pool":  "swimming pool water lanes",
  "sleeping_person": "sleeping person bed peaceful",
  "hospital_bed":   "hospital bed empty white",
  "dentist_chair":  "dentist chair equipment bright",
  "surgery_light":  "surgery operating room bright lights",
  "x_ray":          "xray skeleton medical dark",
  "yoga_meditation": "yoga meditation peaceful",
  "crying_person":  "person crying tears sadness",
  "laughing_person": "person laughing joy happy",

  # ── Animals (more) ──
  "cat_sleeping":   "cat sleeping peaceful curled",
  "dog_running":    "dog running happy park",
  "bird_cage":      "bird cage empty open",
  "fish_tank":      "fish tank aquarium dark",
  "horse_dark":     "horse dark dramatic field",
  "crow_single":    "single crow dark perched",
  "white_dove":     "white dove flying peace",
  "black_swan":     "black swan elegant dark water",
  "rabbit_white":   "white rabbit dreamlike surreal",
  "cat_eyes":       "cat eyes glowing dark night",

  # ── Nature & Seasons ──
  "cherry_blossom": "cherry blossom sakura falling",
  "autumn_path":    "autumn path leaves falling",
  "winter_snow":    "winter snow quiet peaceful",
  "summer_field":   "summer flower field bright",
  "rain_street":    "rain street puddles night",
  "sunrise_mountain": "sunrise mountain peak dramatic",
  "full_moon":      "full moon dark sky forest",
  "shooting_star":  "shooting star night sky wish",
  "river_flow":     "river flowing peaceful nature",
  "ocean_horizon":  "ocean horizon sunset alone",
  "earthquake_crack": "earthquake ground crack road",
  "flood_street":   "flood street underwater car",
  "wildfire_tree":  "wildfire burning tree dramatic",
  "ice_storm":      "ice storm frozen branches",
  "drought_land":   "drought cracked dry land",

  # ── Food - Vegetables ──
  "tomato":         "tomato red fresh vegetable",
  "green_pepper":   "green bell pepper vegetable",
  "cucumber":       "cucumber fresh green",
  "carrot":         "carrot orange vegetable",
  "potato":         "potato vegetable rustic",
  "eggplant":       "eggplant purple vegetable",
  "onion":          "onion vegetable layers",
  "broccoli":       "broccoli green fresh",
  "pumpkin":        "pumpkin orange autumn",
  "corn":           "corn yellow fresh",
  # ── Food - Fruits ──
  "apple_fruit":    "apple red fresh fruit",
  "banana":         "banana yellow fruit",
  "strawberry":     "strawberry red fresh",
  "grape":          "grapes purple fresh",
  "watermelon_slice":"watermelon slice red",
  "peach":          "peach pink fruit",
  "lemon":          "lemon yellow sour",
  "orange_fruit":   "orange citrus fresh",
  "cherry":         "cherry red shiny",
  "mango":          "mango tropical yellow",
  # ── Food - Japanese dishes ──
  "ramen_bowl":     "ramen noodle bowl soup japanese",
  "sushi_plate":    "sushi plate japanese food",
  "onigiri":        "onigiri rice ball japanese",
  "curry_rice":     "curry rice bowl japanese",
  "tempura":        "tempura fried japanese",
  "miso_soup":      "miso soup bowl japanese",
  "soba_noodle":    "soba buckwheat noodle",
  "takoyaki":       "takoyaki ball japanese street food",
  "bento_box":      "bento box japanese lunch",
  "yakiniku":       "yakiniku grilled meat bbq",
  # ── Food - Western/General ──
  "pizza_slice":    "pizza slice cheese pull",
  "hamburger":      "hamburger burger fast food",
  "pasta_plate":    "pasta plate italian",
  "sandwich":       "sandwich bread filling",
  "cake_birthday":  "birthday cake candles",
  "ice_cream_cone": "ice cream cone melting",
  "chocolate_dark": "chocolate dark broken pieces",
  "bread_loaf":     "bread loaf bakery fresh",
  "donut_sweet":    "donut glazed sweet",
  "cookie_baked":   "cookie baked sweet",
  # ── Drinks ──
  "milk_glass":     "milk glass white fresh",
  "coffee_cup":     "coffee cup steam morning",
  "green_tea":      "green tea japanese cup",
  "beer_glass":     "beer glass foam cold",
  "wine_glass":     "wine glass red elegant",
  "juice_glass":    "juice glass colorful fresh",
  "cola_drink":     "cola drink dark bubbles",
  # ── Animals - Common ──
  "cat_cute":       "cat cute close up face",
  "dog_happy":      "dog happy running playing",
  "rabbit_cute":    "rabbit white cute soft",
  "hamster":        "hamster cute small",
  "goldfish":       "goldfish red water bowl",
  "duck_pond":      "duck pond water swimming",
  "panda":          "panda bamboo black white",
  "koala":          "koala tree eucalyptus",
  "penguin_cute":   "penguin cute cold ice",
  # ── Clown/Horror ──
  "clown":          "clown makeup horror dark",
  "circus_dark":    "circus dark tent night",
  # ── Everyday Objects ──
  "smartphone_dark":"smartphone screen glowing dark",
  "wallet_empty":   "wallet empty leather",
  "umbrella_rain":  "umbrella rain street",
  "glasses_pair":   "glasses lens frame",
  "watch_clock":    "watch clock face elegant",
  "key_metal":      "old key metal rust",
  "briefcase_dark": "briefcase work office leather",
  "teddy_bear_old": "teddy bear worn old childhood",
  "toy_block":      "wooden toy blocks colorful child",
  "medicine_bottle":"medicine bottle pills dark",
  "knife_kitchen":  "kitchen knife sharp blade",
  "flower_bouquet": "flower bouquet colorful fresh",
  "balloon_sky":    "balloon colorful floating sky",
  "candle_flame":   "candle flame dark warm",
  "compass_old":    "compass old metal navigation",
  "hourglass_sand": "hourglass sand time vintage",
  "mirror_reflection":"mirror reflection dark mysterious",
  "locked_chest":   "locked chest old treasure",
  # ── Everyday Places ──
  "convenience_store_jp":"convenience store japan interior night",
  "supermarket_aisle":   "supermarket aisle products shelves",
  "japanese_school":     "japanese school building entrance",
  "hospital_corridor":   "hospital white corridor empty",
  "office_desk":         "office desk computer work",
  "park_nature":         "park bench nature autumn",
  "playground_empty":    "empty playground swing night",
  "cafe_interior":       "cafe interior warm morning light",
  "restaurant_dim":      "restaurant dim interior cozy",
  "cinema_empty":        "cinema empty seats dark screen",
  "arcade_jp":           "game arcade japan night lights",
  "onsen_steam":         "onsen hot spring steam traditional",
  "shrine_path":         "shinto shrine path stone lanterns",
  "temple_stone":        "buddhist temple stone steps",
  # ── Transportation ──
  "bicycle_road":        "bicycle road riding freedom",
  "motorcycle_speed":    "motorcycle road speed dark",
  "bus_interior":        "bus interior empty night",
  "taxi_night":          "taxi cab city night yellow",
  "bullet_train_jp":     "shinkansen bullet train speed",
  "airplane_interior":   "airplane window clouds view",
  "boat_sea":            "small boat sea alone",
  "hot_air_balloon_sky": "hot air balloon sky sunrise",
  # ── Nature ──
  "cherry_blossom_pink": "cherry blossom sakura pink falling",
  "autumn_leaves_red":   "autumn leaves red orange path",
  "winter_snow_quiet":   "snow quiet winter peaceful",
  "rainbow_sky":         "rainbow dramatic colorful sky",
  "full_moon_dark":      "full moon dark sky forest",
  "shooting_star_sky":   "shooting star night sky wish",
  "ocean_wave_big":      "ocean wave dramatic big",
  "river_peaceful":      "river peaceful nature flowing",
  # ── People/Social ──
  "family_portrait":     "family portrait smiling together",
  "elderly_couple":      "elderly couple hand in hand",
  "crying_woman":        "woman crying tears sadness",
  "laughing_child":      "child laughing happy joy",
  "argument_couple":     "couple arguing confrontation",
  "job_interview_room":  "job interview table formal suit",
  "graduation":          "graduation ceremony diploma stage",
  "wedding_church":      "wedding church aisle flowers",
  "dentist_chair_jp":    "dentist chair bright equipment",
  "surgery_close":       "surgery operating room close",

  # ── Misc Dream Scenarios ──
  "teleportation":  "teleportation light flash portal",
  "invisibility":   "invisible person outline ghost",
  "giant_small":    "giant small scale surreal dream",
  "mirror_infinite": "infinite mirror reflection corridor",
  "empty_city":     "empty abandoned city street",
  "underwater_city": "underwater city ruins fantasy",
  "floating_island": "floating island sky fantasy",
  "door_nowhere":   "door standing alone field nowhere",
  "endless_road":   "endless road horizon straight",
  "falling_upward": "falling upward sky surreal inverse",

  # ── More Professions ──
  "chef_cooking":   "chef cooking kitchen restaurant",
  "artist_painting":"artist painting studio canvas",
  "musician_stage": "musician playing instrument stage",
  "athlete_running":"athlete running track competition",
  "soldier_field":  "soldier military field uniform",
  "spy_dark":       "spy secret agent dark coat",
  "pirate_ship":    "pirate ship ocean adventure",
  "cowboy_horse":   "cowboy horse western sunset",
  "astronaut_moon": "astronaut moon surface space",
  "diver_underwater":"diver scuba underwater ocean",
  "boxer_ring":     "boxer ring fight gloves",
  "dancer_stage":   "dancer stage performance dramatic",
  "acrobat_circus": "acrobat circus aerial performer",
  "magician_stage": "magician stage illusion mysterious",
  "priest_church":  "priest church ceremony religious",
  "monk_temple":    "monk temple meditation peaceful",
  "hunter_forest":  "hunter forest dark bow arrow",
  "blacksmith":     "blacksmith forge fire medieval",
  "alchemist":      "alchemist laboratory potions bottles",

  # ── Social Situations ──
  "party_celebration":"party celebration people happy",
  "funeral_dark":   "funeral cemetery mourning black",
  "hospital_waiting":"hospital waiting room anxious",
  "first_day_school":"first day school child nervous",
  "lost_forest_path":"person lost forest dark path",
  "swimming_ocean": "person swimming ocean alone",
  "climbing_wall":  "person climbing rock wall",
  "prison_escape":  "prison escape dark dramatic",
  "storm_shelter":  "storm shelter hiding rain",
  "treasure_hunt":  "treasure hunt map adventure",
  "haunted_house_enter":"entering haunted house door",
  "elevator_stuck": "stuck elevator dark trapped",
  "quicksand_sink": "quicksand sinking trapped",
  "mirror_maze":    "mirror maze infinite reflection",
  "desert_walk":    "alone walking desert endless",

  # ── Emotions & States ──
  "euphoria":       "euphoria ecstasy bright light joy",
  "melancholy_rain":"melancholy alone rain window",
  "deja_vu":        "deja vu mysterious familiar place",
  "time_freeze":    "time frozen still dramatic",
  "invisibility_person":"transparent invisible person street",
  "flying_euphoria":"person arms spread flying happy",
  "falling_void":   "falling void darkness infinite",
  "being_watched":  "being watched surveillance dark",
  "trapped_glass":  "trapped inside glass cage",
  "running_slow":   "running slow motion stuck dream",

  # ── Abstract/Surreal Dream Concepts ──
  "upside_down_city":"upside down city surreal dream",
  "infinite_stairs":"infinite staircase looping escher",
  "melting_clock":  "melting clock Salvador Dali surreal",
  "giant_in_city":  "giant person tiny city scale",
  "underwater_room":"underwater room furniture surreal",
  "door_in_sky":    "door floating in the sky surreal",
  "path_disappears":"path road disappearing fog",
  "house_floating": "house floating sky clouds surreal",
  "eye_in_sky":     "giant eye watching sky dramatic",
  "teeth_falling_anim":"teeth falling out surreal dream",
  "shadow_moves":   "shadow moving independently wall",
  "water_everywhere":"water flooding slowly room",
  "faces_melting":  "face melting surreal dark",
  "garden_maze":    "garden hedge maze mysterious",
  "fog_city_dark":  "city fog dark mysterious empty",

  # ── Nature & Weather Extremes ──
  "ice_world":      "ice world frozen everything blue",
  "fire_world":     "world on fire apocalyptic red",
  "flood_rising":   "flood rising water street",
  "asteroid_sky":   "asteroid falling sky dramatic",
  "double_sun":     "two suns sky surreal",
  "blood_moon":     "blood moon red sky dark",
  "storm_sea_ship": "ship storm ocean waves dramatic",
  "tornado_path":   "tornado path destruction flat",
  "lava_river":     "lava river flowing volcanic",
  "glacier":        "glacier blue ice massive",
  "swamp_dark":     "dark swamp murky mysterious",
  "cliff_edge":     "cliff edge looking down dramatic",
  "waterfall_massive":"massive waterfall dramatic mist",
  "underwater_forest":"underwater sunken forest ethereal",

  # ── Objects & Symbols (Dreams) ──
  "red_door":       "red door alone mysterious",
  "broken_watch":   "broken watch stopped time",
  "floating_book":  "book floating open pages",
  "glowing_orb":    "glowing orb mysterious light",
  "ancient_map":    "ancient map treasure faded",
  "cracked_earth":  "earth ground cracked dry",
  "spinning_top":   "spinning top dreamlike wobble",
  "music_box":      "music box antique open",
  "empty_birdcage": "empty bird cage open door",
  "butterfly_dark": "dark butterfly wings spread",
  "red_thread":     "red thread fate connection",
  "broken_hourglass":"broken hourglass time spilled",
  "mask_face":      "mask lying floor mysterious",
  "child_toy_alone":"child toy abandoned floor dark",
  "snow_globe":     "snow globe magical shake",

  # ── Food - More Specific ──
  "steaming_bowl":  "steaming hot bowl food comfort",
  "birthday_cake_dark":"birthday cake candles dark room",
  "rotten_food":    "rotting food disgusting nightmare",
  "banquet_table":  "banquet table feast elaborate",
  "empty_plate":    "empty plate alone table sad",
  "forbidden_fruit":"forbidden fruit temptation apple",

  # ── Body & Health ──
  "falling_teeth_mouth":"open mouth losing teeth dream",
  "hair_falling":   "hair falling loss dramatic",
  "eye_opening":    "eye opening dramatic close up",
  "hand_reaching_dark":"hand reaching through dark",
  "reflection_different":"mirror reflection different person",
  "body_floating_water":"body floating water peaceful",
  "heartbeat_monitor":"heartbeat monitor hospital beeping",
  "bones_xray":     "skeleton xray dark medical",
  "scream_silent":  "person screaming silent dark",
  "paralyzed_bed":  "person paralyzed in bed unable to move",

  # ── Japanese Cultural ──
  "tanuki_forest":  "tanuki raccoon dog japanese forest",
  "kitsune_mask":   "kitsune fox mask japanese white",
  "yuki_onna":      "snowy night mysterious woman white",
  "oni_demon_red":  "oni demon red japanese scary",
  "samurai_battle": "samurai battle sword dramatic",
  "japanese_ghost": "japanese ghost white long hair dark",
  "festival_night": "japanese festival night lanterns",
  "torii_sunset":   "torii gate sunset red silhouette",
  "zen_garden":     "zen rock garden peaceful rake",
  "bonsai_tree":    "bonsai tree miniature peaceful",
  "paper_crane":    "origami paper crane folded white",
  "katana_drawn":   "katana drawn sword gleaming",

  # ── Technology & Modern ──
  "screen_many":    "many screens faces technology dark",
  "algorithm_visual":"algorithm code flowing abstract",
  "vr_headset":     "vr headset person virtual reality",
  "robot_eye":      "robot eye red glowing close",
  "keyboard_glow":  "keyboard glowing dark typing",
  "city_surveillance":"city cameras surveillance watching",
  "drone_eye":      "drone camera eye watching above",
  "nuclear_glow":   "nuclear glow ominous green",
  "broken_city":    "broken city ruins post apocalyptic",
  "future_ruins":   "future ruins overgrown technology",
}

def download_concepts():
    if not API_KEY:
        print("PEXELS_API_KEY が必要です"); return
    ok = skip = 0
    for slug, query in CONCEPT_QUERIES.items():
        out_path = os.path.join(OUT, f"concept_{slug}.jpg")
        if os.path.exists(out_path):
            continue
        # retry up to 5 times with exponential backoff on 429
        for attempt in range(5):
            try:
                img_url = pexels_photo(query)
                if not img_url:
                    print(f"!!  concept_{slug}: 画像なし"); skip += 1; break
                raw = download(img_url)
                with open(out_path, "wb") as f:
                    f.write(raw)
                print(f"OK  concept_{slug:20s} <- \"{query[:40]}\"  ({len(raw)//1024}KB)")
                ok += 1; time.sleep(1.2)
                break
            except Exception as e:
                if "429" in str(e):
                    wait = 20 * (2 ** attempt)
                    print(f"..  concept_{slug}: 429 wait {wait}s (attempt {attempt+1})")
                    time.sleep(wait)
                else:
                    print(f"!!  concept_{slug}: {e}"); skip += 1; break
        else:
            print(f"!!  concept_{slug}: max retries exceeded"); skip += 1
    print(f"\n取得 {ok} / スキップ {skip}")

if __name__ == "__main__":
    main()

