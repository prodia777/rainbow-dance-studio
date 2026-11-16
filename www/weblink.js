/* Rainbow Stick 基板との接続（PCのブラウザ用：Chrome / Edge）
   スマホのアプリで使っている Bluetooth の部品（BluetoothLe）と同じ形で使えるようにする。
   ・RSWebBle    … PC内蔵の Bluetooth（Web Bluetooth）
   ・RSWebSerial … USBケーブル（Web Serial）。基板プログラム v0.9 はUSBでも同じ命令を受ける
   スマホのアプリ（Capacitor）の中では使わない。 */
(function (root) {
  'use strict';
  var nav = root.navigator || {};

  function fromHex(s) { s = String(s || '').replace(/\s/g, ''); var u = new Uint8Array(s.length >> 1); for (var i = 0; i < u.length; i++) u[i] = parseInt(s.substr(i * 2, 2), 16); return u; }
  function toHex(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16); return s; }
  function strHex(str) { return toHex(new TextEncoder().encode(str)); }

  // 'disconnected|id' や 'notification|id|service|char' の登録を受け持つ
  function Listeners() { this.map = {}; }
  Listeners.prototype.add = function (name, fn) {
    var m = this.map; (m[name] = m[name] || []).push(fn);
    return Promise.resolve({ remove: function () { var a = m[name] || []; var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } });
  };
  Listeners.prototype.emit = function (prefix, ev) {
    var m = this.map; Object.keys(m).forEach(function (k) { if (k.indexOf(prefix) === 0) m[k].slice().forEach(function (f) { try { f(ev); } catch (e) { } }); });
  };

  // ================= Bluetooth（Web Bluetooth） =================
  function makeBle() {
    if (!nav.bluetooth) return null;
    var L = new Listeners(), devs = {}, chars = {};
    function dropChars(id) { Object.keys(chars).forEach(function (k) { if (k.indexOf(id + '|') === 0) delete chars[k]; }); }
    var P = {
      kind: 'ble',
      initialize: function () { return Promise.resolve(); },
      isEnabled: async function () { try { return { value: await nav.bluetooth.getAvailability() }; } catch (e) { return { value: true }; } },
      // このページで一度選んだ基板（または、ブラウザが覚えている基板）なら、選び直さずにつなげる
      knows: async function (id) {
        if (!id) return false;
        if (devs[id]) return true;
        try {
          if (nav.bluetooth.getDevices) { var a = await nav.bluetooth.getDevices(); for (var i = 0; i < a.length; i++) { devs[a[i].id] = a[i]; } return !!devs[id]; }
        } catch (e) { }
        return false;
      },
      requestDevice: async function (o) {
        var d = await nav.bluetooth.requestDevice({ filters: [{ services: o.services }], optionalServices: o.optionalServices || [] });
        devs[d.id] = d;
        return { deviceId: d.id, name: d.name };
      },
      connect: async function (o) {
        var d = devs[o.deviceId];
        if (!d && !(await P.knows(o.deviceId))) throw new Error('Device not found');
        d = devs[o.deviceId];
        if (!d._rsHooked) { d._rsHooked = true; d.addEventListener('gattserverdisconnected', function () { dropChars(d.id); L.emit('disconnected|' + d.id, {}); }); }
        dropChars(d.id);
        var to = o.timeout || 10000, timer;
        try {
          await Promise.race([d.gatt.connect(), new Promise(function (ok, ng) { timer = setTimeout(function () { ng(new Error('Connection timeout')); }, to); })]);
        } finally { clearTimeout(timer); }
      },
      _char: async function (id, service, characteristic) {
        var k = id + '|' + service + '|' + characteristic;
        var d = devs[id];
        if (chars[k] && d.gatt.connected) return chars[k];
        var svc = await d.gatt.getPrimaryService(service);
        return (chars[k] = await svc.getCharacteristic(characteristic));
      },
      startNotifications: async function (o) {
        var c = await P._char(o.deviceId, o.service, o.characteristic), key = 'notification|' + o.deviceId + '|' + o.service + '|' + o.characteristic;
        if (!c._rsHooked) {
          c._rsHooked = true;
          c.addEventListener('characteristicvaluechanged', function (ev) {
            var v = ev.target.value; L.emit(key, { value: toHex(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) });
          });
        }
        await c.startNotifications();
      },
      // Web Bluetooth では通信の大きさ（MTU）を読めない。大きめで送り、送れなければ board.js が小さくして送り直す
      getMtu: function () { return Promise.resolve({ value: 247 }); },
      requestConnectionPriority: function () { return Promise.resolve(); },
      write: async function (o) { var c = await P._char(o.deviceId, o.service, o.characteristic); await (c.writeValueWithResponse ? c.writeValueWithResponse(fromHex(o.value)) : c.writeValue(fromHex(o.value))); },
      writeWithoutResponse: async function (o) { var c = await P._char(o.deviceId, o.service, o.characteristic); await (c.writeValueWithoutResponse ? c.writeValueWithoutResponse(fromHex(o.value)) : c.writeValue(fromHex(o.value))); },
      disconnect: async function (o) { var d = devs[o.deviceId]; if (d && d.gatt.connected) d.gatt.disconnect(); },
      addListener: function (name, fn) { return L.add(name, fn); }
    };
    return P;
  }

  // ================= USBケーブル（Web Serial） =================
  // 基板の返事は1行ずつ（"OK 長さ 合計" など）。Bluetoothの通知と同じ形（16進の文字）にして渡す
  function makeSerial() {
    if (!nav.serial) return null;
    var L = new Listeners(), ID = 'usb', port = null, reader = null, writer = null, closing = false, buf = '';
    function lost() {
      if (closing) return;
      var had = !!port; port = null; reader = null; writer = null;
      if (had) L.emit('disconnected|' + ID, {});
    }
    async function readLoop(p) {
      var dec = new TextDecoder();
      while (p === port && p.readable) {
        reader = p.readable.getReader();
        try {
          for (;;) {
            var r = await reader.read();
            if (r.done) break;
            buf += dec.decode(r.value, { stream: true });
            var i;
            while ((i = buf.indexOf('\n')) >= 0) {
              var line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
              line = line.replace(/[^\x20-\x7E]/g, '').trim();   // 起動時の文字化けなどを取り除く
              if (line) L.emit('notification|' + ID + '|', { value: strHex(line) });
            }
            if (buf.length > 4096) buf = '';
          }
        } catch (e) { /* ケーブルが抜けた時など */ }
        finally { try { reader.releaseLock(); } catch (e) { } reader = null; }
        if (closing) return;
        break;
      }
      if (p === port) lost();
    }
    if (nav.serial.addEventListener) nav.serial.addEventListener('disconnect', function (ev) { if (port && ev.target === port) lost(); });
    var P = {
      kind: 'usb',
      initialize: function () { return Promise.resolve(); },
      isEnabled: function () { return Promise.resolve({ value: true }); },
      knows: async function () { try { var a = await nav.serial.getPorts(); if (a.length) { P._pending = a[a.length - 1]; return true; } } catch (e) { } return false; },
      requestDevice: async function () { P._pending = await nav.serial.requestPort({}); return { deviceId: ID, name: 'USB' }; },
      connect: async function () {
        var p = P._pending;
        if (!p) throw new Error('Device not found');
        closing = false; buf = '';
        try { await p.open({ baudRate: 115200, bufferSize: 8192 }); }
        catch (e) { if (!/already open/i.test(e && e.message)) throw new Error('USB_OPEN: ' + (e && e.message)); }
        // 基板が勝手にリセットされないように（DTR/RTSを下げる）
        try { await p.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch (e) { }
        port = p; writer = p.writable.getWriter();
        readLoop(p);
      },
      startNotifications: function () { return Promise.resolve(); },
      getMtu: function () { return Promise.resolve({ value: 515 }); },
      requestConnectionPriority: function () { return Promise.resolve(); },
      write: async function (o) { if (!writer) throw new Error('基板につながっていません'); await writer.write(fromHex(o.value)); },
      writeWithoutResponse: function (o) { return P.write(o); },
      disconnect: async function () {
        var p = port; if (!p) return;
        closing = true; port = null;
        try { if (reader) await reader.cancel(); } catch (e) { }
        for (var i = 0; i < 40 && reader; i++) await new Promise(function (r) { setTimeout(r, 5); });
        try { if (writer) { writer.releaseLock(); } } catch (e) { }
        writer = null;
        try { await p.close(); } catch (e) { }
        closing = false;
      },
      // board.js は 'notification|usb|サービス|特性' で登録する。USBでは全部の返事をそこへ送る
      addListener: function (name, fn) { return L.add(name, fn); }
    };
    return P;
  }

  root.RSWebBle = makeBle();
  root.RSWebSerial = makeSerial();
})(typeof window !== 'undefined' ? window : globalThis);
