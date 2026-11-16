/* Rainbow Stick 基板との接続（Bluetooth）
   基板プログラム v0.9 の命令を送る。振付の転送、時計合わせ、時刻を指定したスタート。 */
(function (root) {
  'use strict';
  var SERVICE = '6f5a0001-52b7-4c7e-9a34-1d2e3c4b5a60', RX = '6f5a0002-52b7-4c7e-9a34-1d2e3c4b5a60', TX = '6f5a0003-52b7-4c7e-9a34-1d2e3c4b5a60';
  var KEY_DEV = 'rs.board.id', KEY_MODE = 'rs.board.mode';

  // スマホのアプリ：Capacitor の Bluetooth 部品。PCのブラウザ：weblink.js（Bluetooth または USB）
  function nativeBle() { return root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform() && root.Capacitor.Plugins && root.Capacitor.Plugins.BluetoothLe; }
  function ble() { return nativeBle() || (B.mode === 'usb' ? root.RSWebSerial : root.RSWebBle); }
  function hex(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16); return s; }
  function unhex(s) { var o = ''; s = String(s || '').replace(/\s/g, ''); for (var i = 0; i + 1 < s.length; i += 2) o += String.fromCharCode(parseInt(s.substr(i, 2), 16)); return o; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function getId() { try { return localStorage.getItem(KEY_DEV); } catch (e) { return null; } }
  function setId(v) { try { localStorage.setItem(KEY_DEV, v); } catch (e) { } }

  var B = {
    state: 'off',          // off 未接続 / busy つないでいる / on 接続中
    mode: 'ble',           // ble Bluetooth / usb USBケーブル（PCのみ）
    native: function () { return !!nativeBle(); },
    canBle: function () { return !!(nativeBle() || root.RSWebBle); },
    canUsb: function () { return !nativeBle() && !!root.RSWebSerial; },
    available: function () { return this.canBle() || this.canUsb(); },
    lastMode: function () { try { return localStorage.getItem(KEY_MODE) || ''; } catch (e) { return ''; } },
    linkName: function () { return this.mode === 'usb' ? 'USB' : 'Bluetooth'; },
    deviceId: null, version: '', reason: '', loadedKey: null, clockOffset: null, rtt: null, mtu: 23,
    onState: function () { }, onLine: function () { }, onLog: function () { },
    _lines: [], _inited: false, _listeners: [],

    _set: function (st, msg) { this.state = st; this.onState(st, msg); },
    _log: function (m) { this.onLog(m); },

    _init: async function () {
      if (this._inited) return;
      var P = ble();
      if (!P) throw new Error(this.mode === 'usb' ? 'このブラウザではUSBを使えません。Chrome または Edge で開いてください' : 'このブラウザではBluetoothを使えません。Chrome または Edge で開いてください');
      await P.initialize({ androidNeverForLocation: true });
      if (nativeBle()) this._inited = true;
    },

    // 初めて：一覧から基板を選ぶ。2回目以降：覚えている基板へ
    // mode：PCのブラウザで 'usb' か 'ble' を選ぶ（スマホのアプリでは使わない）
    // auto：画面を開いた時などの自動接続（PCのブラウザでは、選ぶ画面を出せないので、覚えている基板だけにつなぐ）
    connect: async function (pick, mode, auto) {
      if (this.state === 'on' || this.state === 'busy') return;
      if (!nativeBle() && mode) this.mode = mode;
      if (nativeBle()) this.mode = 'ble';
      this._set('busy', this.mode === 'usb' ? 'USBの基板を探しています…' : '基板を探しています…');
      try {
        await this._init();
        var P = ble();
        var en = await P.isEnabled();
        if (en && en.value === false) throw new Error(nativeBle() ? 'スマホのBluetoothがオフです。オンにしてください' : 'このPCのBluetoothがオフか、ありません。オンにするか、USBケーブルでつないでください');
        var id = pick ? null : (this.mode === 'usb' ? 'usb' : getId());
        if (id && P.knows && !(await P.knows(id))) { if (auto) throw new Error('Device not found'); id = null; }
        if (!id) { var d = await P.requestDevice({ services: [SERVICE], optionalServices: [] }); id = d.deviceId; }
        await this._open(id);
        if (this.mode !== 'usb') setId(id);
        try { if (!nativeBle()) localStorage.setItem(KEY_MODE, this.mode); } catch (e) { }
        var how = nativeBle() ? '' : (this.mode === 'usb' ? 'USBで' : 'Bluetoothで');
        this._set('on', this.version ? how + '基板につながりました（' + this.version + '）' : how + '基板につながりました');
        return true;
      } catch (e) {
        this._closeListeners();
        this.deviceId = null;
        this._set('off', this._why(e));
        return false;
      }
    },

    _why: function (e) {
      var m = (e && e.message) || String(e);
      if (/cancel|No port selected/i.test(m)) return '基板を選ぶのをやめました';
      if (/^USB_OPEN/.test(m)) return 'USBのポートを開けません。Arduino IDE のシリアルモニタなど、ほかの画面が基板を使っていないか確かめてください';
      if (/not found/i.test(m) && !nativeBle()) return this.mode === 'usb' ? 'USBの基板が見つかりません。ケーブルをつないで「USBでつなぐ」を押してください' : '基板が見つかりません。「Bluetoothでつなぐ」を押して選んでください';
      if (/timeout|timed out|not found|Connection/i.test(m)) return '基板が見つかりません。基板の電源と、近くにあるかを確かめてください';
      if (/permission/i.test(m)) return 'Bluetoothの許可が必要です。スマホの設定でこのアプリに許可してください';
      return m;
    },

    _open: async function (id) {
      var P = ble(), self = this;
      this._closeListeners();
      var l1 = await P.addListener('disconnected|' + id, function () { self._onLost(); });
      var l2 = await P.addListener('notification|' + id + '|' + SERVICE + '|' + TX, function (ev) { self._onData(ev && ev.value); });
      this._listeners = [l1, l2];
      await P.connect({ deviceId: id, timeout: 8000 });
      this.deviceId = id;
      await P.startNotifications({ deviceId: id, service: SERVICE, characteristic: TX });
      try { await P.requestConnectionPriority({ deviceId: id, connectionPriority: 1 }); } catch (e) { }
      await sleep(300);    // 通信の大きさ（MTU）が決まるのを待つ
      try { var m = await P.getMtu({ deviceId: id }); if (m && m.value) this.mtu = m.value; } catch (e) { this.mtu = 23; }
      this.loadedKey = null;
      this.clockOffset = null;
      this.version = ''; this.reason = '';
      this._lines = [];
      // USBは、つないだ時に基板が再起動することがあるので、何回か聞き直す
      var line = null, tries = this.mode === 'usb' && !nativeBle() ? 4 : 1;
      for (var k = 0; k < tries && !line; k++) {
        await this._send([86]);   // V
        try { line = await this.waitLine('READY', k ? 1500 : 2000); } catch (e) { }
      }
      if (!line) throw new Error('基板から返事がありません。基板プログラムが v0.9 か確かめてください');
      var p = line.split(' ');
      this.version = p[1] || ''; this.reason = p[2] || '';
      this._log('接続 ' + this.version + '（前回の起動の原因：' + this.reasonText() + '）');
    },

    reasonText: function () {
      return { POWERON: '電源を入れた', RESET: 'リセットボタン', BROWNOUT: '電圧の低下', WATCHDOG: 'プログラムの停止', PANIC: 'プログラムの異常', SOFTWARE: '再起動命令', OTHER: 'その他' }[this.reason] || this.reason || '不明';
    },

    disconnect: async function () {
      var id = this.deviceId;
      if (!id) return;
      this.deviceId = null;
      try { await ble().disconnect({ deviceId: id }); } catch (e) { }
      this._closeListeners();
      this._set('off', '基板との接続を切りました');
    },

    _closeListeners: function () { this._listeners.forEach(function (l) { try { l.remove(); } catch (e) { } }); this._listeners = []; },

    _onLost: function () {
      if (!this.deviceId) return;     // 自分で切った時
      this.deviceId = null; this.loadedKey = null; this.clockOffset = null;
      this._closeListeners();
      this._log(this.linkName() + 'が切れました');
      this._set('off', this.linkName() + 'が切れました');
      if (this.onLost) this.onLost();
    },

    _onData: function (val) {
      var text = unhex(val).trim();
      if (!text) return;
      if (text.charAt(0) === 'T' && this._pingWait) { var f = this._pingWait; this._pingWait = null; f(text); return; }
      this._lines.push(text);
      if (this._lines.length > 50) this._lines.shift();
      this.onLine(text);
    },

    waitLine: function (prefix, ms) {
      var self = this, t0 = performance.now();
      return new Promise(function (ok, ng) {
        (function f() {
          for (var i = 0; i < self._lines.length; i++) if (self._lines[i].indexOf(prefix) === 0) { ok(self._lines.splice(i, 1)[0]); return; }
          if (performance.now() - t0 > ms) { ng(new Error('基板の応答がありません')); return; }
          setTimeout(f, 5);
        })();
      });
    },

    // 順番を守って送る
    _q: Promise.resolve(),
    _send: function (bytes, noResponse) {
      var self = this, u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      var run = function () {
        if (!self.deviceId) throw new Error('基板につながっていません');
        var o = { deviceId: self.deviceId, service: SERVICE, characteristic: RX, value: hex(u8) };
        return noResponse ? ble().writeWithoutResponse(o) : ble().write(o);
      };
      var p = this._q.then(run, run);
      this._q = p.catch(function () { });
      return p;
    },

    // 振付を送る。key が同じなら送り直さない
    load: async function (cmd, key, onProg) {
      if (key && key === this.loadedKey) return false;
      var n = cmd.length, u8 = new Uint8Array(cmd.buffer, cmd.byteOffset, n), sum = 0, i;
      for (i = 0; i < n; i++) sum += u8[i];
      for (var attempt = 0; attempt < 3; attempt++) {
        var size = this.mode === 'usb' && !nativeBle() ? 512 : Math.max(20, Math.min(this.mtu - 3, 244));
        this.loadedKey = null;
        this._lines = [];
        try {
          await this._send([76, n & 255, n >> 8]);
          for (i = 0; i < n; i += size) {
            await this._send(u8.subarray(i, Math.min(i + size, n)));
            if (onProg) onProg(Math.min(1, (i + size) / n));
          }
          var line = await this.waitLine('OK', 3000), p = line.split(' ');
          if (+p[1] === n && +p[2] === sum) { this.loadedKey = key || 'x'; this._log('振付を転送しました（' + n + 'コマ）'); return true; }
          this._log('転送の確認が合いません（' + line + '）');
        } catch (e) {
          if (!this.deviceId) throw e;
          if (this.mtu > 23 && this.mode !== 'usb') this.mtu = 23;   // 大きいまとまりで送れない時は、小さくして送り直す
          this._log('転送をやり直します：' + e.message);
          await sleep(3200);   // 基板が途中のデータを捨てるのを待つ（基板は3秒で受け取りをやめる）
        }
      }
      throw new Error('振付を基板へ送れませんでした');
    },

    // 時計合わせ：往復が一番短かった時の値を使う
    syncClock: async function () {
      var P = this, best = 1e9, off = null;
      for (var i = 0; i < 8; i++) {
        var t0 = performance.now();
        var line = await new Promise(function (ok, ng) {
          var to = setTimeout(function () { P._pingWait = null; ng(new Error('基板の応答がありません')); }, 1000);
          P._pingWait = function (x) { clearTimeout(to); ok(x); };
          P._send([84], true).catch(ng);
        });
        var t1 = performance.now(), rtt = t1 - t0, ms = +line.split(' ')[1];
        if (rtt < best) { best = rtt; off = ms - (t0 + t1) / 2; }
        await sleep(15);
      }
      this.clockOffset = off; this.rtt = best;
      return { offset: off, rtt: best };
    },

    // スマホの時刻（performance.now）で startPerf の時に、振付の frame コマ目として動き出す
    startAt: async function (startPerf, frame) {
      var at = Math.round(startPerf + this.clockOffset) >>> 0, f = frame >>> 0;
      this._lines = this._lines.filter(function (x) { return x.indexOf('ARM') !== 0; });
      await this._send([65, at & 255, (at >>> 8) & 255, (at >>> 16) & 255, at >>> 24, f & 255, (f >>> 8) & 255, (f >>> 16) & 255, f >>> 24]);
      await this.waitLine('ARM', 1500);
    },

    // 振付を送らずに少しだけ動かす（確認用）。転送済みの振付は上書きされる
    testRun: async function (cmd) {
      await this.load(cmd, null);
      this.loadedKey = null;
      await this._send([89]);
    },

    stop: function () { if (this.state === 'on') return this._send([83]).catch(function () { }); return Promise.resolve(); }
  };

  root.RSBoard = B;
})(typeof window !== 'undefined' ? window : globalThis);
