#!/usr/bin/env python3
"""Dream Dock 円形モニター中継サーバー
iPadのWebアプリからPOSTされた夢データを受け取り、
ESP32がポーリングできるよう /current と /dreams として配信する。
Claude APIで夢の内容を分析して最適な画像キーワードを返す /analyze エンドポイントも提供。

使い方:
  export ANTHROPIC_API_KEY=your_key
  python3 tools/pillow_server.py

ESP32からのアクセス:
  GET  http://<MacのIP>:8765/current   → 最新の夢の画像(JPEG)
  GET  http://<MacのIP>:8765/dreams    → 全夢リスト(JSON)
  POST http://<MacのIP>:8765/analyze   → 夢の内容をClaude APIで分析
"""
import http.server, json, os, time, urllib.request, urllib.error, threading

PORT = 8765
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
OUT_IMG  = os.path.join(BUILD, "current_dream.jpg")
OUT_LIST = os.path.join(BUILD, "dreams.json")
os.makedirs(BUILD, exist_ok=True)

current = {"url": None, "ts": 0, "name": "", "transcript": "", "price": 0}
lock = threading.Lock()
UA = "DreamDock/1.0"
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# 151銘柄のティッカーリスト（Claudeに渡す用）
TICKERS_SUMMARY = """
FLY=空を飛ぶ夢, TEETH=歯が抜ける, FALL=落下する, CHASE=追われる, NAKED=裸で人前に, EXAM=試験に遅刻/失敗,
FUNRL=葬式/死の夢, MUTE=声が出ない, LOOP=繰り返す夢, DROWN=溺れる, DEAD=亡くなった人と話す,
LOVE=恋愛/キス, SEX=性的な夢, PARENT=親に認められたい, CHILD=子どもに戻る/子ども,
SOUL=運命の人, FRND=真の親友, ALONE=孤独, TRVL=世界旅行, MARS=宇宙/火星,
JACK=宝くじ/大金, HOME=理想の家, HOME2=故郷/村, OSHI=推し活, SLEEP=もっと眠りたい,
CURE=病気が治る, NUKE=核戦争/爆発, NOWAR=戦争のない世界, ROBOT=ロボット/AI,
QUAKE=地震/災害, ARMAG=世界の終わり, SELF=本当の自分, FREE=自由/鳥,
CALM=瞑想/穏やか, LOVE=恋愛, FAME=有名になる, YOUTH=永遠の若さ, BODY=理想の体,
QUITJOB=仕事を辞める, DEBT=借金, REVENGE=復讐, ANIMAL=動物と話す, REBORN=生まれ変わり,
SUMMER=終わらない夏, SKYFALL=空が落ちてくる, SUNKCITY=都市が水没, FORGETEX=元恋人を忘れたい,
CUTE=可愛くなりたい, SINGER=歌手になりたい, BALLER=スポーツ選手, ASTRO=宇宙飛行士,
EDEN=楽園/天国, UTOPIA=ユートピア, TIME=タイムトラベル, REUNI=大切な人との再会
"""

def analyze_dream(transcript):
    """Claude APIで夢の内容を分析し、最適なティッカーとPexels検索キーワードを返す"""
    if not ANTHROPIC_KEY:
        return None
    prompt = f"""あなたはDream Dockという夢の取引所のAIアナリストです。
体験者が話した夢の内容を分析して、以下のJSON形式で回答してください。

夢の内容:
{transcript}

利用可能な銘柄（ティッカー=テーマ）:
{TICKERS_SUMMARY}

回答形式（JSONのみ、説明不要）:
{{
  "ticker": "最も一致する銘柄のティッカーコード（なければnull）",
  "keywords_en": "Pexels画像検索用の英語キーワード（3-6語）",
  "category": "nightmare/hope/mundane/ideology/oneiric のいずれか",
  "summary_jp": "夢の内容の一言要約（日本語・10字以内）"
}}"""

    try:
        body = json.dumps({
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 256,
            "messages": [{"role": "user", "content": prompt}]
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            headers={
                "x-api-key": ANTHROPIC_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
        )
        resp = json.load(urllib.request.urlopen(req, timeout=15))
        text = resp["content"][0]["text"].strip()
        # JSONを抽出
        start = text.find("{"); end = text.rfind("}") + 1
        return json.loads(text[start:end])
    except Exception as e:
        print(f"[pillow] Claude analyze error: {e}")
        return None

def download_image(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        data = urllib.request.urlopen(req, timeout=15).read()
        with open(OUT_IMG, "wb") as f:
            f.write(data)
        print(f"[pillow] image saved {len(data)//1024}KB")
    except Exception as e:
        print(f"[pillow] image download error: {e}")

def save_dream(data):
    dreams = []
    try:
        with open(OUT_LIST, encoding="utf-8") as f:
            dreams = json.load(f)
    except Exception:
        pass
    dreams.insert(0, data)
    dreams = dreams[:200]  # 最大200件
    with open(OUT_LIST, "w", encoding="utf-8") as f:
        json.dump(dreams, f, ensure_ascii=False, indent=2)
    print(f"[pillow] dream saved: {data.get('name', '?')} — {data.get('price', '?')} BAKU")

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): pass

    def _cors(self, status=200):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    def do_OPTIONS(self):
        self._cors(); self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        if self.path == "/analyze":
            try:
                data = json.loads(body)
                result = analyze_dream(data.get("transcript", ""))
                if result is None:
                    result = {"ticker": None, "keywords_en": "dream surreal abstract", "category": "oneiric", "summary_jp": "不明な夢"}
            except Exception as e:
                print(f"[pillow] analyze error: {e}")
                result = {"ticker": None, "keywords_en": "dream surreal", "category": "oneiric", "summary_jp": "不明な夢"}
            resp = json.dumps(result, ensure_ascii=False).encode("utf-8")
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            return

        if self.path != "/dream":
            self.send_response(404); self.end_headers(); return
        try:
            data = json.loads(body)
            url = data.get("url", "")
            if url:
                entry = {
                    "url": url,
                    "name": data.get("name", ""),
                    "transcript": data.get("transcript", ""),
                    "price": data.get("price", 0),
                    "ts": time.time(),
                }
                with lock:
                    current.update(entry)
                threading.Thread(target=download_image, args=(url,), daemon=True).start()
                threading.Thread(target=save_dream, args=(entry,), daemon=True).start()
        except Exception as e:
            print(f"[pillow] POST error: {e}")
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def do_GET(self):
        if self.path in ("/current", "/current.jpg"):
            if os.path.exists(OUT_IMG):
                img = open(OUT_IMG, "rb").read()
                self._cors()
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(img)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(img)
            else:
                self.send_response(204); self.end_headers()

        elif self.path == "/dreams":
            dreams = []
            if os.path.exists(OUT_LIST):
                try:
                    with open(OUT_LIST, encoding="utf-8") as f:
                        dreams = json.load(f)
                except Exception:
                    pass
            body = json.dumps(dreams, ensure_ascii=False).encode("utf-8")
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(body)

        elif self.path == "/status":
            with lock:
                body = json.dumps(current, ensure_ascii=False).encode("utf-8")
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        else:
            self.send_response(404); self.end_headers()

if __name__ == "__main__":
    import socket
    try:
        ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        ip = "localhost"
    print(f"[pillow] サーバー起動 http://localhost:{PORT}")
    print(f"[pillow] ESP32アクセス: http://{ip}:{PORT}/current")
    print(f"[pillow] 夢リスト:     http://{ip}:{PORT}/dreams")
    print(f"[pillow] 停止: Ctrl+C")
    http.server.HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
