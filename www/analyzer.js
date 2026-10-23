/* Rainbow Stick 音楽解析エンジン（ブラウザ版 v0.3）
   PC版 rs_analyze.py の「クラシック設定」と同じ考え方：
   ・レベルメーター（上がり速く・下がりゆっくり）→ 低速／中速／高速（止めない）
   ・向きの切替は「曲調の変わり目」と「強いアクセント」、どちらも拍に合わせる
   ・静かな所は向きを変えず一方向。反転は先読み、モーターの遅れは前倒し */
(function (root) {
  'use strict';
  var SR = 22050, FRAME_MS = 20, HOP_LV = 441, NFFT = 2048, HOP = 512;

  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  function resample(x, sr) {
    if (sr === SR) return x;
    var ratio = sr / SR, n = Math.floor(x.length / ratio), y = new Float32Array(n);
    if (Math.abs(ratio - Math.round(ratio)) < 1e-9) {
      var k = Math.round(ratio);
      for (var i = 0; i < n; i++) { var s = 0; for (var j = 0; j < k; j++) s += x[i * k + j]; y[i] = s / k; }
      return y;
    }
    // 簡易ローパス（3点）＋線形補間
    for (var m = 0; m < n; m++) {
      var p = m * ratio, a = Math.floor(p), f = p - a;
      var v0 = x[a] || 0, v1 = x[a + 1] || 0;
      y[m] = v0 + (v1 - v0) * f;
    }
    return y;
  }

  function percentile(arr, q) {
    var s = Array.prototype.slice.call(arr).sort(function (a, b) { return a - b; });
    if (!s.length) return 0;
    var pos = (s.length - 1) * q / 100, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }

  // ---------- 1. レベルメーター ----------
  function levelMeter(y, attack, release) {
    var hop = HOP_LV, fl = hop * 2, n = 1 + Math.floor(y.length / hop);
    var db = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var c = i * hop, s = 0;
      for (var j = c - hop; j < c + hop; j++) { var v = (j >= 0 && j < y.length) ? y[j] : 0; s += v * v; }
      db[i] = 20 * Math.log10(Math.sqrt(s / fl) + 1e-9);
    }
    var dt = FRAME_MS / 1000, aUp = 1 - Math.exp(-dt / attack), aDn = 1 - Math.exp(-dt / release);
    var vu = new Float32Array(n), v = db[0], mx = -1e9;
    for (i = 0; i < n; i++) { v += (db[i] > v ? aUp : aDn) * (db[i] - v); vu[i] = v; if (v > mx) mx = v; }
    var sound = []; for (i = 0; i < n; i++) if (vu[i] > mx - 60) sound.push(vu[i]);
    var lo = percentile(sound, 10), hi = percentile(sound, 97), lvl = new Float32Array(n);
    for (i = 0; i < n; i++) lvl[i] = Math.min(1, Math.max(0, (vu[i] - lo) / Math.max(hi - lo, 1e-6)));
    return lvl;
  }

  // ---------- 2. 速さの段階 ----------
  function toStages(level, th, minHold, smoothSec) {
    var n = level.length, stage = new Int8Array(n);
    // 拍ごとの細かい上下ではなく、1秒ほどの平均の強さで段階を決める
    var w = Math.max(1, Math.round((smoothSec || 1.0) * 1000 / FRAME_MS / 2)), cs = new Float64Array(n + 1);
    for (var i = 0; i < n; i++) cs[i + 1] = cs[i] + level[i];
    for (i = 0; i < n; i++) {
      var a = Math.max(0, i - w), b = Math.min(n, i + w + 1), lv = (cs[b] - cs[a]) / (b - a), s = 0;
      for (var k = 0; k < 3; k++) if (lv >= th[k]) s = k + 1; stage[i] = s;
    }
    var hold = Math.max(1, Math.round(minHold * 1000 / FRAME_MS));
    // 区間（値・長さ）に分けて、短い区間を前後に吸収
    var segs = [], st = 0;
    for (i = 1; i <= n; i++) if (i === n || stage[i] !== stage[st]) { segs.push([stage[st], i - st]); st = i; }
    var changed = true;
    while (changed && segs.length > 1) {
      changed = false;
      var q = -1, ml = hold;                      // いちばん短い区間から順に前後へ吸収
      for (var z0 = 0; z0 < segs.length; z0++) if (segs[z0][1] < ml) { ml = segs[z0][1]; q = z0; }
      if (q >= 0) {
        {
          var nb = q > 0 ? q - 1 : q + 1;
          if (q + 1 < segs.length && (q === 0 || segs[q + 1][1] > segs[nb][1])) nb = q + 1;
          segs[nb][1] += segs[q][1];
          segs.splice(q, 1);
          // 隣どうしが同じ値になったらまとめる
          for (var r = segs.length - 1; r > 0; r--) if (segs[r][0] === segs[r - 1][0]) { segs[r - 1][1] += segs[r][1]; segs.splice(r, 1); }
          changed = true;
        }
      }
    }
    var out = new Int8Array(n), p = 0;
    segs.forEach(function (sg) { for (var z = 0; z < sg[1]; z++) out[p++] = sg[0]; });
    return out;
  }

  // ---------- FFT ----------
  function makeFFT(N) {
    var lev = Math.round(Math.log2(N)), rev = new Uint32Array(N), cos = new Float64Array(N / 2), sin = new Float64Array(N / 2);
    for (var i = 0; i < N; i++) { var r = 0, x = i; for (var b = 0; b < lev; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
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

  function melBank(nMels, nfft, sr, fmin, fmax) {
    function hz2mel(f) { return 2595 * Math.log10(1 + f / 700); }
    function mel2hz(m) { return 700 * (Math.pow(10, m / 2595) - 1); }
    var nb = nfft / 2 + 1, m0 = hz2mel(fmin), m1 = hz2mel(fmax), pts = [];
    for (var i = 0; i < nMels + 2; i++) pts.push(mel2hz(m0 + (m1 - m0) * i / (nMels + 1)));
    var bank = [];
    for (var m = 0; m < nMels; m++) {
      var w = new Float32Array(nb), l = pts[m], c = pts[m + 1], r = pts[m + 2];
      for (var k = 0; k < nb; k++) {
        var f = k * sr / nfft;
        if (f > l && f < r) w[k] = f <= c ? (f - l) / (c - l) : (r - f) / (r - c);
      }
      bank.push(w);
    }
    return bank;
  }

  // ---------- 3. 周波数分析（オンセット・音色・和音） ----------
  async function spectralFeatures(y, onProg) {
    var N = NFFT, nb = N / 2 + 1, nF = 1 + Math.floor(y.length / HOP), fft = makeFFT(N);
    var win = new Float64Array(N); for (var i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    var NM = 64, bank = melBank(NM, N, SR, 0, SR / 2);
    var bankLo = [], bankHi = [];
    bank.forEach(function (w) { var lo = -1, hi = -1; for (var k = 0; k < nb; k++) if (w[k] > 0) { if (lo < 0) lo = k; hi = k; } bankLo.push(Math.max(lo, 0)); bankHi.push(hi); });
    var pc = new Int8Array(nb).fill(-1);
    for (var k = 1; k < nb; k++) { var f = k * SR / N; if (f >= 55 && f <= 4200) pc[k] = ((Math.round(12 * Math.log2(f / 440)) + 9) % 12 + 12) % 12; }
    var melDb = new Float32Array(nF * NM), chroma = new Float32Array(nF * 12), rmsL = new Float32Array(nF);
    var re = new Float64Array(N), im = new Float64Array(N), pw = new Float64Array(nb), gmax = -1e9;
    for (var t = 0; t < nF; t++) {
      var c = t * HOP - N / 2, e = 0;
      for (i = 0; i < N; i++) { var j = c + i, v = (j >= 0 && j < y.length) ? y[j] : 0; re[i] = v * win[i]; im[i] = 0; e += v * v; }
      rmsL[t] = Math.log(Math.sqrt(e / N) + 1e-6);
      fft(re, im);
      for (k = 0; k < nb; k++) pw[k] = re[k] * re[k] + im[k] * im[k];
      for (var m = 0; m < NM; m++) {
        var s = 0, w = bank[m];
        for (k = bankLo[m]; k <= bankHi[m]; k++) s += w[k] * pw[k];
        var d = 10 * Math.log10(Math.max(s, 1e-10)); melDb[t * NM + m] = d; if (d > gmax) gmax = d;
      }
      var cm = 0;
      for (k = 1; k < nb; k++) if (pc[k] >= 0) chroma[t * 12 + pc[k]] += Math.sqrt(pw[k]);
      for (m = 0; m < 12; m++) if (chroma[t * 12 + m] > cm) cm = chroma[t * 12 + m];
      if (cm > 0) for (m = 0; m < 12; m++) chroma[t * 12 + m] /= cm;
      if (t % 2000 === 0) { if (onProg) onProg(t / nF); await tick(); }
    }
    // オンセット強度（スペクトルの増加分）
    var floor = gmax - 80, onset = new Float32Array(nF);
    for (i = 0; i < melDb.length; i++) if (melDb[i] < floor) melDb[i] = floor;
    for (t = 1; t < nF; t++) { var sum = 0; for (m = 0; m < NM; m++) { var dd = melDb[t * NM + m] - melDb[(t - 1) * NM + m]; if (dd > 0) sum += dd; } onset[t] = sum / NM; }
    // MFCC（13）
    var NC = 13, mfcc = new Float32Array(nF * NC);
    for (t = 0; t < nF; t++) for (var q = 0; q < NC; q++) {
      var a = 0; for (m = 0; m < NM; m++) a += melDb[t * NM + m] * Math.cos(Math.PI * q * (m + 0.5) / NM);
      mfcc[t * NC + q] = a;
    }
    return { nF: nF, onset: onset, chroma: chroma, mfcc: mfcc, rmsL: rmsL };
  }

  // ---------- 4. 拍の検出（テンポ推定＋動的計画法） ----------
  function beatTrack(onset) {
    var n = onset.length, fr = SR / HOP;
    var mean = 0; for (var i = 0; i < n; i++) mean += onset[i]; mean /= n;
    var minLag = Math.round(fr * 60 / 240), maxLag = Math.round(fr * 60 / 40), best = 0, bestLag = Math.round(fr * 0.5);
    for (var L = minLag; L <= maxLag; L++) {
      var ac = 0; for (i = L; i < n; i++) ac += (onset[i] - mean) * (onset[i - L] - mean);
      var bpm = 60 * fr / L, prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120), 2));
      var sc = ac / (n - L) * prior; if (sc > best) { best = sc; bestLag = L; }
    }
    var period = bestLag, tempo = 60 * fr / period;
    var sd = 0; for (i = 0; i < n; i++) sd += (onset[i] - mean) * (onset[i] - mean); sd = Math.sqrt(sd / (n - 1)) || 1;
    var P = Math.round(period), gw = [], wSum = 0;
    for (var o = -P; o <= P; o++) { var g = Math.exp(-0.5 * Math.pow(o * 32 / period, 2)); gw.push(g); wSum += g; }
    var local = new Float32Array(n);
    for (i = 0; i < n; i++) { var s = 0; for (o = -P; o <= P; o++) { var k = i + o; if (k >= 0 && k < n) s += onset[k] / sd * gw[o + P]; } local[i] = s; }
    var cum = new Float32Array(n), back = new Int32Array(n).fill(-1), lo = Math.round(2 * period), hi = Math.round(period / 2), tight = 100;
    for (i = 0; i < n; i++) {
      var bv = -1e30, bi = -1;
      for (var j = i - lo; j <= i - hi; j++) {
        if (j < 0) continue;
        var tx = -tight * Math.pow(Math.log((i - j) / period), 2), v = cum[j] + tx;
        if (v > bv) { bv = v; bi = j; }
      }
      cum[i] = local[i] + (bi >= 0 ? bv : 0); back[i] = bi;
    }
    var maxes = []; for (i = 1; i < n - 1; i++) if (cum[i] > cum[i - 1] && cum[i] >= cum[i + 1]) maxes.push(i);
    var med = percentile(maxes.map(function (m) { return cum[m]; }), 50), last = n - 1;
    for (var q = maxes.length - 1; q >= 0; q--) if (cum[maxes[q]] >= 0.5 * med) { last = maxes[q]; break; }
    var beats = []; for (i = last; i >= 0; i = back[i]) beats.push(i);
    beats.reverse();
    // 前後の弱い拍を除く
    var sm = beats.map(function (b, idx) { var a = 0, c = 0; for (var d = -2; d <= 2; d++) { var bb = beats[idx + d]; if (bb !== undefined) { a += local[bb]; c++; } } return a / c; });
    var thr = 0.5 * Math.sqrt(sm.reduce(function (a, v) { return a + v * v; }, 0) / Math.max(sm.length, 1));
    var s0 = 0, s1 = beats.length; while (s0 < s1 && sm[s0] < thr) s0++; while (s1 > s0 && sm[s1 - 1] < thr) s1--;
    return { tempo: tempo, beats: beats.slice(s0, s1) };
  }

  function peakPick(x, preMax, postMax, preAvg, postAvg, delta, wait) {
    var n = x.length, out = [], prev = -1e9;
    for (var i = 0; i < n; i++) {
      var a = Math.max(0, i - preMax), b = Math.min(n, i + postMax + 1), mx = -1e30;
      for (var j = a; j < b; j++) if (x[j] > mx) mx = x[j];
      if (x[i] < mx) continue;
      a = Math.max(0, i - preAvg); b = Math.min(n, i + postAvg + 1);
      var s = 0; for (j = a; j < b; j++) s += x[j];
      if (x[i] < s / (b - a) + delta) continue;
      if (i - prev > wait) { out.push(i); prev = i; }
    }
    return out;
  }

  // ---------- 5. 曲調の変わり目とアクセント ----------
  function musicFlips(sp, beats, stage, opts) {
    var nF = sp.nF, D = 12 + 13 + 1, F = new Float32Array(D * nF);
    for (var t = 0; t < nF; t++) {
      for (var c = 0; c < 12; c++) F[c * nF + t] = sp.chroma[t * 12 + c];
      for (c = 0; c < 13; c++) F[(12 + c) * nF + t] = sp.mfcc[t * 13 + c];
      F[25 * nF + t] = sp.rmsL[t];
    }
    for (var d = 0; d < D; d++) {
      var m = 0, s = 0; for (t = 0; t < nF; t++) m += F[d * nF + t]; m /= nF;
      for (t = 0; t < nF; t++) s += Math.pow(F[d * nF + t] - m, 2); s = Math.sqrt(s / nF) + 1e-9;
      var wgt = d === 25 ? 2 : 1;
      for (t = 0; t < nF; t++) F[d * nF + t] = wgt * (F[d * nF + t] - m) / s;
    }
    var bounds = [0].concat(beats).concat([nF]), nb = bounds.length - 1, Fs = [];
    for (var b = 0; b < nb; b++) {
      var a0 = bounds[b], a1 = Math.max(bounds[b + 1], a0 + 1), v = new Float32Array(D), nrm = 0;
      for (d = 0; d < D; d++) {
        var tmp = []; for (t = a0; t < a1 && t < nF; t++) tmp.push(F[d * nF + t]);
        tmp.sort(function (x, y) { return x - y; }); v[d] = tmp.length ? tmp[Math.floor(tmp.length / 2)] : 0; nrm += v[d] * v[d];
      }
      nrm = Math.sqrt(nrm) + 1e-9; for (d = 0; d < D; d++) v[d] /= nrm; Fs.push(v);
    }
    var S = new Float32Array(nb * nb);
    for (var i = 0; i < nb; i++) for (var j = i; j < nb; j++) { var dot = 0; for (d = 0; d < D; d++) dot += Fs[i][d] * Fs[j][d]; S[i * nb + j] = S[j * nb + i] = dot; }
    var L = opts.noveltyBeats || 16, K = [], g = [];
    for (var u = -L; u < L; u++) g.push(Math.exp(-0.5 * Math.pow((u + 0.5) / (L / 2), 2)));
    for (u = 0; u < 2 * L; u++) { K.push([]); for (var w = 0; w < 2 * L; w++) K[u].push(g[u] * g[w] * Math.sign(u - L + 0.5) * Math.sign(w - L + 0.5)); }
    var nov = new Float32Array(nb), nmax = 0;
    for (i = 0; i < nb; i++) {
      var acc = 0;
      for (u = 0; u < 2 * L; u++) {
        var ii = Math.min(nb - 1, Math.max(0, i + u - L));
        for (w = 0; w < 2 * L; w++) { var jj = Math.min(nb - 1, Math.max(0, i + w - L)); acc += K[u][w] * S[ii * nb + jj]; }
      }
      nov[i] = Math.max(acc, 0); if (nov[i] > nmax) nmax = nov[i];
    }
    for (i = 0; i < nb; i++) nov[i] /= nmax + 1e-9;
    var pk = peakPick(nov, 8, 8, 24, 24, opts.noveltyDelta, 8);
    var bt = function (f) { return f * HOP / SR; };
    var beatT = beats.map(bt);
    var snap = function (t) { var bi = 0, bd = 1e9; for (var k = 0; k < beatT.length; k++) { var dd = Math.abs(beatT[k] - t); if (dd < bd) { bd = dd; bi = k; } } return beatT.length ? beatT[bi] : t; };
    var cand = pk.map(function (p) { return { t: snap(bt(bounds[Math.min(p, nb - 1)])), k: '曲調' }; });
    if (opts.accents) {
      var thr = percentile(sp.onset, opts.accentPct);
      peakPick(sp.onset, 20, 20, 40, 40, 0, 40).forEach(function (f) { if (sp.onset[f] >= thr) cand.push({ t: bt(f), k: 'アクセント' }); });
    }
    cand.sort(function (a, b) { return a.t - b.t; });
    var fps = 1000 / FRAME_MS, safe = Math.max(opts.reverseTime * 3, 2.0), flips = [], last = -1e9;
    cand.forEach(function (c) {
      var i = Math.floor(c.t * fps);
      if (i <= 0 || i >= stage.length - 1) return;
      if (c.t < 2.0) return;                                                        // 曲の出だしは向きを変えない
      if (stage[Math.min(i + fps, stage.length - 1)] <= 1 && stage[i] <= 1) return;   // 静かな所は一方向
      var gap = c.k === 'アクセント' ? Math.max(safe, 4.0) : safe;                   // アクセントが続く所で左右に振れすぎない
      if (c.t - last >= gap) { flips.push(c); last = c.t; }
    });
    return { flips: flips, beatT: beatT };
  }

  // ---------- 6. 動きプログラム ----------
  // 強い拍で「弾む」：短く加速（高速時は一瞬ゆるめて戻す）。フィルムが跳ねるように見える
  function pulseTimes(sp, flips, stage, opts) {
    if (!opts.pulses) return [];
    var on = sp.onset, thr = percentile(on, opts.pulsePct), fr = SR / HOP;
    var pk = peakPick(on, 6, 6, 20, 20, 0, Math.round(0.28 * fr)).filter(function (f) { return on[f] >= thr; });
    var fps = 1000 / FRAME_MS;
    return pk.map(function (f) { return f / fr; }).filter(function (t) {
      var i = Math.floor(t * fps); if (i < 0 || i >= stage.length) return false;
      for (var k = 0; k < flips.length; k++) if (t > flips[k].t - opts.reverseTime - 0.15 && t < flips[k].t + 0.35) return false;
      return true;
    });
  }

  // 一定のテンポで進む場面を見つけ、拍ごとにモーターをオン・オフしてリズムを刻む
  // （オフの間は電気を切るだけ＝球体は惰性で回り続ける）
  function rhythmSections(beatT, stage, flips, opts) {
    if (!opts.rhythm || beatT.length < 10) return { segs: [], beats: [] };
    var fps = 1000 / FRAME_MS, W = 8, steady = new Array(beatT.length).fill(false);
    for (var i = 0; i + W < beatT.length; i++) {
      var iv = []; for (var k = i; k < i + W; k++) iv.push(beatT[k + 1] - beatT[k]);
      var m = iv.reduce(function (a, b) { return a + b; }, 0) / W;
      var sd = Math.sqrt(iv.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / W);
      if (sd / m > opts.steadyCv || m < 0.25 || m > 1.1) continue;
      var lively = true;
      for (k = i; k <= i + W; k++) { var f = Math.floor(beatT[k] * fps); if (f >= stage.length || stage[f] < 2) { lively = false; break; } }
      if (!lively) continue;
      for (k = i; k <= i + W; k++) steady[k] = true;
    }
    for (i = 0; i < beatT.length; i++) for (var q = 0; q < flips.length; q++)
      if (beatT[i] > flips[q].t - opts.reverseTime - 0.3 && beatT[i] < flips[q].t + 0.6) steady[i] = false;
    var segs = [], beats = [], st = -1;
    for (i = 0; i <= beatT.length; i++) {
      if (i < beatT.length && steady[i]) { if (st < 0) st = i; continue; }
      if (st >= 0 && i - st >= 8) {
        segs.push({ t0: beatT[st], t1: beatT[i - 1] });
        var iv0 = (beatT[i - 1] - beatT[st]) / (i - 1 - st), every = iv0 < 0.36 ? 2 : 1;   // 速い曲は2拍に1回
        for (var b = st; b < i - 1; b += every) beats.push([beatT[b], beatT[Math.min(b + every, i - 1)]]);
      }
      st = -1;
    }
    return { segs: segs, beats: beats };
  }

  function applyRhythm(cmd, rb, duty) {
    var fps = 1000 / FRAME_MS;
    rb.beats.forEach(function (p) {
      var on1 = p[0] + (p[1] - p[0]) * duty, a = Math.floor(on1 * fps), z = Math.floor((p[1] - 0.03) * fps);
      for (var k = a; k < z && k < cmd.length; k++) cmd[k] = 0;      // 0＝電気を切る（惰性で回る）
    });
  }

  function applyPulses(cmd, pulses, amt) {
    var fps = 1000 / FRAME_MS, L = Math.round(0.16 * fps);
    pulses.forEach(function (t) {
      var f = Math.floor(t * fps), v0 = cmd[f]; if (!v0) return;
      var sg = v0 > 0 ? 1 : -1, up = Math.abs(v0) + amt <= 127;
      for (var k = 0; k < L && f + k < cmd.length; k++) {
        var w = 1 - k / L, a = Math.abs(cmd[f + k]);
        cmd[f + k] = sg * (up ? Math.min(127, a + amt * w) : Math.max(20, a - amt * 1.2 * w));
      }
    });
  }

  function buildMotion(stage, flips, speed, revTime, motorLag, pulses, pulseAmt, rhythm, rhythmDuty) {
    var fps = 1000 / FRAME_MS, n = stage.length, mag = [0].concat(speed), cmd = new Float32Array(n), dir = 1, fi = 0;
    var flipF = flips.map(function (f) { return Math.floor(f.t * fps); });
    for (var i = 0; i < n; i++) { while (fi < flipF.length && flipF[fi] <= i) { dir = -dir; fi++; } cmd[i] = mag[stage[i]] * dir; }
    var half = Math.floor(revTime / 2 * fps);
    flipF.forEach(function (f) {
      var a = Math.max(0, f - 2 * half), z = Math.max(0, f - half);
      if (z <= a) return;
      var before = a > 0 ? cmd[a - 1] : 0, after = cmd[Math.min(f, n - 1)];
      for (var k = a; k < z; k++) cmd[k] = before + (0 - before) * (k - a) / (z - a);
      for (k = z; k < f; k++) cmd[k] = after * (k - z) / (f - z);
    });
    if (rhythm && rhythm.beats.length) applyRhythm(cmd, rhythm, rhythmDuty || 0.5);
    if (pulses && pulses.length) applyPulses(cmd, pulses, pulseAmt || 35);
    var tail = Math.min(n, fps);
    for (i = 0; i < tail; i++) cmd[n - tail + i] *= 1 - i / (tail - 1 || 1);
    var shift = Math.round(motorLag * fps), out = new Int8Array(n);
    for (i = 0; i < n; i++) { var v = i + shift < n ? cmd[i + shift] : 0; out[i] = Math.max(-127, Math.min(127, Math.round(v))); }
    return out;
  }

  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  function toBin(cmd, name) {
    var data = new Uint8Array(cmd.buffer.slice(cmd.byteOffset, cmd.byteOffset + cmd.length));
    var buf = new ArrayBuffer(20 + data.length), dv = new DataView(buf);
    [82, 83, 77, 49].forEach(function (c, i) { dv.setUint8(i, c); });   // 'RSM1'
    dv.setUint8(4, 1); dv.setUint8(5, FRAME_MS); dv.setUint8(6, 1); dv.setUint8(7, 0);
    dv.setUint32(8, cmd.length, true);
    dv.setUint32(12, crc32(new TextEncoder().encode(name)), true);
    dv.setUint32(16, crc32(data), true);
    new Uint8Array(buf, 20).set(data);
    return new Uint8Array(buf);
  }

  var DEFAULTS = { attack: 0.08, release: 0.35, th: [-1, 0.45, 0.75], speed: [55, 90, 127], minHold: 2.0,
    reverseTime: 0.6, motorLag: 0.08, noveltyBeats: 16, noveltyDelta: 0.08, accents: true, accentPct: 99.7, pulses: true, pulsePct: 98.2, pulseAmt: 36, smooth: 1.0, rhythm: true, rhythmDuty: 0.5, steadyCv: 0.07 };

  // 重い処理（周波数分析・拍・曲調）は1回だけ。調整は remotion() で即座に作り直す
  async function analyze(pcm, sr, onStep) {
    var step = onStep || function () {};
    step('load', 1);
    await tick();
    var y = resample(pcm, sr);
    step('level', 0);
    await tick();
    var spect = await spectralFeatures(y, function (p) { step('level', p); });
    step('level', 1);
    step('beat', 0); await tick();
    var bt = beatTrack(spect.onset);
    step('beat', 1); await tick();
    return { y: y, duration: y.length / SR, spect: spect, beat: bt };
  }

  function remotion(base, o) {
    var opts = Object.assign({}, DEFAULTS, o || {});
    var level = base.level && base.levelKey === opts.attack + '/' + opts.release ? base.level : levelMeter(base.y, opts.attack, opts.release);
    base.level = level; base.levelKey = opts.attack + '/' + opts.release;
    var stage = toStages(level, opts.th, opts.minHold, opts.smooth);
    var mf = musicFlips(base.spect, base.beat.beats, stage, opts);
    var rhythm = rhythmSections(mf.beatT, stage, mf.flips, opts);
    var pulses = pulseTimes(base.spect, mf.flips, stage, opts).filter(function (t) {
      for (var k = 0; k < rhythm.segs.length; k++) if (t >= rhythm.segs[k].t0 - 0.2 && t <= rhythm.segs[k].t1 + 0.2) return false;   // 刻む場面では弾まない
      return true;
    });
    var cmd = buildMotion(stage, mf.flips, opts.speed, opts.reverseTime, opts.motorLag, pulses, opts.pulseAmt, rhythm, opts.rhythmDuty);
    var share = [0, 0, 0, 0]; for (var i = 0; i < stage.length; i++) share[stage[i]]++;
    return { level: level, stage: stage, flips: mf.flips, pulses: pulses, rhythm: rhythm, beatT: mf.beatT, cmd: cmd, tempo: base.beat.tempo,
      share: share.map(function (v) { return v / stage.length; }), opts: opts };
  }

  var API = { analyze: analyze, remotion: remotion, toBin: toBin, crc32: crc32, DEFAULTS: DEFAULTS, FRAME_MS: FRAME_MS, SR: SR };
  root.RSAnalyzer = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
