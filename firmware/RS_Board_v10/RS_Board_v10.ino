/*
  Rainbow Stick 基板プログラム  v1.0  (2026-11-16)
  基板 : ESP32 IoT開発ボード / モーター : RE-260RA-2670 ＋ フィルム（モーター1端子）
  スマホのアプリ（Bluetooth）、またはPCのブラウザ版（USB・Bluetooth）から振付データを受け取り、自分の時計で再生する。
  データは20msごとに1バイト（＋右 −左 0電気オフ）。

  v0.9 からの変更
    ・再生中に、曲の始まり（位置0）より前の時刻へ位置を直されると、再生が止まってしまう不具合を修正
      （ずれ調整のレバーを曲の始まり直後に動かした時など）。位置0になるまでモーターは電気オフで待つ。
    ・版の表示を v1.0 に。命令は v0.9 と同じなので、アプリ（0.3.x / 0.4.0）はそのまま使える。

  命令（Bluetooth・USB 共通）
    L＋長さ2バイト＋データ = 振付を受け取る → "OK 長さ 合計" / "NG"
    Y                      = すぐに最初から再生 → "PLAY"
    A＋時刻4バイト＋位置4バイト = 指定の時刻（基板の時計 ms）に、指定の位置（コマ）として再生 → "ARM"
    S                      = 止める → "STOP"
    T                      = 基板の時計を返す → "T 時刻"（スマホとの時計合わせ）
    V                      = 版と、前回の再起動の原因を返す → "READY v1.0 原因"
  再生が終わると "END"。Bluetoothが切れたら、安全のためモーターを止める。
  電源を入れても、命令を送るまで動かない。

  書き込みの設定 : ツール → Partition Scheme → 「Huge APP (3MB No OTA/1MB SPIFFS)」
*/
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include "freertos/FreeRTOS.h"
#include "freertos/stream_buffer.h"
#include "esp_system.h"

#define FW_VERSION   "v1.0"
#define SERVICE_UUID "6f5a0001-52b7-4c7e-9a34-1d2e3c4b5a60"
#define RX_UUID      "6f5a0002-52b7-4c7e-9a34-1d2e3c4b5a60"
#define TX_UUID      "6f5a0003-52b7-4c7e-9a34-1d2e3c4b5a60"

const int PIN_A = 14, PIN_B = 15, PIN_LED = 4;
const int MAX_DUTY = 60;        // 上限（約36%）
const int FRAME_MS = 20;
const int MAX_FRAMES = 30000;   // 10分
const unsigned long RX_TIMEOUT_MS = 3000;

int8_t data[MAX_FRAMES];
int nFrames = 0;
bool playing = false;
bool armed = false;             // 開始時刻を待っている
unsigned long t0 = 0;           // 位置0に当たる基板の時刻
unsigned long startAt = 0;
int curVal = 0;

StreamBufferHandle_t rxBuf;
BLECharacteristic* txChar = nullptr;
volatile bool bleConnected = false;
volatile bool bleLost = false;

// ---------- モーター ----------
void pwmOut(int pin, int d) { ledcWrite(pin, d); }

// slow方式 : A=1, B=反転PWM。0 は電気オフ（惰性）
void out(int v) {
  v = constrain(v, -MAX_DUTY, MAX_DUTY);
  if (v > 0)      { pwmOut(PIN_A, 255); pwmOut(PIN_B, 255 - v); }
  else if (v < 0) { pwmOut(PIN_B, 255); pwmOut(PIN_A, 255 + v); }
  else            { pwmOut(PIN_A, 0);   pwmOut(PIN_B, 0); }
  curVal = v;
  digitalWrite(PIN_LED, v != 0);
}

void stopAll() { playing = false; armed = false; out(0); }

// ---------- 返事（USBとBluetoothの両方へ） ----------
void say(const char* s) {
  Serial.println(s);
  if (bleConnected && txChar) {
    txChar->setValue((uint8_t*)s, strlen(s));
    txChar->notify();
  }
}

const char* resetReason() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:  return "POWERON";
    case ESP_RST_SW:       return "SOFTWARE";
    case ESP_RST_PANIC:    return "PANIC";
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT:      return "WATCHDOG";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_EXT:      return "RESET";
    default:               return "OTHER";
  }
}

// ---------- 命令の読み取り（USBとBluetoothで共通） ----------
enum { ST_CMD, ST_LEN, ST_DATA, ST_ARGS };
int st = ST_CMD, got = 0, want = 0;
uint8_t hdr[8];
unsigned long lastRx = 0;

void feed(uint8_t c) {
  lastRx = millis();
  char line[40];
  switch (st) {
    case ST_CMD:
      if (c == 'L') { stopAll(); nFrames = 0; st = ST_LEN; got = 0; }
      else if (c == 'A') { st = ST_ARGS; got = 0; }
      else if (c == 'Y') {
        if (nFrames > 0) { t0 = millis(); armed = false; playing = true; say("PLAY"); }
      } else if (c == 'S') { stopAll(); say("STOP"); }
      else if (c == 'T') { snprintf(line, sizeof line, "T %lu", millis()); say(line); }
      else if (c == 'V') { snprintf(line, sizeof line, "READY " FW_VERSION " %s", resetReason()); say(line); }
      break;
    case ST_LEN:
      hdr[got++] = c;
      if (got == 2) {
        want = hdr[0] | (hdr[1] << 8);
        got = 0;
        if (want > 0 && want <= MAX_FRAMES) st = ST_DATA;
        else { st = ST_CMD; say("NG"); }
      }
      break;
    case ST_DATA:
      data[got++] = (int8_t)c;
      if (got == want) {
        nFrames = want;
        long sum = 0;
        for (int i = 0; i < want; i++) sum += (uint8_t)data[i];
        snprintf(line, sizeof line, "OK %d %ld", want, sum);
        st = ST_CMD;
        say(line);
      }
      break;
    case ST_ARGS:
      hdr[got++] = c;
      if (got == 8) {
        unsigned long at = hdr[0] | (hdr[1] << 8) | (hdr[2] << 16) | ((unsigned long)hdr[3] << 24);
        unsigned long fr = hdr[4] | (hdr[5] << 8) | (hdr[6] << 16) | ((unsigned long)hdr[7] << 24);
        st = ST_CMD;
        if (nFrames > 0) {
          t0 = at - fr * FRAME_MS;
          startAt = at;
          if (!playing) armed = true;   // 再生中に送られたら、位置だけを直す（ずれ調整）
          say("ARM");
        } else say("NG");
      }
      break;
  }
}

// ---------- Bluetooth ----------
class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    size_t n = c->getLength();
    if (n > 0) xStreamBufferSend(rxBuf, c->getData(), n, pdMS_TO_TICKS(200));
  }
};

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { bleConnected = true; }
  void onDisconnect(BLEServer*) override { bleConnected = false; bleLost = true; }
};

void setup() {
  Serial.setRxBufferSize(4096);
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  ledcAttach(PIN_A, 20000, 8);
  ledcAttach(PIN_B, 20000, 8);
  out(0);
  rxBuf = xStreamBufferCreate(4096, 1);

  BLEDevice::init("RainbowStick");
  BLEDevice::setMTU(517);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* svc = server->createService(SERVICE_UUID);
  BLECharacteristic* rx = svc->createCharacteristic(RX_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCallbacks());
  txChar = svc->createCharacteristic(TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());
  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();

  delay(300);
  char line[40];
  snprintf(line, sizeof line, "READY " FW_VERSION " %s", resetReason());
  say(line);
}

void loop() {
  // 受け取った命令を読む
  while (Serial.available()) feed(Serial.read());
  static uint8_t chunk[256];
  size_t n;
  while ((n = xStreamBufferReceive(rxBuf, chunk, sizeof chunk, 0)) > 0) {
    for (size_t i = 0; i < n; i++) feed(chunk[i]);
  }
  // データの途中で途切れたら、受け取りをやめて最初に戻す
  if (st != ST_CMD && millis() - lastRx > RX_TIMEOUT_MS) { st = ST_CMD; say("NG"); }

  // Bluetoothが切れたら止めて、また接続を待つ
  if (bleLost) {
    bleLost = false;
    stopAll();
    st = ST_CMD;
    delay(100);
    BLEDevice::startAdvertising();
    Serial.println("BLE LOST");
  }

  // 開始時刻を待つ
  if (armed && (long)(millis() - startAt) >= 0) {
    armed = false;
    playing = true;
    say("PLAY");
  }

  // 再生
  if (playing) {
    long dt = (long)(millis() - t0);    // 位置0からの時間（位置を直した直後は、まだ0より前のことがある）
    if (dt < 0) {
      if (curVal != 0) out(0);          // v1.0：位置0になるまで電気オフで待つ（v0.9 はここで止まっていた）
    } else {
      unsigned long i = (unsigned long)dt / FRAME_MS;
      if (i >= (unsigned long)nFrames) { stopAll(); say("END"); }
      else {
        int v = data[i];
        if (v != curVal) {
          if ((v > 0 && curVal < 0) || (v < 0 && curVal > 0)) out(0);  // 向きが急に変わるときは一度切る
          else out(v);
        }
      }
    }
  }
}
