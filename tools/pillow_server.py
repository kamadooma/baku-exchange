#!/usr/bin/env python3
"""Dream Dock 円形モニター中継サーバー
iPadのWebアプリからPOSTされた夢データを受け取り、
ESP32がポーリングできるよう /current と /dreams として配信する。

使い方:
  python3 tools/pillow_server.py

ESP32からのアクセス:
  GET http://<MacのIP>:8765/current     → 最新の夢の画像(JPEG)
  GET http://<MacのIP>:8765/dreams      → 全夢リスト(JSON)
  GET http://<MacのIP>:8765/status      → ステータス確認
"""
import http.server, json, os, time, urllib.request, threading

PORT = 8765
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
OUT_IMG  = os.path.join(BUILD, "current_dream.jpg")
OUT_LIST = os.path.join(BUILD, "dreams.json")
os.makedirs(BUILD, exist_ok=True)

current = {"url": None, "ts": 0, "name": "", "transcript": "", "price": 0}
lock = threading.Lock()
UA = "DreamDock/1.0"

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
        if self.path != "/dream":
            self.send_response(404); self.end_headers(); return
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
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
