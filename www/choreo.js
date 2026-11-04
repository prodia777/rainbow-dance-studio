/* Rainbow Stick 自動振付エンジン（スマホ版）
   PC版 rs_auto_choreo.py v0.7 をそのまま移植したもの。
   曲の音データから、20msごとの振付データ（＋右 −左 0電気オフ、基板へ送る値そのもの）を作る。
   拍の検出は PC版で使っている librosa 1.0 と同じ計算にしてあり、全曲で結果を比べて確かめている。 */
(function (root) {
  'use strict';
  var SR = 22050, HOP = 512, NFFT = 2048, NMELS = 128;
  var F = 0.02, CAP = 166, LOW = 13.0, REST = 0.12, Q_BASE = 18.0, L_BASE = 22.0;
  var KICK_START = 28.0, KICK_BEAT = 26.0, FLOOR_ANY = 13.0;
  var VERSION = '0.7';

  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function clip(v, a, b) { return Math.min(b, Math.max(a, v)); }
  // numpy / Python の round（ちょうど0.5は偶数へ）
  function roundEven(x) { var r = Math.round(x); if (Math.abs(x - Math.trunc(x)) === 0.5 && r % 2 !== 0) r -= 1; return r; }
  function sorted(a) { return Array.prototype.slice.call(a).sort(function (p, q) { return p - q; }); }
  function percentile(a, q) {
    var s = sorted(a); if (!s.length) return 0;
    var pos = (s.length - 1) * q / 100, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }
  function median(a) { return percentile(a, 50); }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }

  // ---------- 周波数分析（librosa の onset_strength と rms） ----------
  function makeFFT(N) {
    var lev = Math.round(Math.log2(N)), rev = new Uint32Array(N), cos = new Float64Array(N / 2), sin = new Float64Array(N / 2), i;
    for (i = 0; i < N; i++) { var r = 0, x = i; for (var b = 0; b < lev; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
    for (i = 0; i < N / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / N); sin[i] = Math.sin(2 * Math.PI * i / N); }
    return function (re, im) {
      for (var i = 0; i < N; i++) { var j = rev[i]; if (j > i) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for (var size = 2; size <= N; size <<= 1) {
        var half = size >> 1, step = N / size;
        for (var s = 0; s < N; s += size) {
          for (var k = 0, kk = 0; k < half; k++, kk += step) {
            var a = s + k, b = a + half;
            var tr = re[b] * cos[kk] + im[b] * sin[kk], ti = -re[b] * sin[kk] + im[b] * cos[kk];
            re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          }
        }
      }
    };
  }

  // Slaney 式のメル尺度（librosa の既定）
  function hz2mel(f) {
    if (f < 1000) return 3 * f / 200;
    return 15 + 27 * Math.log(f / 1000) / Math.log(6.4);
  }
  function mel2hz(m) {
    if (m < 15) return 200 * m / 3;
    return 1000 * Math.pow(6.4, (m - 15) / 27);
  }
  function melBank() {
    var nb = NFFT / 2 + 1, m1 = hz2mel(SR / 2), pts = [], i, k;
    for (i = 0; i < NMELS + 2; i++) pts.push(mel2hz(m1 * i / (NMELS + 1)));
    var bank = [];
    for (var m = 0; m < NMELS; m++) {
      var l = pts[m], c = pts[m + 1], r = pts[m + 2], en = 2 / (r - l), lo = -1, vals = [];
      for (k = 0; k < nb; k++) {
        var f = k * SR / NFFT, w = Math.max(0, Math.min((f - l) / (c - l), (r - f) / (r - c)));
        if (w > 0) { if (lo < 0) lo = k; vals.push(w * en); }
      }
      bank.push({ lo: lo < 0 ? 0 : lo, w: new Float64Array(vals) });
    }
    return bank;
  }

  async function features(y, onProg) {
    var N = NFFT, nb = N / 2 + 1, nF = 1 + Math.floor(y.length / HOP), half = N / 2, fft = makeFFT(N), bank = melBank();
    var win = new Float64Array(N), i, k, m, t;
    for (i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    var mel = new Float32Array(nF * NMELS), rms = new Float64Array(nF), gmax = -1e30;
    var re = new Float64Array(N), im = new Float64Array(N), pa = new Float64Array(nb), pb = new Float64Array(nb);
    function melOf(t, pw) {
      for (var m = 0; m < NMELS; m++) {
        var B = bank[m], w = B.w, lo = B.lo, s = 0;
        for (var q = 0; q < w.length; q++) s += w[q] * pw[lo + q];
        var d = 10 * Math.log10(Math.max(s, 1e-10));
        mel[t * NMELS + m] = d; if (d > gmax) gmax = d;
      }
    }
    // 実数の2コマを1回のFFTで同時に計算して、時間を半分にする
    for (t = 0; t < nF; t += 2) {
      var two = t + 1 < nF, ca = t * HOP - half, cb = (t + 1) * HOP - half, ea = 0, eb = 0;
      for (i = 0; i < N; i++) {
        var ja = ca + i, va = (ja >= 0 && ja < y.length) ? y[ja] : 0; ea += va * va; re[i] = va * win[i];
        var jb = cb + i, vb = (two && jb >= 0 && jb < y.length) ? y[jb] : 0; eb += vb * vb; im[i] = vb * win[i];
      }
      rms[t] = Math.sqrt(ea / N); if (two) rms[t + 1] = Math.sqrt(eb / N);
      fft(re, im);
      for (k = 0; k < nb; k++) {
        var kn = (N - k) % N, ar = (re[k] + re[kn]) / 2, ai = (im[k] - im[kn]) / 2, br = (im[k] + im[kn]) / 2, bi = (re[kn] - re[k]) / 2;
        pa[k] = ar * ar + ai * ai; pb[k] = br * br + bi * bi;
      }
      melOf(t, pa); if (two) melOf(t + 1, pb);
      if (t % 1000 === 0) { if (onProg) onProg(t / nF); await tick(); }
    }
    var floor = gmax - 80, oe = new Float64Array(nF);
    for (t = 1; t < nF; t++) {
      var s = 0, p0 = (t - 1) * NMELS, p1 = t * NMELS;
      for (m = 0; m < NMELS; m++) { var d1 = Math.max(mel[p1 + m], floor) - Math.max(mel[p0 + m], floor); if (d1 > 0) s += d1; }
      if (t + 2 < nF) oe[t + 2] = s / NMELS;   // librosa と同じく、窓の中心の分だけ後ろへずらす
    }
    return { oe: oe, rms: rms, n: nF };
  }

  // ---------- 拍の検出（librosa.beat.beat_track と同じ計算） ----------
  async function estimateTempo(oe) {
    var n = oe.length, W = 344, half = W >> 1, pad = new Float64Array(n + W), i, lag;
    if (n === 0) return 120;
    for (i = 0; i < half; i++) pad[i] = oe[0] * i / half;
    for (i = 0; i < n; i++) pad[half + i] = oe[i];
    for (i = 0; i < W - half; i++) pad[half + n + i] = oe[n - 1] * (W - half - i) / (W - half);
    var hann = new Float64Array(W), acc = new Float64Array(W), x = new Float64Array(W), r = new Float64Array(W);
    for (i = 0; i < W; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / W);
    var frames = Math.min(n, pad.length - W + 1);
    for (var t = 0; t < frames; t++) {
      for (i = 0; i < W; i++) x[i] = pad[t + i] * hann[i];
      var mx = 0;
      for (lag = 0; lag < W; lag++) {
        var s = 0; for (i = 0; i + lag < W; i++) s += x[i] * x[i + lag];
        r[lag] = s; if (Math.abs(s) > mx) mx = Math.abs(s);
      }
      if (mx > 0) for (lag = 0; lag < W; lag++) acc[lag] += r[lag] / mx;
      if (t % 1000 === 0) await tick();
    }
    var best = -Infinity, bestBpm = 120;
    for (lag = 1; lag < W; lag++) {
      var bpm = 60 * SR / (HOP * lag);
      if (bpm >= 320) continue;
      var pri = -0.5 * Math.pow(Math.log2(bpm) - Math.log2(120), 2);
      var sc = Math.log1p(1e6 * (acc[lag] / frames)) + pri;
      if (sc > best) { best = sc; bestBpm = bpm; }
    }
    return bestBpm;
  }

  function beatTrack(oe, bpm) {
    var n = oe.length, i, k, fpb = roundEven(SR / HOP * 60 / bpm), m = mean(oe), sd = 0;
    for (i = 0; i < n; i++) sd += (oe[i] - m) * (oe[i] - m);
    sd = Math.sqrt(sd / Math.max(n - 1, 1)) + 1e-30;
    // なめらかにした拍の候補
    var K = 2 * fpb + 1, win = new Float64Array(K), K2 = K >> 1, local = new Float64Array(n);
    for (k = 0; k < K; k++) win[k] = Math.exp(-0.5 * Math.pow((k - fpb) * 32 / fpb, 2));
    for (i = 0; i < n; i++) {
      var s = 0, k0 = Math.max(0, i + K2 - n + 1), k1 = Math.min(i + K2, K);
      for (k = k0; k < k1; k++) s += win[k] * oe[i + K2 - k] / sd;
      local[i] = s;
    }
    // 動的計画法
    var cum = new Float64Array(n), back = new Int32Array(n), thresh = 0;
    for (i = 0; i < n; i++) if (local[i] > thresh) thresh = local[i];
    thresh *= 0.01;
    var first = true, nearest = roundEven(fpb / 2), lfpb = Math.log(fpb);
    back[0] = -1; cum[0] = local[0];
    for (i = 0; i < n; i++) {
      var bs = -Infinity, bl = -1;
      for (var loc = i - nearest; loc > Math.trunc(i - 2 * fpb - 1); loc--) {
        if (loc < 0) break;
        var lg = Math.log(i - loc) - lfpb, sc = cum[loc] - 100 * lg * lg;
        if (sc > bs) { bs = sc; bl = loc; }
      }
      cum[i] = bl >= 0 ? local[i] + bs : local[i];
      if (first && local[i] < thresh) back[i] = -1;
      else { back[i] = bl; first = false; }
    }
    // 最後の拍
    var peaks = [];
    for (i = 0; i < n; i++) {
      var pv = i > 0 ? cum[i - 1] : cum[i], nx = i + 1 < n ? cum[i + 1] : cum[i];
      if (cum[i] > pv && cum[i] >= nx) peaks.push(i);
    }
    var thr = 0.5 * median(peaks.map(function (p) { return cum[p]; })), tail = n - 1;
    for (i = peaks.length - 1; i >= 0; i--) if (cum[peaks[i]] >= thr) { tail = peaks[i]; break; }
    var isBeat = new Uint8Array(n), list = [];
    for (i = tail; i >= 0; i = back[i]) isBeat[i] = 1;
    for (i = 0; i < n; i++) if (isBeat[i]) list.push(i);
    // 前後の余分な拍を除く
    var w = [0, 0.5, 1, 0.5, 0], L = list.length, conv = new Float64Array(L + 4);
    list.forEach(function (b, q) { for (var j = 0; j < 5; j++) conv[q + j] += local[b] * w[j]; });
    var se = 0, cnt = 0;
    for (i = 2; i < conv.length; i++) { se += conv[i] * conv[i]; cnt++; }
    var th2 = 0.5 * Math.sqrt(se / Math.max(cnt, 1));
    i = 0; while (i < n && local[i] <= th2) { isBeat[i] = 0; i++; }
    i = n - 1; while (i >= 0 && local[i] <= th2) { isBeat[i] = 0; i--; }
    var out = [];
    for (i = 0; i < n; i++) if (isBeat[i]) out.push(i * HOP / SR);
    return out;
  }

  // ---------- 解析 ----------
  async function analyze(y, onStep) {
    var step = onStep || function () { };
    step('level', 0);
    var ft = await features(y, function (p) { step('level', p); });
    step('level', 1); step('beat', 0); await tick();
    var n = ft.n, t = new Float64Array(n), db = new Float64Array(n), i;
    for (i = 0; i < n; i++) { t[i] = i * HOP / SR; db[i] = 20 * Math.log10(ft.rms[i] + 1e-6); }
    var tempo = await estimateTempo(ft.oe);
    var bt = beatTrack(ft.oe, tempo);
    step('beat', 1); await tick();
    // 音量の累積（区間の平均を素早く求めるため）
    var cs = new Float64Array(n + 1);
    for (i = 0; i < n; i++) cs[i + 1] = cs[i] + db[i];
    return { dur: y.length / SR, oe: ft.oe, db: db, t: t, bt: bt, dt: t[1] - t[0], tempo: tempo, cs: cs };
  }

  function lowerBound(t, x) { var a = 0, b = t.length; while (a < b) { var m = (a + b) >> 1; if (t[m] < x) a = m + 1; else b = m; } return a; }
  function makeLv(a) {
    return function (x, y) {
      var i = lowerBound(a.t, x), j = lowerBound(a.t, y);
      return j > i ? (a.cs[j] - a.cs[i]) / (j - i) : -90.0;
    };
  }

  // ---------- 場面の組み立て ----------
  function _plan(a, PH) {
    var t = a.t, db = a.db, oe = a.oe, bt = a.bt, dt = a.dt, dur = a.dur, lv = makeLv(a), i, k;
    var dbMax = -Infinity; for (i = 0; i < db.length; i++) if (db[i] > dbMax) dbMax = db[i];
    var start = 0, end = 0, seen = false;
    for (i = 0; i < t.length; i++) if (db[i] > dbMax - 35) { if (!seen) { start = t[i]; seen = true; } end = t[i]; }
    var diffs = []; for (i = 1; i < bt.length; i++) diffs.push(bt[i] - bt[i - 1]);
    var ibi = median(diffs);
    var step = 1;
    while (ibi * step * 2 <= 1.1 && step < 8) step *= 2;
    if (ibi * step < 0.6) step *= 2;
    var oev = bt.map(function (b) { return oe[clip(roundEven(b / dt), 0, oe.length - 1)]; });
    var off = 0, bestM = -Infinity;
    for (k = 0; k < step; k++) {
      var s0 = 0, c0 = 0; for (i = k; i < oev.length; i += step) { s0 += oev[i]; c0++; }
      var mm = c0 ? s0 / c0 : -Infinity; if (mm > bestM) { bestM = mm; off = k; }
    }
    var pts = []; for (i = off; i < bt.length; i += step) if (bt[i] < end) pts.push(bt[i]);
    var best = -1, ph0 = 0;
    for (k = 0; k < PH; k++) {
      var sc = 0;
      for (i = k; i < pts.length; i += PH) {
        if (i >= PH) sc += Math.abs(lv(pts[i], pts[Math.min(i + PH, pts.length - 1)]) - lv(pts[Math.max(i - PH, 0)], pts[i]));
      }
      if (sc > best) { best = sc; ph0 = k; }
    }
    var bds = [0.0]; for (i = ph0; i < pts.length; i += PH) if (pts[i] > 0.5) bds.push(pts[i]);
    bds.push(end);
    var inRange = []; for (i = 0; i < t.length; i++) if (t[i] > start && t[i] < end) inRange.push(oe[i]);
    var oem = median(inRange), ph = [];
    for (k = 0; k + 1 < bds.length; k++) {
      var x = bds[k], y = bds[k + 1], so = 0, cn = 0;
      for (i = 0; i < bt.length; i++) if (bt[i] >= x && bt[i] < y) { so += oev[i]; cn++; }
      ph.push({ a: x, b: y, lv: lv(x, y), s: cn ? so / cn / oem : 0 });
    }
    var lvs = ph.map(function (p) { return p.lv; }), p15 = percentile(lvs, 15), lv2 = lvs.map(function (v) { return Math.max(v, p15); });
    var th = median(lv2);
    for (k = 0; k < 20; k++) {
      var hs = 0, hn = 0, ls = 0, ln = 0;
      lv2.forEach(function (v) { if (v >= th) { hs += v; hn++; } else { ls += v; ln++; } });
      if (!hn || !ln) break;
      th = (hs / hn + ls / ln) / 2;
    }
    ph.forEach(function (p) { p.big = p.lv > th; });
    for (k = 0; k < 2; k++) for (i = 1; i < ph.length - 1; i++) {
      if (ph[i - 1].big === ph[i + 1].big && ph[i + 1].big !== ph[i].big) ph[i].big = ph[i - 1].big;
    }
    var weakTh = 2.7;
    ph.forEach(function (p) { p.weak = p.s < weakTh; });
    var entries = [];
    for (i = 1; i < ph.length; i++) if (ph[i].big && !ph[i - 1].big) entries.push(i);
    function refine(x) {
      var bestB = null, bestV = -Infinity;
      pts.forEach(function (b) { if (Math.abs(b - x) <= 4.5) { var v = lv(b, b + 2.0) - lv(b - 2.0, b); if (v > bestV) { bestV = v; bestB = b; } } });
      return bestB === null ? x : bestB;
    }
    var rises = entries.map(function (q) { return [ph[q].lv - ph[q - 1].lv, refine(ph[q].a)]; });
    var gap = Math.max(45.0, dur * 0.25), eights = [], limit = dur < 90 ? 1 : 2;
    rises.slice().sort(function (p, q) { return q[0] - p[0] || q[1] - p[1]; }).some(function (r) {
      var ex = r[1];
      if (ex >= Math.max(20.0, dur * 0.1) && eights.every(function (e) { return Math.abs(ex - e) >= gap; })) eights.push(ex);
      return eights.length === limit;
    });
    eights.sort(function (p, q) { return p - q; });
    var flips = rises.map(function (r) { return r[1]; }).filter(function (x) { return eights.indexOf(x) < 0; }).sort(function (p, q) { return p - q; });
    return { end: end, start: start, ibi: ibi, step: step, pts: pts, ph: ph, eights: eights, flips: flips, tempo: 60 / ibi, weak_th: weakTh };
  }

  // 自己相関で一番強い周期を求める（0.25〜2.5秒）
  function bestPeriod(x, dt, maxSize) {
    var n = x.length, bestV = -Infinity, bestL = 0, lim = Math.min(maxSize, n);
    for (var l = 0; l < lim; l++) {
      var lag = l * dt;
      if (!(lag > 0.25 && lag < 2.5)) continue;
      var s = 0; for (var i = 0; i + l < n; i++) s += x[i] * x[i + l];
      if (s > bestV) { bestV = s; bestL = lag; }
    }
    return bestL;
  }

  function plan(a) {
    var pl = _plan(a, 8), t = a.t, oe = a.oe, dt = a.dt, i, j;
    var nw = 0; pl.ph.forEach(function (p) { if (p.weak) nw++; });
    var frac = nw / Math.max(1, pl.ph.length), seg = [];
    for (i = 0; i < t.length; i++) if (t[i] > pl.start && t[i] < pl.end) seg.push(oe[i]);
    var period = bestPeriod(seg, dt, Math.trunc(4 / dt));
    pl.slow = frac >= 0.6 && period >= 0.9; pl.weak_frac = frac; pl.period = period;
    if (pl.slow) {
      var sl = _plan(a, 16);
      sl.slow = true; sl.weak_frac = frac; sl.period = period;
      return sl;
    }
    var win = 16.0, hop = 8.0, top = Math.max(a.dur - win, 1.0), per = [], act = [];
    for (var st = 0; st < top - 1e-12; ) {
      var i0 = lowerBound(t, st), i1 = lowerBound(t, st + win), w = oe.slice(i0, i1), m = mean(w), c = new Float64Array(w.length);
      for (j = 0; j < w.length; j++) c[j] = w[j] - m;
      per.push(bestPeriod(c, dt, Math.trunc(3 / dt)));
      act.push(m);
      st = per.length * hop;
    }
    var med = median(act), low = percentile(act, 10), cond = per.map(function (p, q) { return (p >= 0.9 && act[q] < med) || act[q] <= low; });
    var sm = cond.map(function (_, q) {
      var a0 = Math.max(q - 2, 0), a1 = Math.min(q + 3, cond.length), s = 0;
      for (var z = a0; z < a1; z++) if (cond[z]) s++;
      return s / (a1 - a0) >= 0.6;
    });
    i = 0;
    while (i < sm.length) {
      if (sm[i]) {
        j = i; while (j < sm.length && sm[j]) j++;
        if ((j - i) * hop < 24) for (var z = i; z < j; z++) sm[z] = false;
        i = j;
      } else i++;
    }
    pl.ph.forEach(function (p) {
      var c_ = (p.a + p.b) / 2, k = Math.trunc(Math.min(sm.length - 1, Math.max(0, (c_ - win / 2) / hop)));
      p.weak = !!sm[k] && p.weak;
    });
    return pl;
  }

  // ---------- 動きデータ ----------
  function build(a, pl) {
    var dur = a.dur, end = pl.end, ph = pl.ph, pts = pl.pts, slow = !!pl.slow;
    var N = Math.trunc(dur / F) + 1 + (slow ? 200 : 0), base = new Float64Array(N), sgn = new Float64Array(N).fill(1);
    var cutOk = new Uint8Array(N), fine = new Uint8Array(N), s = 1, i, k, q;
    var loMin = Infinity, hiMax = -Infinity;
    ph.forEach(function (p) { if (p.lv < loMin) loMin = p.lv; if (p.lv > hiMax) hiMax = p.lv; });
    ph.forEach(function (p, idx) {
      var i0 = Math.trunc(p.a / F), i1 = Math.min(N, Math.trunc(p.b / F));
      if (i1 <= i0) return;
      var Tf = (i1 - i0) * F;
      if (p.weak) {
        var topMax = slow ? 24 : 28, top = 18.0 + (topMax - 18.0) * Math.max(0, Math.min(1, (p.lv - loMin) / Math.max(1, hiMax - loMin)));
        var u = Math.min(slow ? 5.0 : 3.0, 0.42 * Tf), dn = u;
        for (var ii = i0; ii < i1; ii++) {
          var x = (ii - i0) * F, v;
          if ((idx > 0 && x < REST / 2) || x > Tf - REST / 2) v = 0;
          else if (x < u + REST / 2) v = LOW + (top - LOW) * (1 - Math.cos(Math.PI * (x - REST / 2) / u)) / 2;
          else if (x > Tf - REST / 2 - dn) v = LOW + (top - LOW) * (1 + Math.cos(Math.PI * (x - (Tf - REST / 2 - dn)) / dn)) / 2;
          else v = top;
          base[ii] = v; sgn[ii] = s;
        }
        s = -s;
        return;
      }
      var vb = p.big ? L_BASE : Q_BASE, nxtBig = idx + 1 < ph.length && ph[idx + 1].big && !p.big;
      if (nxtBig) {
        var len = i1 - i0;
        for (q = 0; q < len; q++) base[i0 + q] = len > 1 ? Q_BASE + (L_BASE - Q_BASE) * q / (len - 1) : Q_BASE;
        for (q = i0 + (len >> 1); q < i1; q++) fine[q] = 1;
      } else for (q = i0; q < i1; q++) base[q] = vb;
      for (q = i0; q < i1; q++) { sgn[q] = s; cutOk[q] = 1; }
    });
    for (i = 1; i < N; i++) if (cutOk[i] && cutOk[i - 1]) base[i] = base[i - 1] + clip(base[i] - base[i - 1], -6 / 50, 6 / 50);
    pl.flips.concat(pl.eights).forEach(function (tr) { for (var z = Math.trunc(tr / F); z < N; z++) sgn[z] = -sgn[z]; });
    var noc = [];
    pl.flips.forEach(function (tr) {
      var fc = Math.trunc(tr / F), w = 75, z;
      for (z = Math.max(fc - w, 0); z < fc; z++) base[z] = LOW + (base[z] - LOW) * (1 + Math.cos(Math.PI * (z - fc + w) / w)) / 2;
      for (z = fc; z < Math.min(fc + w, N); z++) base[z] = LOW + (base[z] - LOW) * (1 - Math.cos(Math.PI * (z - fc) / w)) / 2;
      for (z = Math.max(fc - 3, 0); z < Math.min(fc + 3, N); z++) base[z] = 0;
      noc.push([tr - 1.6, tr + 1.6]);
    });
    pl.eights.forEach(function (e) { noc.push([e - 0.5, e + 2.6]); });
    function inNoc(b) { return noc.some(function (r) { return r[0] <= b && b <= r[1]; }); }
    var P = Float64Array.from(base), used = {}, ncut = 0;
    function cut(b, off) {
      var j = Math.trunc(b / F), st = Math.trunc((b - off) / F);
      if (st < 0 || j + 5 >= N) return;
      for (var z = st; z < j; z++) P[z] = 0;
      for (z = 0; z < 5; z++) P[j + z] = P[j + z] > 0 ? KICK_BEAT : 0;
    }
    function key(b) { return (Math.round(b * 100) / 100).toFixed(2); }
    pts.forEach(function (b) {
      if (inNoc(b) || b > end - 0.5) return;
      var z = Math.trunc(b / F);
      if (z < N && cutOk[z]) { cut(b, 0.15); ncut++; used[key(b)] = 1; }
    });
    if (pl.ibi >= 0.4) a.bt.forEach(function (b) {
      var z = Math.trunc(b / F);
      if (z < N && fine[z] && !used[key(b)] && !inNoc(b)) { cut(b, 0.10); ncut++; }
    });
    function setP(z, v) { if (z >= 0 && z < N) P[z] = v; }
    pl.eights.forEach(function (e) {
      var fc = Math.trunc(e / F), z;
      for (z = Math.max(fc - 15, 0); z < fc; z++) setP(z, 0);
      for (z = fc; z < fc + 5; z++) setP(z, 35 * (z - fc + 1) / 5);
      for (z = fc + 5; z < fc + 80; z++) setP(z, 35);
      for (z = fc + 80; z < fc + 130; z++) setP(z, 35 + (L_BASE - 35) * (z - fc - 80) / 50);
    });
    function assist(i0) { for (var z = i0; z < Math.min(i0 + 20, N); z++) if (P[z] > 0) P[z] = Math.max(P[z], KICK_START); }
    assist(0);
    pl.flips.forEach(function (tr) { assist(Math.trunc(tr / F) + 3); });
    ph.forEach(function (p, idx) { if (p.weak && idx > 0) assist(Math.trunc(p.a / F) + 4); });
    var out = new Int32Array(N);
    for (i = 0; i < N; i++) {
      var pv = P[i] > 0 ? Math.max(P[i], FLOOR_ANY) : 0;
      out[i] = Math.trunc(pv * sgn[i] * CAP / 100);
    }
    var e = Math.trunc(end / F);
    if (slow) {
      var W = Math.trunc(8 / F), sl = Math.sign(out[e - 1]) || Math.sign(out[e - 2]) || 1, lo = Math.trunc(FLOOR_ANY * CAP / 100 + 0.5);
      for (i = Math.max(e - W, 0); i < e; i++) {
        var r = (e - i) / W;
        if (out[i] !== 0) out[i] = Math.trunc(Math.sign(out[i]) * Math.max(lo, lo + (Math.abs(out[i]) - lo) * r));
      }
      for (i = e; i < Math.min(e + 100, N); i++) out[i] = sl * lo;
      for (i = e + 100; i < N; i++) out[i] = 0;
    } else for (i = e; i < N; i++) out[i] = 0;
    var fl = [];
    for (i = 0; i + 1 < N; i++) if (out[i] * out[i + 1] < 0) fl.push(i);
    fl.forEach(function (z) { out[z] = 0; });
    // 安全のため、8の字の出力（35%）を超えないことを確かめる
    var lim = Math.trunc(CAP * 0.35), cmd = new Int8Array(N);
    for (i = 0; i < N; i++) cmd[i] = clip(out[i], -lim, lim);
    return { cmd: cmd, ncut: ncut };
  }

  function scenes(pl) {
    var o = [];
    pl.ph.forEach(function (p) {
      var kind = (p.weak ? '逆回転' : '電気を切る') + (p.big ? '（大きい場面）' : '（静かな場面）'), last = o[o.length - 1];
      if (last && last.kind === kind) last.b = p.b; else o.push({ a: p.a, b: p.b, kind: kind, weak: p.weak, big: p.big });
    });
    return o;
  }

  // 解析結果から振付を作る
  function choreograph(a) {
    var pl = plan(a), b = build(a, pl);
    return { cmd: b.cmd, ncut: b.ncut, eights: pl.eights, flips: pl.flips, scenes: scenes(pl), tempo: pl.tempo, slow: !!pl.slow, plan: pl };
  }

  // ---------- 動きデータの書き出し（.bin の形式） ----------
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function toBin(cmd, name) {
    var data = new Uint8Array(cmd.buffer.slice(cmd.byteOffset, cmd.byteOffset + cmd.length));
    var buf = new ArrayBuffer(20 + data.length), dv = new DataView(buf);
    [82, 83, 77, 49].forEach(function (c, i) { dv.setUint8(i, c); });   // 'RSM1'
    dv.setUint8(4, 1); dv.setUint8(5, 20); dv.setUint8(6, 1); dv.setUint8(7, 0);
    dv.setUint32(8, cmd.length, true);
    dv.setUint32(12, crc32(new TextEncoder().encode(name)), true);
    dv.setUint32(16, crc32(data), true);
    new Uint8Array(buf, 20).set(data);
    return new Uint8Array(buf);
  }

  var API = { analyze: analyze, choreograph: choreograph, toBin: toBin, crc32: crc32, SR: SR, CAP: CAP, VERSION: VERSION };
  root.RSChoreo = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
