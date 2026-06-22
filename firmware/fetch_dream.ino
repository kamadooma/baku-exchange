// Dream Dock — 円形モニター 夢ポーリング
// MacのIPとポートを設定して firmware に組み込む
// GET http://MAC_IP:8765/current → 最新の夢の画像(JPEG)を取得して表示

#include <WiFi.h>
#include <HTTPClient.h>
#include <JPEGDEC.h>

const char* SSID     = "YOUR_WIFI_SSID";
const char* PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER   = "http://192.168.x.x:8765/current"; // MacのIPに変更

// JPEG デコードコールバック（既存のGFXライブラリに合わせる）
JPEGDEC jpeg;
// ... (既存のdrawPixelコールバックを流用)

unsigned long lastCheck = 0;
const unsigned long INTERVAL = 3000; // 3秒ごとにポーリング
String lastEtag = "";

void fetchAndDisplay() {
  HTTPClient http;
  http.begin(SERVER);
  http.addHeader("Cache-Control", "no-cache");
  int code = http.GET();
  if (code == 200) {
    int len = http.getSize();
    if (len > 0) {
      uint8_t* buf = (uint8_t*)malloc(len);
      if (buf) {
        WiFiClient* stream = http.getStreamPtr();
        stream->readBytes(buf, len);
        // JPEGデコードして表示
        if (jpeg.openRAM(buf, len, drawPixelCallback)) {
          jpeg.decode(0, 0, 0);
          jpeg.close();
        }
        free(buf);
      }
    }
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(SSID, PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  Serial.println("WiFi connected: " + WiFi.localIP().toString());
  // 既存のLCD初期化コードをここで呼ぶ
}

void loop() {
  if (millis() - lastCheck >= INTERVAL) {
    lastCheck = millis();
    if (WiFi.status() == WL_CONNECTED) fetchAndDisplay();
  }
}
