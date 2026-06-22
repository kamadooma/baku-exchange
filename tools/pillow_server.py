#!/usr/bin/env python3
"""Dream Dock 円形モニター中継サーバー
iPadのWebアプリからPOSTされた画像URLを受け取り、
ESP32がポーリングできるよう /current として配信する。

使い方:
  python3 tools/pillow_server.py

ESP32からのアクセス:
  GET http://<MacのIP>:8765/current  → 最新の夢の画像(JPEG)
  GET http://<MacのIP>:8765/current.json → URL・タイムスタンプ(デバッグ用)
"""
import http.server, json, os, time, urllib.request, threading

PORT = 8765
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = os.path.join(ROOT, "build", "current_dream.jpg")
os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)

state = {"url": None, "ts": 0}
lock = threading.Lock()

UA = "DreamDock/1.0"

def download_image(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    data = urllib.request.urlopen(req, timeout=15).read()
    with open(OUT_PATH, "wb") as f:
        f.write(data)
    print(f"[pillow] saved {len(data)//1024}KB → {OUT_PATH}")

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # ログ抑制

    def do_OPTIONS(self):
        self._cors(); self.end_headers()

    def _cors(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    def do_POST(self):
        if self.path != "/dream":
            self.send_response(404); self.end_headers(); return
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
            url = data.get("url", "")
            if url:
                with lock:
                    state["url"] = url
                    state["ts"] = time.time()
                threading.Thread(target=download_image, args=(url,), daemon=True).start()
        except Exception as e:
            print(f"[pillow] POST error: {e}")
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def do_GET(self):
        if self.path in ("/current", "/current.jpg"):
            if os.path.exists(OUT_PATH):
                data = open(OUT_PATH, "rb").read()
                self.send_response(200)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(204); self.end_headers()
        elif self.path == "/current.json":
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            with lock:
                self.wfile.write(json.dumps(state).encode())
        else:
            self.send_response(404); self.end_headers()

if __name__ == "__main__":
    import socket
    ip = socket.gethostbyname(socket.gethostname())
    print(f"[pillow] サーバー起動 http://localhost:{PORT}")
    print(f"[pillow] ESP32からのアクセス: http://{ip}:{PORT}/current")
    print(f"[pillow] 停止: Ctrl+C")
    http.server.HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
