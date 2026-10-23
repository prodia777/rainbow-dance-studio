(function () {
  'use strict';
  var A = window.RSAnalyzer, $ = function (id) { return document.getElementById(id); };
  var FPS = 1000 / A.FRAME_MS;

  function store(key, val) { try { if (val === undefined) { var s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return null; } }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600); }
  function fmt(t) { t = Math.max(0, t); var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }
  function fmtShort(t) { var m = Math.floor(t / 60), s = Math.floor(t - m * 60); return m + ':' + (s < 10 ? '0' : '') + s; }
  var NS = 'http://www.w3.org/2000/svg';
  function mk(tag, attrs, parent) { var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; }

  // ================= デジタルメーター（DA-2） =================
  var EDGES = (function () { var e = [], i; for (i = -60; i < -30; i += 3) e.push(i); e.push(-30); for (i = -28; i < -12; i += 2) e.push(i); e.push(-12); for (i = -11; i < -6; i += 1) e.push(i); e.push(-6); for (i = -5.5; i < 0; i += 0.5) e.push(i); e.push(0); return e; })();
  var NSEG = EDGES.length - 1;
  function frac(db) { if (db <= EDGES[0]) return 0; if (db >= EDGES[NSEG]) return 1; for (var k = 0; k < NSEG; k++) if (db <= EDGES[k + 1]) return (k + (db - EDGES[k]) / (EDGES[k + 1] - EDGES[k])) / NSEG; return 1; }
  var ON = { g: 'linear-gradient(180deg,#a5ffcd,#22d97a)', a: 'linear-gradient(180deg,#ffdb8d,#f79a10)', r: 'linear-gradient(180deg,#ffa396,#e21f16)' };
  var GLOW = { g: '0 0 9px rgba(48,235,140,.85),inset 0 0 3px rgba(255,255,255,.7)', a: '0 0 9px rgba(255,170,40,.85),inset 0 0 3px rgba(255,255,255,.65)', r: '0 0 10px rgba(255,60,45,.95),inset 0 0 3px rgba(255,255,255,.65)' };
  var OFF = { g: 'linear-gradient(180deg,#102a1c,#091710)', a: 'linear-gradient(180deg,#2b1d09,#191106)', r: 'linear-gradient(180deg,#2b110d,#180908)' };
  var OFFS = 'inset 0 1px 1px rgba(0,0,0,.85),inset 0 -1px 0 rgba(255,255,255,.03)';
  var HW = 2.15, TIP = 2;
  function pl(arr) { return arr.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '); }
  function Hs(c, x0, x1) { return pl([[x0, c], [x0 + TIP, c - HW], [x1 - TIP, c - HW], [x1, c], [x1 - TIP, c + HW], [x0 + TIP, c + HW]]); }
  function Vs(cx, y0, y1) { return pl([[cx, y0], [cx + HW, y0 + TIP], [cx + HW, y1 - TIP], [cx, y1], [cx - HW, y1 - TIP], [cx - HW, y0 + TIP]]); }
  var SP = { a: Hs(2.2, 3, 21), b: Vs(21.8, 3.5, 19.3), c: Vs(21.8, 22.7, 38.5), d: Hs(39.8, 3, 21), e: Vs(2.2, 22.7, 38.5), f: Vs(2.2, 3.5, 19.3), g: Hs(21, 3, 21) };
  var MINUS = Hs(21, 1, 13), DIG = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' }, ORDER = 'abcdefg'.split('');

  function createDigital(host) {
    host.innerHTML = '';
    var root = document.createElement('div'); root.className = 'da';
    root.innerHTML = '<div class="plate-h" style="padding:0 3px"><div><div class="brand">RAINBOW <b>STICK</b></div><div class="sub">DIGITAL STEREO PEAK METER</div></div><div class="da-meta"><span class="u">dBFS</span><span><i></i>LOCK</span></div></div>';
    host.appendChild(root);
    var ch = {};
    ['L', 'R'].forEach(function (c) {
      var row = document.createElement('div'); row.className = 'da-ch';
      row.innerHTML = '<div class="ch">' + c + '</div><div class="da-scale"></div><div class="da-barw"><div class="da-segs"></div><div class="da-pk"></div></div><div class="da-num"><svg viewBox="0 0 103 44" role="img" aria-label="' + (c === 'L' ? '左' : '右') + 'チャンネルのレベル"></svg><div class="da-ov"><i></i>OVER</div></div>';
      root.appendChild(row);
      var sc = row.querySelector('.da-scale');
      [-60, -30, -12, -6, 0].forEach(function (v) { var s = document.createElement('span'); var p = frac(v) * 100; s.textContent = v; if (v >= -6) s.className = 'hot'; s.style.left = p + '%'; s.style.transform = p > 90 ? 'translateX(-100%)' : (p < 5 ? 'none' : 'translateX(-50%)'); sc.appendChild(s); });
      var segs = row.querySelector('.da-segs'), kids = [];
      for (var k = 0; k < NSEG; k++) { var d = document.createElement('i'); var mid = (EDGES[k] + EDGES[k + 1]) / 2; d.dataset.t = mid <= -15 ? 'g' : (mid <= -6 ? 'a' : 'r'); d.style.background = OFF[d.dataset.t]; d.style.boxShadow = OFFS; segs.appendChild(d); kids.push(d); }
      var svg = row.querySelector('svg'), g = mk('g', { transform: 'translate(0,1)' }, svg), polys = [];
      polys.push(mk('polygon', { points: MINUS }, g));
      [16, 43, 77].forEach(function (x) { var gg = mk('g', { transform: 'translate(' + x + ',0)' }, g); ORDER.forEach(function (sg) { polys.push(mk('polygon', { points: SP[sg] }, gg)); }); });
      var dot = mk('rect', { x: 69.6, y: 35.2, width: 5, height: 5, rx: 1.1 }, g);
      ch[c] = { kids: kids, pk: row.querySelector('.da-pk'), ov: row.querySelector('.da-ov'), polys: polys, dot: dot, cur: -60, peak: -60, pu: 0, cu: 0, lit: -1, key: '' };
    });
    function num(st, v, clip) {
      if (v > 0) v = 0; if (v < -99.9) v = -99.9;
      var a = Math.abs(v), ip = Math.floor(a + 1e-9), th = Math.round((a - ip) * 10); if (th > 9) { th = 0; ip++; }
      var ds = [String(Math.floor(ip / 10)), String(ip % 10), String(th)], key = ds.join('') + (clip ? 'c' : '');
      if (key === st.key) return; st.key = key;
      var lit = clip ? '#ff6f60' : '#ffb347', off = clip ? '#3a1713' : '#241a12';
      st.polys[0].setAttribute('fill', v < -0.04 ? lit : off);
      for (var i = 0; i < 3; i++) for (var s = 0; s < 7; s++) st.polys[1 + i * 7 + s].setAttribute('fill', DIG[ds[i]].indexOf(ORDER[s]) >= 0 ? lit : off);
      st.dot.setAttribute('fill', lit);
    }
    return {
      set: function (dbL, dbR, dt, now) {
        [['L', dbL], ['R', dbR]].forEach(function (p) {
          var st = ch[p[0]], target = Math.max(-60, Math.min(0, p[1]));
          st.cur += (target - st.cur) * (target > st.cur ? 1 - Math.exp(-dt / 0.010) : 1 - Math.exp(-dt / 0.34));
          var lit = Math.round(frac(st.cur) * NSEG);
          if (lit !== st.lit) { for (var k = 0; k < NSEG; k++) { var on = k < lit, t = st.kids[k].dataset.t; if ((st.lit < 0) || (k >= Math.min(lit, st.lit) && k < Math.max(lit, st.lit))) { st.kids[k].style.background = on ? ON[t] : OFF[t]; st.kids[k].style.boxShadow = on ? GLOW[t] : OFFS; } } st.lit = lit; }
          if (st.cur > st.peak) { st.peak = st.cur; st.pu = now + 900; } else if (now > st.pu) st.peak = Math.max(-60, st.peak - dt * 7.5);
          st.pk.style.left = (frac(st.peak) * 100).toFixed(2) + '%'; st.pk.style.opacity = st.peak > -59.5 ? 1 : 0;
          if (st.cur >= -0.15) st.cu = now + 1500;
          var clip = now < st.cu; st.ov.className = 'da-ov' + (clip ? ' on' : '');
          num(st, st.cur, clip);
        });
      }
    };
  }

  // ================= アナログメーター（VU-2） =================
  var SCALE = [[-20, 0], [-10, .23], [-7, .34], [-5, .43], [-3, .53], [-2, .60], [-1, .67], [0, .80], [1, .865], [2, .935], [3, 1]];
  var A0 = -52, SW = 104, PX = 170, PY = 318;
  function polar(r, a) { var rad = a * Math.PI / 180; return [PX + r * Math.sin(rad), PY - r * Math.cos(rad)]; }
  function vuToT(v) { if (v <= -20) return 0; if (v >= 3) return 1; for (var i = 0; i < SCALE.length - 1; i++) { var a = SCALE[i], b = SCALE[i + 1]; if (v >= a[0] && v <= b[0]) return a[1] + (v - a[0]) / (b[0] - a[0]) * (b[1] - a[1]); } return 0; }
  var uid = 0;
  function createAnalog(host) {
    host.innerHTML = '';
    var plate = document.createElement('div'); plate.className = 'plate';
    plate.innerHTML = '<div class="plate-h"><div><div class="brand">RAINBOW <b>STICK</b></div><div class="sub">STEREO LEVEL METER</div></div><div class="pwr"><i></i>POWER</div></div><div class="vu-grid"></div>';
    host.appendChild(plate);
    var grid = plate.querySelector('.vu-grid'), meters = {};
    ['L', 'R'].forEach(function (c) {
      var id = 'vu' + (uid++), wrap = document.createElement('div');
      wrap.innerHTML = '<svg viewBox="0 0 340 340" class="vu-svg" role="img" aria-label="' + (c === 'L' ? '左' : '右') + 'チャンネルのVUメーター"><defs>'
        + '<linearGradient id="bz' + id + '" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0%" stop-color="#9aa0aa"/><stop offset="16%" stop-color="#3a3d44"/><stop offset="48%" stop-color="#71767f"/><stop offset="78%" stop-color="#232529"/><stop offset="100%" stop-color="#555a63"/></linearGradient>'
        + '<radialGradient id="dl' + id + '" cx="50%" cy="16%" r="96%"><stop offset="0%" stop-color="#fdf5dd"/><stop offset="40%" stop-color="#f3ddb2"/><stop offset="76%" stop-color="#e3c68f"/><stop offset="100%" stop-color="#bd9a6a"/></radialGradient>'
        + '<radialGradient id="gl' + id + '" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffe0a3" stop-opacity=".9"/><stop offset="100%" stop-color="#ffe0a3" stop-opacity="0"/></radialGradient>'
        + '<linearGradient id="gs' + id + '" x1="0" y1="0" x2=".5" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity=".42"/><stop offset="26%" stop-color="#fff" stop-opacity=".07"/><stop offset="55%" stop-color="#fff" stop-opacity="0"/></linearGradient>'
        + '<radialGradient id="cp' + id + '" cx="34%" cy="28%" r="75%"><stop offset="0%" stop-color="#f6e7c2"/><stop offset="50%" stop-color="#a1814a"/><stop offset="100%" stop-color="#33260f"/></radialGradient>'
        + '<clipPath id="cl' + id + '"><rect x="7" y="25" width="326" height="304" rx="13"/></clipPath></defs>'
        + '<rect x="1" y="19" width="338" height="316" rx="19" fill="url(#bz' + id + ')"/><rect x="7" y="25" width="326" height="304" rx="13" fill="url(#dl' + id + ')"/>'
        + '<g clip-path="url(#cl' + id + ')"><ellipse class="glow" cx="170" cy="66" rx="152" ry="96" fill="url(#gl' + id + ')" opacity=".5"/><g class="sc"></g>'
        + '<text x="170" y="98" text-anchor="middle" font-size="30" letter-spacing="5" font-weight="600" fill="#5a3d24" opacity=".8">VU</text>'
        + '<rect x="7" y="25" width="326" height="304" fill="url(#gs' + id + ')"/><path d="M18 25 L96 25 L38 329 L7 329 Z" fill="#fff" opacity=".06"/></g>'
        + '<rect x="7" y="25" width="326" height="304" rx="13" fill="none" stroke="rgba(58,38,18,.38)" stroke-width="1"/>'
        + '<g class="needle" transform="rotate(-52 170 318)"><path d="M168.6 326 L169.5 150 L170 146 L170.5 150 L171.4 326 Z" fill="#3f1f10"/><circle cx="170" cy="318" r="11" fill="url(#cp' + id + ')"/><circle cx="170" cy="318" r="11" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1"/><circle cx="170" cy="318" r="3" fill="#2a1c0b" opacity=".55"/></g></svg>'
        + '<div class="vu-foot"><span class="ch">' + c + '</span><span class="vled"></span><span class="pk">PEAK</span></div>';
      grid.appendChild(wrap);
      var g = wrap.querySelector('.sc');
      var p0 = polar(166, A0 + .8 * SW), p1 = polar(166, A0 + SW);
      mk('path', { d: 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A166 166 0 0 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2), fill: 'none', stroke: '#b02a1e', 'stroke-width': 17, opacity: .8 }, g);
      for (var i = 0; i < SCALE.length - 1; i++) for (var k = 1; k < 5; k++) { var t = SCALE[i][1] + (SCALE[i + 1][1] - SCALE[i][1]) * k / 5, a = A0 + t * SW, P = polar(157, a), Q = polar(171, a); mk('line', { x1: P[0].toFixed(2), y1: P[1].toFixed(2), x2: Q[0].toFixed(2), y2: Q[1].toFixed(2), stroke: '#4a3521', 'stroke-width': 1.2, opacity: .6 }, g); }
      var show = { '-20': 1, '-10': 1, '-7': 1, '-5': 1, '-3': 1, '0': 1, '3': 1 };
      SCALE.forEach(function (s) { var a = A0 + s[1] * SW, C = polar(149, a), D = polar(172, a), L = polar(132, a), red = s[0] >= 0, col = red ? '#a8231b' : '#3f2c19'; mk('line', { x1: C[0].toFixed(2), y1: C[1].toFixed(2), x2: D[0].toFixed(2), y2: D[1].toFixed(2), stroke: col, 'stroke-width': red ? 3 : 2.4, 'stroke-linecap': 'round' }, g); if (show[String(s[0])]) { var tx = mk('text', { x: L[0].toFixed(2), y: (L[1] + 7).toFixed(2), 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 700, fill: col }, g); tx.textContent = (s[0] > 0 ? '+' : '') + s[0]; } });
      meters[c] = { needle: wrap.querySelector('.needle'), glow: wrap.querySelector('.glow'), led: wrap.querySelector('.vled'), val: -20, pu: 0 };
    });
    return {
      set: function (vL, vR, dt, now) {
        [['L', vL], ['R', vR]].forEach(function (p) {
          var m = meters[p[0]], target = Math.max(-20, Math.min(3, p[1]));
          m.val += (target - m.val) * (1 - Math.exp(-dt / 0.30));
          m.needle.setAttribute('transform', 'rotate(' + (A0 + vuToT(m.val) * SW).toFixed(2) + ' 170 318)');
          m.glow.setAttribute('opacity', (0.34 + 0.22 * Math.max(0, Math.min(1, (m.val + 20) / 23))).toFixed(3));
          if (m.val > 0.85) m.pu = now + 320;
          m.led.className = 'vled' + (now < m.pu ? ' on' : '');
        });
      }
    };
  }

  // 待機中の自然な揺れ（元のメーターファイルと同じ考え方）
  var simK = { aL: 0, aR: 0, dL: 0, dR: 0 }, t0 = performance.now();
  function simAnalog(ch, t, dt) { var ph = ch === 'L' ? 0 : 1.73, k = 'a' + ch; if (Math.random() < dt * 0.6) simK[k] = 5 + Math.random() * 5.5; simK[k] *= Math.exp(-dt / 0.3); return -9 + 5.4 * Math.sin(t * .83 + ph) + 3.1 * Math.sin(t * 1.71 + ph * 1.7) + 1.7 * Math.sin(t * 3.13 + ph * .6) + simK[k]; }
  function simDigital(ch, t, dt) { var ph = ch === 'L' ? 0 : 2.1, k = 'd' + ch; if (Math.random() < dt * 0.8) simK[k] = 6 + Math.random() * 14; simK[k] *= Math.exp(-dt / 0.35); return -24 + 7.5 * Math.sin(t * .63 + ph) + 3.4 * Math.sin(t * 1.37 + ph * 1.6) + 2.2 * Math.sin(t * .23 + ph * .8) + 1.4 * Math.sin(t * 2.9 + ph * 2.2) + simK[k]; }

  // ================= 画面 =================
  var screens = ['home', 'analyze', 'result', 'adjust'], cur = 'home';
  function show(name) { cur = name; screens.forEach(function (s) { $('scr-' + s).hidden = s !== name; }); window.scrollTo(0, 0); if (name === 'result') { sizeTimeline(); drawTimelineBase(); } }

  var mHome = createDigital($('meter-home')), mAnalog = createAnalog($('meter-analog')), mDig2 = createDigital($('meter-digital')), mPlay = createDigital($('meter-play'));
  var meterMode = store('rs.meter') || 'analog';
  function setMeterMode(m) { meterMode = m; store('rs.meter', m); $('meter-analog').hidden = m !== 'analog'; $('meter-digital').hidden = m !== 'digital'; document.querySelectorAll('[data-meter]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.meter === m ? 'true' : 'false'); }); }
  document.querySelectorAll('[data-meter]').forEach(function (b) { b.addEventListener('click', function () { setMeterMode(b.dataset.meter); }); });
  setMeterMode(meterMode);

  // ================= 曲の読み込みと解析 =================
  var ctx = null, song = null, base = null, res = null, cancelled = false;
  function getCtx() { if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; ctx = new C(); } if (ctx.state === 'suspended') ctx.resume(); return ctx; }

  var STEP_RANGE = { load: [0, 10], level: [10, 70], beat: [70, 82], motion: [82, 100] }, ORDER_ST = ['load', 'level', 'beat', 'motion'];
  function setStep(k, p, note) {
    var idx = ORDER_ST.indexOf(k);
    document.querySelectorAll('.step').forEach(function (el, i) {
      var s = i < idx ? 'done' : (i === idx ? (p >= 1 ? 'done' : 'now') : 'wait');
      el.dataset.s = s; el.querySelector('.dot').textContent = s === 'done' ? '✓' : String(i + 1);
    });
    if (note !== undefined) document.querySelector('.step[data-k="' + k + '"] [data-note]').textContent = note;
    var r = STEP_RANGE[k], pct = Math.round(r[0] + (r[1] - r[0]) * Math.min(1, p));
    $('an-bar').style.width = pct + '%'; $('an-pct').textContent = pct + '%';
    $('an-msg').textContent = { load: '曲を読み込んでいます', level: '音の強さと響きを測っています', beat: '拍とテンポを探しています', motion: '振付を作っています' }[k];
  }
  function resetSteps() { document.querySelectorAll('.step').forEach(function (el, i) { el.dataset.s = 'wait'; el.querySelector('.dot').textContent = String(i + 1); el.querySelector('[data-note]').textContent = ''; }); $('an-bar').style.width = '0%'; $('an-pct').textContent = '0%'; $('an-err').hidden = true; }

  function channelDb(buf) {
    var n = Math.ceil(buf.duration * FPS), out = [], win = Math.round(buf.sampleRate / FPS);
    for (var c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
      var d = buf.getChannelData(c), arr = new Float32Array(n);
      for (var i = 0; i < n; i++) { var s = 0, cnt = 0, a = i * win; for (var j = a; j < a + win && j < d.length; j += 2) { s += d[j] * d[j]; cnt++; } arr[i] = cnt ? 20 * Math.log10(Math.sqrt(s / cnt) * 1.414 + 1e-7) : -90; }
      out.push(arr);
    }
    if (out.length === 1) out.push(out[0]);
    return out;
  }

  async function runAnalysis(name, getBuffer, sampleFile) {
    stopPlay(true);
    cancelled = false; resetSteps(); $('an-name').textContent = name; show('analyze');
    setStep('load', 0);
    var buf;
    try { buf = await getBuffer(); }
    catch (e) { $('an-err').textContent = 'この曲を読み込めませんでした。MP3ファイルか確認して、もう一度選んでください。'; $('an-err').hidden = false; return; }
    if (cancelled) return;
    setStep('load', 1, fmtShort(buf.duration));
    var mono = new Float32Array(buf.length);
    for (var c = 0; c < buf.numberOfChannels; c++) { var d = buf.getChannelData(c); for (var i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels; }
    var t = performance.now();
    var b = await A.analyze(mono, buf.sampleRate, function (k, p) { if (k !== 'load') setStep(k, p); });
    if (cancelled) return;
    setStep('level', 1, Math.round(b.duration * FPS).toLocaleString() + 'コマ');
    setStep('beat', 1, Math.round(b.beat.tempo) + ' BPM');
    setStep('motion', 0);
    await new Promise(function (r) { setTimeout(r, 30); });
    var r = A.remotion(b, currentOpts());
    if (cancelled) return;
    setStep('motion', 1, '切替' + r.flips.length + '回');
    song = { name: name, buf: buf, ch: channelDb(buf), secs: (performance.now() - t) / 1000 };
    base = b; res = r; playOff = 0; paused = false;
    var rec = (store('rs.recent.v1') || []).filter(function (x) { return x.name !== name; });
    rec.unshift({ name: name, dur: buf.duration, tempo: Math.round(r.tempo), flips: r.flips.length, sample: sampleFile || null });
    store('rs.recent.v1', rec.slice(0, 5)); renderRecent();
    await new Promise(function (r2) { setTimeout(r2, 500); });
    if (cancelled) return;
    renderResult(); show('result');
  }

  $('file-mp3').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var ac = getCtx();
    runAnalysis(f.name, function () { return f.arrayBuffer().then(function (ab) { return new Promise(function (ok, ng) { ac.decodeAudioData(ab, ok, ng); }); }); });
    e.target.value = '';
  });
  // サンプル曲（このアプリと一緒に置いてある4曲）
  var SAMPLES_ALL = [
    { file: 'samples/jupiter.mp3', name: 'ホルスト「惑星」より 木星', dur: '8:27' },
    { file: 'samples/aria.mp3', name: 'G線上のアリア', dur: '4:30' },
    { file: 'samples/italy.mp3', name: 'メンデルスゾーン 交響曲第4番「イタリア」第1楽章', dur: '7:32' },
    { file: 'samples/spring.mp3', name: '春', dur: '3:04' }
  ];
  // 同梱するサンプルを絞る（Android版はホルストのみ：window.RS_SAMPLES=['jupiter']）
  var SAMPLES = window.RS_SAMPLES ? SAMPLES_ALL.filter(function (x) { return window.RS_SAMPLES.some(function (k) { return x.file.indexOf(k) >= 0; }); }) : SAMPLES_ALL;
  function analyzeSample(sm) {
    var ac = getCtx();
    runAnalysis(sm.name, function () {
      return fetch(sm.file).then(function (r) { if (!r.ok) throw new Error('not found'); return r.arrayBuffer(); })
        .then(function (ab) { return new Promise(function (ok, ng) { ac.decodeAudioData(ab, ok, ng); }); });
    }, sm.file);
  }
  (function () {
    var w = $('samples');
    SAMPLES.forEach(function (sm) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'recent-item';
      b.style.cssText = 'cursor:pointer;width:100%;text-align:left;font:inherit;color:inherit;min-height:56px';
      b.innerHTML = '<span style="width:36px;height:36px;border-radius:18px;background:linear-gradient(180deg,#FFFFFF 0%,#E3E6EA 100%);color:#121316;box-shadow:inset 0 1px 0 #fff,0 3px 0 #6E737C,0 4px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;flex:none" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span><span style="min-width:0;flex:1;display:flex;flex-direction:column"><span class="nm"></span><span class="mt"></span></span>';
      b.querySelector('.nm').textContent = sm.name; b.querySelector('.mt').textContent = sm.dur;
      b.addEventListener('click', function () { analyzeSample(sm); });
      w.appendChild(b);
    });
  })();
  $('btn-cancel').addEventListener('click', function () { cancelled = true; show(song ? 'result' : 'home'); });

  function makeSample(ac) {
    var sr = 22050, bpm = 120, beat = 60 / bpm, bars = 32, n = Math.floor(sr * beat * 4 * bars) + sr, y = new Float32Array(n);
    function env(L, a, d) { var e = new Float32Array(L); for (var i = 0; i < L; i++) { var t = i / sr; e[i] = Math.min(t / a, 1) * Math.exp(-t / d); } return e; }
    function add(t, s, g) { var i0 = Math.floor(t * sr); for (var i = 0; i < s.length && i0 + i < n; i++) y[i0 + i] += g * s[i]; }
    var L = Math.floor(.3 * sr), kick = new Float32Array(L), ek = env(L, .002, .12), ph = 0;
    for (var i = 0; i < L; i++) { ph += 2 * Math.PI * (120 - 75 * i / L) / sr; kick[i] = Math.sin(ph) * ek[i]; }
    var Ls = Math.floor(.2 * sr), sn = new Float32Array(Ls), es = env(Ls, .001, .06);
    for (i = 0; i < Ls; i++) sn[i] = (Math.random() * 2 - 1) * 1.7 * es[i];
    function tone(f, len) { var N = Math.floor(len * sr), e = env(N, .01, len / 2), o = new Float32Array(N); for (var i = 0; i < N; i++) { var t = i / sr; o[i] = (Math.sin(2 * Math.PI * f * t) + .3 * Math.sin(4 * Math.PI * f * t)) * e[i]; } return o; }
    var chords = [220, 174.6, 196, 164.8], sec = [];
    [[.15, 8], [.4, 4], [.6, 4], [1, 6], [.25, 2], [.5, 2], [1, 4], [.3, 2]].forEach(function (p) { for (var k = 0; k < p[1]; k++) sec.push(p[0]); });
    for (var b = 0; b < bars; b++) {
      var g = sec[b], t0 = b * 4 * beat;
      add(t0, tone(chords[b % 4], 4 * beat), .25 * Math.max(g, .3));
      if (g >= .4) for (var k = 0; k < 4; k++) add(t0 + k * beat, kick, .9 * g);
      if (g >= .6) { add(t0 + beat, sn, .4 * g); add(t0 + 3 * beat, sn, .4 * g); for (k = 0; k < 8; k++) add(t0 + k * beat / 2, tone(chords[b % 4] / 2, beat / 2), .3 * g); }
    }
    var mx = 0; for (i = 0; i < n; i++) mx = Math.max(mx, Math.abs(y[i])); for (i = 0; i < n; i++) y[i] /= mx * 1.1;
    var buf = ac.createBuffer(1, n, sr); buf.getChannelData(0).set(y); return buf;
  }

  function renderRecent() {
    var rec = store('rs.recent.v1') || [], w = $('recent'); w.innerHTML = '';
    $('recent-wrap').hidden = !rec.length;
    rec.forEach(function (r) {
      var d = document.createElement('button'); d.type = 'button'; d.className = 'recent-item';
      d.style.cssText = 'cursor:pointer;width:100%;text-align:left;font:inherit;color:inherit;min-height:56px';
      d.innerHTML = '<span style="display:flex;align-items:flex-end;gap:3px;flex:none" aria-hidden="true"><i style="width:4px;height:10px;border-radius:2px;background:var(--low);display:block"></i><i style="width:4px;height:18px;border-radius:2px;background:var(--mid);display:block"></i><i style="width:4px;height:24px;border-radius:2px;background:var(--high);display:block"></i></span><span style="min-width:0;flex:1;display:flex;flex-direction:column"><span class="nm"></span><span class="mt"></span></span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex:none;opacity:.6" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
      d.querySelector('.nm').textContent = r.name;
      d.querySelector('.mt').textContent = fmtShort(r.dur) + ' · ' + r.tempo + ' BPM · 切替 ' + r.flips + '回';
      d.addEventListener('click', function () {
        var sm = r.sample && SAMPLES.filter(function (x) { return x.file === r.sample; })[0];
        if (sm) { analyzeSample(sm); return; }
        // 端末内の曲はブラウザの決まりで自動では開けないため、同じ曲を選び直してもらう
        toast('「' + r.name + '」をもう一度選んでください');
        $('file-mp3').click();
      });
      w.appendChild(d);
    });
  }
  renderRecent();

  // ================= 調整 =================
  var INT = { 1: [.60, .88], 2: [.52, .82], 3: [.45, .75], 4: [.38, .66], 5: [.30, .56] }, INTN = { 1: 'とてもおだやか', 2: 'おだやか', 3: 'ふつう', 4: 'はげしい', 5: 'とてもはげしい' };
  var NOV = { 1: .16, 2: .12, 3: .08, 4: .05, 5: .03 }, ACC = { 1: 99.95, 2: 99.85, 3: 99.7, 4: 99.4, 5: 99.0 }, LV = { 1: '低い', 2: 'やや低い', 3: 'ふつう', 4: 'やや高い', 5: '高い' };
  var PUL = { 1: [99.3, 22], 2: [98.8, 28], 3: [98.2, 36], 4: [97.5, 44], 5: [96.5, 54] }, PULN = { 1: '控えめ', 2: 'やや控えめ', 3: 'ふつう', 4: 'やや大きく', 5: '大きく・多く' };
  var DEF = { int: 3, nov: 3, acc: true, accs: 3, low: 55, mid: 90, high: 127, rev: 6, lag: 80, spk: 0, pul: true, puls: 3, rhy: true, rhyd: 2, preset: 'normal' };
  var RHY = { 1: 0.7, 2: 0.58, 3: 0.48, 4: 0.4, 5: 0.32 }, RHYN = { 1: 'やわらかく', 2: 'やや柔らかく', 3: 'ふつう', 4: 'ややくっきり', 5: 'くっきり' };
  // 演出：動きのコントラストをまとめて切り替える
  var PRESETS = {
    calm:     { label: 'Relax', desc: 'ゆったり回り、向き替えは大きな場面の変化だけ。弾みなし。', v: { int: 1, nov: 1, acc: false, accs: 1, low: 40, mid: 65, high: 95, pul: false, puls: 1, rhy: false, rhyd: 1 } },
    normal:   { label: 'Standard', desc: '曲調の変わり目と強いアクセントで向きを変え、強い拍で弾みます。', v: { int: 3, nov: 3, acc: true, accs: 3, low: 55, mid: 90, high: 127, pul: true, puls: 3, rhy: true, rhyd: 2 } },
    contrast: { label: 'Dramatic', desc: '静かな所はとてもゆっくり、盛り上がりは全開。速さの差を大きくします。', v: { int: 2, nov: 3, acc: true, accs: 2, low: 26, mid: 72, high: 127, pul: true, puls: 4, rhy: true, rhyd: 3 } },
    wild:     { label: 'Powerful', desc: '全体に速く、小さな変化やアクセントでもどんどん向きを変え、よく弾みます。', v: { int: 5, nov: 5, acc: true, accs: 5, low: 75, mid: 108, high: 127, pul: true, puls: 5, rhy: true, rhyd: 4 } }
  };
  var S = Object.assign({}, DEF, store('rs.opts.v1') || {});
  function currentOpts() { var th = INT[S.int]; return { th: [-1, th[0], th[1]], speed: [S.low, S.mid, S.high], reverseTime: S.rev / 10, motorLag: S.lag / 1000, noveltyDelta: NOV[S.nov], accents: S.acc, accentPct: ACC[S.accs], minHold: 2.0, pulses: S.pul, pulsePct: PUL[S.puls][0], pulseAmt: PUL[S.puls][1], rhythm: S.rhy !== false, rhythmDuty: RHY[S.rhyd || 2] }; }
  function syncCtl() {
    $('a-int').value = S.int; $('a-int-v').textContent = INTN[S.int];
    $('a-nov').value = S.nov; $('a-nov-v').textContent = LV[S.nov];
    $('a-acc').checked = S.acc; $('a-accs').value = S.accs; $('a-accs').disabled = !S.acc; $('a-accs-v').textContent = S.acc ? LV[S.accs] : '使わない';
    ['low', 'mid', 'high'].forEach(function (k) { $('a-' + k).value = S[k]; $('a-' + k + '-v').textContent = S[k]; });
    $('a-rev').value = S.rev; $('a-rev-v').textContent = (S.rev / 10).toFixed(1) + ' 秒';
    $('a-lag').value = S.lag; $('a-lag-v').textContent = S.lag + ' ms';
    $('a-pul').checked = S.pul; $('a-puls').value = S.puls; $('a-puls').disabled = !S.pul; $('a-puls-v').textContent = S.pul ? PULN[S.puls] : '使わない';
    $('a-rhy').checked = S.rhy !== false; $('a-rhyd').value = S.rhyd || 2; $('a-rhyd').disabled = S.rhy === false; $('a-rhyd-v').textContent = S.rhy === false ? '使わない' : RHYN[S.rhyd || 2];
    $('a-spk').value = S.spk; $('a-spk-v').textContent = (S.spk > 0 ? '+' : '') + S.spk + ' ms';
  }
  ['int', 'nov', 'accs', 'low', 'mid', 'high', 'rev', 'lag', 'spk', 'puls', 'rhyd'].forEach(function (k) { $('a-' + k).addEventListener('input', function (e) { S[k] = +e.target.value; if (k !== 'rev' && k !== 'lag' && k !== 'spk') S.preset = null; syncCtl(); store('rs.opts.v1', S); }); });
  $('a-rhy').addEventListener('change', function (e) { S.rhy = e.target.checked; S.preset = null; syncCtl(); store('rs.opts.v1', S); });
  $('a-pul').addEventListener('change', function (e) { S.pul = e.target.checked; S.preset = null; syncCtl(); store('rs.opts.v1', S); });
  $('a-acc').addEventListener('change', function (e) { S.acc = e.target.checked; S.preset = null; syncCtl(); store('rs.opts.v1', S); });
  syncCtl();
  $('btn-reset').addEventListener('click', function () { S = Object.assign({}, DEF); syncCtl(); syncPreset(); store('rs.opts.v1', S); toast('最初の設定に戻しました'); });
  $('btn-redo').addEventListener('click', function () {
    if (!base) return;
    stopPlay(true);
    res = A.remotion(base, currentOpts()); playOff = 0;
    renderResult(); syncPreset(); show('result'); toast('振付を作り直しました（切替 ' + res.flips.length + '回）');
  });
  $('btn-adjust').addEventListener('click', function () { stopPlay(false); show('adjust'); });
  $('btn-back-result').addEventListener('click', function () { show(base ? 'result' : 'home'); });
  $('btn-back-home').addEventListener('click', function () { stopPlay(false); show('home'); });

  // ================= 演出ボタン =================
  function syncPreset() {
    document.querySelectorAll('[data-preset]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.preset === S.preset ? 'true' : 'false'); });
    $('preset-desc').textContent = S.preset ? PRESETS[S.preset].desc : '調整画面で細かく変えた設定です。';
  }
  document.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (play.on) return;
      var p = PRESETS[b.dataset.preset]; Object.assign(S, p.v); S.preset = b.dataset.preset; store('rs.opts.v1', S); syncCtl(); syncPreset();
      if (!base) return;
      res = A.remotion(base, currentOpts());          // 再生中でもそのまま新しい振付に切り替わる
      renderResult(); sizeTimeline(); drawTimelineBase();
      toast('演出：' + p.label + '（切替 ' + res.flips.length + '回・弾み ' + res.pulses.length + '回）');
    });
  });
  syncPreset();

  // ================= 結果 =================
  var STN = ['停止', '低速', '中速', '高速'], STC = ['#3A3E45', '#34D399', '#FBBF24', '#F87171'];
  function renderResult() {
    $('rs-meta').textContent = song.name + ' · ' + fmtShort(song.buf.duration) + ' · ' + Math.round(res.tempo) + ' BPM';
    var nk = res.flips.filter(function (f) { return f.k === '曲調'; }).length;
    $('tl-info').textContent = '切替 ' + res.flips.length + '回（曲調 ' + nk + '・アクセント ' + (res.flips.length - nk) + '）・弾み ' + (res.pulses ? res.pulses.length : 0) + '回・刻み ' + (res.rhythm ? res.rhythm.beats.length : 0) + '回';
    var st = $('stats'); st.innerHTML = '';
    [1, 2, 3].forEach(function (k) { var d = document.createElement('div'); d.className = 'stat'; d.innerHTML = '<b style="color:' + STC[k] + '">' + Math.round(res.share[k] * 100) + '%</b><span>' + STN[k] + '</span>'; st.appendChild(d); });
    var d2 = document.createElement('div'); d2.className = 'stat'; d2.innerHTML = '<b>' + song.secs.toFixed(1) + '秒</b><span>解析時間</span>'; st.appendChild(d2);
    $('clock').textContent = fmt(playOff); updateChips(playOff);
  }

  // タイムライン
  var tlBase = null, tlGutter = 0;
  function sizeTimeline() { var c = $('tl'), w = c.clientWidth || 380, dpr = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(w * dpr); c.height = Math.round(120 * dpr); }
  function drawTimelineBase() {
    if (!res) return;
    var c = $('tl'), W = c.width, H = c.height, s = H / 120;
    tlBase = document.createElement('canvas'); tlBase.width = W; tlBase.height = H;
    var g = tlBase.getContext('2d'), n = res.cmd.length;
    g.fillStyle = '#16171b'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#A3A7AE'; g.font = (10 * s) + 'px ' + getComputedStyle(document.body).fontFamily;
    var G = Math.round(30 * s); tlGutter = G;
    g.fillText('速さ', 0, 44 * s); g.fillText('向き', 0, 94 * s);
    var top = 14 * s, sh = 50 * s, dy = 82 * s, dh = 16 * s, hgt = [0, 0.33, 0.66, 1], PW = W - G;
    for (var x = G; x < W; x++) {
      var i = Math.min(n - 1, Math.floor((x - G) / PW * n)), stg = res.stage[i], v = res.cmd[i];
      g.fillStyle = STC[stg]; var h = Math.max(2 * s, sh * hgt[stg]); g.fillRect(x, top + sh - h, 1, h);
      g.fillStyle = v > 0 ? '#FF9F43' : (v < 0 ? '#3B82F6' : '#3A3E45'); g.fillRect(x, dy, 1, dh);
    }
    res.flips.forEach(function (f) { var xx = G + Math.round(f.t * FPS / n * PW); g.fillStyle = f.k === '曲調' ? 'rgba(242,240,234,.85)' : '#FFB020'; g.fillRect(xx, top - 2 * s, Math.max(1, s), dy + dh - top + 2 * s); });
    g.fillStyle = '#A78BFA';
    ((res.rhythm && res.rhythm.segs) || []).forEach(function (sg) { var x0 = G + Math.round(sg.t0 * FPS / n * PW), x1 = G + Math.round(sg.t1 * FPS / n * PW); g.fillRect(x0, top - 9 * s, Math.max(2, x1 - x0), 4 * s); });
    g.fillStyle = 'rgba(242,240,234,.9)';
    (res.pulses || []).forEach(function (t) { var xp = G + Math.round(t * FPS / n * PW); g.beginPath(); g.arc(xp, dy - 4 * s, 1.6 * s, 0, 2 * Math.PI); g.fill(); });
    g.fillStyle = '#A3A7AE'; g.font = (10 * s) + 'px JetBrains Mono, monospace';
    var dur = n / FPS, step = dur > 400 ? 120 : (dur > 150 ? 60 : 30);
    for (var t = 0; t <= dur; t += step) { var xt = G + t / dur * PW; g.fillText(fmtShort(t), Math.min(xt, W - 30 * s), 114 * s); }
  }
  function drawTimeline(pos) {
    var c = $('tl'); if (!tlBase || !res) return;
    var g = c.getContext('2d'); g.drawImage(tlBase, 0, 0);
    var x = tlGutter + Math.round(pos * FPS / res.cmd.length * (c.width - tlGutter));
    g.fillStyle = '#FFFFFF'; g.fillRect(x - 1, 0, 2, c.height * 0.85);
  }
  $('tl').addEventListener('click', function (e) {
    if (!res) return;
    var r = e.currentTarget.getBoundingClientRect(), gx = tlGutter / e.currentTarget.width * r.width, t = Math.max(0, Math.min(1, (e.clientX - r.left - gx) / (r.width - gx))) * res.cmd.length / FPS;
    var wasPlaying = play.on; stopPlay(false); playOff = t; $('clock').textContent = fmt(t); updateChips(t);
    if (wasPlaying) startPlay();
  });
  window.addEventListener('resize', function () { if (cur === 'result') { sizeTimeline(); drawTimelineBase(); } });

  // ================= 再生とスタート信号（基板はシミュレーション） =================
  var play = { on: false }, playOff = 0, wake = null, paused = false;   // paused＝一時停止中（曲の途中。基板の振付はそのまま）
  // 予約した時刻（音を出す処理の時刻）をスマホの時計に直す。ここにスピーカーの遅れを足した時刻に音が聞こえる
  function ctxToPerf(ct) { return performance.now() + (ct - ctx.currentTime) * 1000; }
  function startPlay() {
    if (!song) return;
    setDemo(null);
    var ac = getCtx();
    if (playOff >= song.buf.duration - 0.05) playOff = 0;
    var src = ac.createBufferSource(); src.buffer = song.buf; src.connect(ac.destination);
    var lead = 0.3, when = ac.currentTime + lead;
    src.start(when, playOff);
    var autoLat = (ac.outputLatency || ac.baseLatency || 0) * 1000, lat = Math.max(0, autoLat + S.spk);
    var sigPerf = ctxToPerf(when);
    play = { on: true, src: src, when: when, off: playOff, sigPerf: sigPerf, boardStart: sigPerf + lat, autoLat: autoLat, lat: lat, clickPerf: performance.now() };
    src.onended = function () { if (play.src === src && play.on) { var endPos = audioPos(); if (endPos >= song.buf.duration - 0.2) { play.on = false; playOff = 0; paused = false; setPlayIcon(false); $('chip-dir').textContent = '終了'; } } };
    $('sy-sig').textContent = '予約 ' + Math.round(lead * 1000) + ' ms後・' + fmt(playOff) + 'から';
    $('sy-lat').textContent = Math.round(autoLat) + (S.spk ? (S.spk > 0 ? ' + ' : ' − ') + Math.abs(S.spk) : '') + ' ms';
    setPlayIcon(true);
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () { }); } catch (e) { }
  }
  function stopPlay(reset) {
    if (play.on) { playOff = Math.max(0, Math.min(song ? song.buf.duration : 0, audioPos())); try { play.src.stop(); } catch (e) { } paused = true; }
    if (reset) { playOff = 0; paused = false; }
    play.on = false; setPlayIcon(false);
    if (wake) { try { wake.release(); } catch (e) { } wake = null; }
  }
  // いま聞こえている音の位置（端末が報告する「出力中の時刻」から求める）
  function audioPos() {
    if (!play.on) return playOff;
    try { if (ctx.getOutputTimestamp) { var ts = ctx.getOutputTimestamp(); if (ts && ts.performanceTime > 0) return play.off + (ts.contextTime - play.when) + (performance.now() - ts.performanceTime) / 1000; } } catch (e) { }
    return play.off + (ctx.currentTime - play.when) - (ctx.outputLatency || 0);
  }
  function boardPos(now) { return play.off + (now - play.boardStart) / 1000; }
  function setPlayIcon(on) {
    // 曲の途中は振付（基板へ転送済み）を変えられないようにする
    // 一時停止中も同じ振付の続きから再開するので変更不可。STOP（曲の初めへ）か曲の終わりで解除
    var lock = on || paused;
    document.querySelectorAll('[data-preset]').forEach(function (b) { b.disabled = lock; });
    $('btn-adjust').disabled = lock;
    $('preset-lock').hidden = !lock;
    $('lbl-play').textContent = on ? 'PAUSE' : 'PLAY';
    $('btn-play').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('ico-play').toggleAttribute('hidden', on); $('ico-pause').toggleAttribute('hidden', !on); $('btn-play').setAttribute('aria-label', on ? '一時停止（基板へ停止信号）' : '再生（基板へスタート信号）'); }
  $('btn-play').addEventListener('click', function () { if (play.on) stopPlay(false); else startPlay(); });
  $('btn-rewind').addEventListener('click', function () { setDemo(null); stopPlay(true); $('clock').textContent = fmt(0); var cd = $('chip-dir'); cd.textContent = '停止'; cd.style.background = '#2A2D33'; cd.style.color = 'var(--soft)'; $('chip-spd').hidden = true; toast('停止して曲の初めに戻りました'); });

  function updateChips(pos, waiting) {
    if (!res) return;
    var i = Math.max(0, Math.min(res.cmd.length - 1, Math.floor(pos * FPS))), v = res.cmd[i], stg = res.stage[i];
    var cd = $('chip-dir'), cs = $('chip-spd');
    if (waiting) { cd.textContent = '音を待っています'; cd.style.background = '#2A2D33'; cd.style.color = 'var(--soft)'; cs.hidden = true; return; }
    var inR = false; ((res.rhythm && res.rhythm.segs) || []).forEach(function (sg) { if (pos >= sg.t0 - 0.1 && pos <= sg.t1 + 0.5) inR = true; });
    if (v === 0) { cd.textContent = inR ? '電気オフ（惰性）' : '反転中'; cd.style.background = '#2A2D33'; cd.style.color = 'var(--soft)'; }
    else { cd.textContent = v > 0 ? '右回転' : '左回転'; cd.style.background = v > 0 ? '#FF9F43' : '#3B82F6'; cd.style.color = v > 0 ? '#121316' : '#fff'; }
    cs.hidden = false; cs.textContent = STN[stg]; cs.style.background = '#26292F'; cs.style.color = STC[stg];
  }

  // 仮想Rainbow Stick
  var stickV = 0, stickA = 0, stickShape = 0, shapeVel = 0, twist = 0, twistV = 0, tw8 = 0, tw8V = 0;
  function drawStick(dt, target) {
    var c = $('stick'), g = c.getContext('2d'), W = c.width, H = c.height, cx = W / 2;
    var prevV = stickV;
    // 電気を切る(0)と惰性でゆっくり減速、弱めると中くらい、加速・逆転は速い
    var tauV = target === 0 ? 1.1 : ((Math.sign(target) === Math.sign(stickV) && Math.abs(target) < Math.abs(stickV)) ? 0.4 : 0.15);
    stickV += (target - stickV) * (1 - Math.exp(-dt / tauV));
    var acc = (stickV - prevV) / Math.max(dt, 0.004);
    // フィルムの下端は自由端：回転の変化に遅れてねじれ、揺れ戻る（反転で大きくねじれる）
    // ・回転中の空気抵抗による小さなねじれ（下ほど遅れる）
    var twT = Math.max(-0.8, Math.min(0.8, -0.35 * stickV));
    twistV += ((twT - twist) * 35 - twistV * 8) * dt; twist += twistV * dt;
    // ・反転時の「8の字」：上半分は新しい向きへ、下半分は前の向きのまま遅れて、中央で交差してくびれる
    var t8 = Math.max(-3.1, Math.min(3.1, -0.55 * acc));
    tw8V += ((t8 - tw8) * 16 - tw8V * 3.4) * dt; tw8 += tw8V * dt;
    stickA += stickV * 1.6 * 2 * Math.PI * dt;
    g.clearRect(0, 0, W, H);
    var bg = g.createRadialGradient(cx, H * 0.35, 10, cx, H * 0.4, H * 0.75); bg.addColorStop(0, '#1d1f25'); bg.addColorStop(1, '#0d0e11'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 上端は固定。下端は軸に沿って自由に動き、速く回るほど横に広がって下端が上がる（形は速さより少し遅れて変わる）
    // 浮き上がりにも慣性（少し行き過ぎて戻る）
    shapeVel += ((Math.abs(stickV) - stickShape) * 30 - shapeVel * 7) * dt; stickShape = Math.max(0, Math.min(1.12, stickShape + shapeVel * dt));
    // 遠心力は回転の2乗で強くなるので、低速ではあまり膨らまず、高速で一気に上で膨らむ
    var sp = Math.pow(Math.max(0, Math.min(1.08, (stickShape - 0.2) / 0.8)), 1.3);
    // フィルムの長さは一定：下端が上がった分だけ外へ膨らむ（半楺円の周長で近似）
    var yt = 34, hgt = Math.max(52, 250 - 185 * sp), yb = yt + hgt, half = hgt / 2, LS = 92;
    var Rm = Math.sqrt(Math.max(400, 2 * LS * LS - half * half));
    var pinch = Math.min(0.88, Math.abs(tw8) / 2.6);
    function R(u) { return Rm * Math.pow(Math.sin(Math.PI * u), 0.9) * (1 - pinch * Math.exp(-Math.pow((u - 0.5) / 0.12, 2))); }
    function phase(u) { return twist * Math.pow(u, 1.4) + tw8 * 0.5 * (1 + Math.tanh((u - 0.5) / 0.07)); }
    var speed = Math.abs(stickV);
    g.fillStyle = 'rgba(232,241,242,' + (0.05 + 0.08 * speed) + ')';
    g.beginPath(); for (var k = 0; k <= 40; k++) { var u = k / 40; g.lineTo(cx - R(u), yt + u * (yb - yt)); } for (k = 40; k >= 0; k--) { u = k / 40; g.lineTo(cx + R(u), yt + u * (yb - yt)); } g.closePath(); g.fill();
    var N = 48;   // 実物と同じ48本
    for (var pass = 0; pass < 2; pass++) for (var m = 0; m < N; m++) {
      var phi = stickA + m * 2 * Math.PI / N, z = Math.cos(phi + phase(0.3)), front = z > 0;
      if ((pass === 0) === front) continue;
      g.strokeStyle = 'hsla(' + ((m * 7.5 + 190) % 360) + ',85%,68%,' + (front ? 0.18 + 0.55 * z : 0.07) + ')';
      g.lineWidth = front ? 1.3 : 0.8; g.beginPath();
      for (k = 0; k <= 40; k++) { u = k / 40; g.lineTo(cx + R(u) * Math.sin(phi + phase(u)), yt + u * (yb - yt)); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(230,225,214,.55)'; g.lineWidth = 1.6; g.beginPath(); for (k = 0; k <= 40; k++) { u = k / 40; g.lineTo(cx - R(u), yt + u * (yb - yt)); } g.stroke();
    g.beginPath(); for (k = 0; k <= 40; k++) { u = k / 40; g.lineTo(cx + R(u), yt + u * (yb - yt)); } g.stroke();
    g.strokeStyle = '#C9B48A'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, 18); g.lineTo(cx, 312); g.stroke();
    g.fillStyle = '#D9C79E'; g.fillRect(cx - 7, yt - 5, 14, 8); g.fillRect(cx - 8, yb - 3, 16, 9);
    g.fillStyle = '#2A2D33'; g.fillRect(cx - 46, 312, 92, 26); g.fillStyle = '#3A3E45'; g.fillRect(cx - 46, 312, 92, 4);
    if (speed > 0.03) {
      var dir = stickV > 0 ? 1 : -1, col = dir > 0 ? '255,159,67' : '59,130,246';
      g.strokeStyle = 'rgba(' + col + ',' + Math.min(1, 0.3 + speed) + ')'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.ellipse(cx, 290, 70, 12, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      var ax = dir > 0 ? cx - 70 * Math.cos(0.15 * Math.PI) : cx + 70 * Math.cos(0.15 * Math.PI), ay = 290 + 12 * Math.sin(0.15 * Math.PI);
      g.beginPath(); g.moveTo(ax + dir * -2, ay); g.lineTo(ax + dir * 10, ay - 10); g.moveTo(ax + dir * -2, ay); g.lineTo(ax + dir * 12, ay + 4); g.stroke();
    }
  }

  // ================= 動きの確認（音なし） =================
  var demo = null, DEMO_LEN = { low: 5, mid: 5, high: 6, rev: 8, pulse: 6, tick: 7 };
  function demoTarget(d, t) {
    var lv = { low: S.low / 127, mid: S.mid / 127, high: S.high / 127 };
    if (lv[d.type] !== undefined) return lv[d.type];
    if (d.type === 'rev') { var seg = Math.floor(t / 2.6), ph = t - seg * 2.6, sgn = seg % 2 ? -1 : 1, rv = S.rev / 10; if (ph < rv / 2 && seg > 0) return -sgn * lv.high * (1 - ph / (rv / 2)); if (ph < rv && seg > 0) return sgn * lv.high * ((ph - rv / 2) / (rv / 2)); return sgn * lv.high; }
    if (d.type === 'tick') { var pr = 0.5, ph2 = t % pr; return ph2 < pr * RHY[S.rhyd || 2] ? lv.mid : 0; }
    if (d.type === 'pulse') { var bt = t % 0.5, amt = PUL[S.puls][1] / 127; return Math.min(1, lv.mid + (bt < 0.16 ? amt * (1 - bt / 0.16) : 0)); }
    return 0;
  }
  function setDemo(type) {
    document.querySelectorAll('[data-demo]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.demo === type ? 'true' : 'false'); });
    demo = type ? { type: type, t0: performance.now() } : null;
  }
  document.querySelectorAll('[data-demo]').forEach(function (b) { b.addEventListener('click', function () { if (play.on) stopPlay(false); setDemo(demo && demo.type === b.dataset.demo ? null : b.dataset.demo); }); });

  // ================= 書き出し（zip：.bin と .csv） =================
  function zip(files) {
    var enc = new TextEncoder(), parts = [], cent = [], off = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = A.crc32(f.data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, f.data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      cent.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + f.data.length;
    });
    var csize = cent.reduce(function (a, p) { return a + p.length; }, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(cent).concat([new Uint8Array(e.buffer)]), { type: 'application/zip' });
  }
  $('btn-export').addEventListener('click', async function () {
    if (!res) return;
    var stem = song.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
    var lines = ['時間[秒],音の強さ(0-1),速さ段階,向き,出力値(-127〜127)'];
    for (var i = 0; i < res.cmd.length; i++) { var v = res.cmd[i]; lines.push((i / FPS).toFixed(2) + ',' + res.level[i].toFixed(3) + ',' + STN[res.stage[i]] + ',' + (v > 0 ? '右' : (v < 0 ? '左' : '電気オフ(惰性)')) + ',' + v); }
    var csv = new Uint8Array([0xEF, 0xBB, 0xBF].concat(Array.from(new TextEncoder().encode(lines.join('\r\n')))));
    var blob = zip([{ name: stem + '_motion.bin', data: A.toBin(res.cmd, song.name) }, { name: stem + '_motion.csv', data: csv }]);
    // Androidアプリ：スマホの「Documents/RainbowDanceStudio」フォルダに保存
    var cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
    if (cap) {
      try {
        var b64 = await new Promise(function (ok, ng) { var fr = new FileReader(); fr.onload = function () { ok(String(fr.result).split(',')[1]); }; fr.onerror = ng; fr.readAsDataURL(blob); });
        await cap.writeFile({ path: 'RainbowDanceStudio/' + stem + '_motion.zip', data: b64, directory: 'DOCUMENTS', recursive: true });
        toast('Documents/RainbowDanceStudio に保存しました');
      } catch (e) { toast('保存できませんでした（' + (e && e.message ? e.message : 'エラー') + '）'); }
      return;
    }
    var dl = null; try { dl = await window.claude.use('downloads'); } catch (e) { }
    if (!dl) { toast('この画面では書き出しが使えません'); return; }
    try { await dl.save({ filename: stem + '_motion.zip', data: blob }); toast('書き出しました'); }
    catch (e) { if (e && e.code === 'declined') return; toast(e && e.code === 'rate_limited' ? '少し待ってからもう一度押してください' : '書き出せませんでした'); }
  });

  // ================= 毎フレーム =================
  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.06), t = (now - t0) / 1000; last = now;
    if (cur === 'home') mHome.set(simDigital('L', t, dt), simDigital('R', t, dt), dt, now);
    else if (cur === 'analyze') {
      if (meterMode === 'analog') mAnalog.set(simAnalog('L', t, dt), simAnalog('R', t, dt), dt, now);
      else mDig2.set(simDigital('L', t, dt), simDigital('R', t, dt), dt, now);
    } else if (cur === 'result' && res) {
      var target = 0, pos = playOff;
      if (play.on) {
        var bp = boardPos(now), ap = audioPos();
        pos = Math.max(0, ap);
        if (bp < play.off) { updateChips(play.off, true); $('sy-board').textContent = '待機 ' + Math.round((play.off - bp) * 1000) + ' ms'; }
        else {
          var i = Math.min(res.cmd.length - 1, Math.floor(bp * FPS)); target = res.cmd[i] / 127; updateChips(bp);
          $('sy-board').textContent = fmt(bp);
        }
        $('sy-audio').textContent = ap < play.off ? '— 音が出る前' : fmt(ap);
        if (ap >= play.off && bp >= play.off) { var df0 = (bp - ap) * 1000; play.df = play.df === undefined ? df0 : play.df + (df0 - play.df) * 0.1; var df = play.df; $('sy-diff').textContent = (df >= 0 ? '+' : '−') + Math.abs(df).toFixed(0) + ' ms'; }
        $('clock').textContent = fmt(pos);
        var ci = Math.min(song.ch[0].length - 1, Math.floor(Math.max(0, ap) * FPS));
        mPlay.set(ap >= 0 ? song.ch[0][ci] : -60, ap >= 0 ? song.ch[1][ci] : -60, dt, now);
      } else {
        mPlay.set(-60, -60, dt, now);
        if (demo) {
          var dtm = (now - demo.t0) / 1000;
          if (dtm > DEMO_LEN[demo.type]) setDemo(null);
          else { target = demoTarget(demo, dtm); var cd = $('chip-dir'); cd.textContent = target > 0 ? '右回転' : (target < 0 ? '左回転' : '反転中'); cd.style.background = target > 0 ? '#FF9F43' : (target < 0 ? '#3B82F6' : '#2A2D33'); cd.style.color = target > 0 ? '#121316' : '#fff'; $('chip-spd').hidden = false; $('chip-spd').textContent = '確認中'; $('chip-spd').style.color = 'var(--soft)'; }
        }
      }
      drawStick(dt, target);
      drawTimeline(pos);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Androidの「戻る」ボタン：前の画面へ（最初の画面ではアプリを閉じる）
  try {
    var CapApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (CapApp) CapApp.addListener('backButton', function () {
      if (cur === 'adjust') show('result');
      else if (cur === 'result') { stopPlay(false); show('home'); }
      else if (cur === 'analyze') { cancelled = true; show(song ? 'result' : 'home'); }
      else CapApp.exitApp();
    });
  } catch (e) { }
  document.addEventListener('visibilitychange', function () { if (document.hidden && play.on) stopPlay(false); });
})();
