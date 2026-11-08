(() => {
  'use strict';
  const R = window.RESUME;
  const Sound = window.Sound;

  // ---------- constants ----------
  const W = 320, H = 180, GY = 150;               // world viewport and ground line
  const GRAV = 900, JV = 300, V_AUTO = 84, V_MAN = 110;
  const AIR = 2 * JV / GRAV;                      // time in the air for a full jump
  const JD = V_AUTO * AIR;                        // horizontal jump distance on autopilot
  const FONT = '"Press Start 2P", monospace';
  const $ = (s) => document.querySelector(s);

  const hash = (n) => {
    n = Math.imul((n | 0) ^ 0x27d4eb2d, 0x9e3779b1); n ^= n >>> 15;
    n = Math.imul(n, 0x85ebca6b); n ^= n >>> 13; return (n >>> 0) / 4294967296;
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return 'rgb(' + A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',') + ')'; };

  // ---------- canvases ----------
  const view = $('#view'), vctx = view.getContext('2d');
  const buf = document.createElement('canvas'); buf.width = W; buf.height = H;
  let ctx = buf.getContext('2d');
  let S = 1;
  function resize() {
    const r = view.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.width = Math.max(1, Math.round(r.width * dpr));
    view.height = Math.max(1, Math.round(r.height * dpr));
    S = view.width / W;
    document.documentElement.style.setProperty('--u', (r.width / 100) + 'px');
  }
  new ResizeObserver(resize).observe(view);

  // ---------- pixel helpers ----------
  let BA = 1; // base alpha of the theme layer being drawn
  const alpha = (a) => { ctx.globalAlpha = BA * a; };
  const rect = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  function disc(cx, cy, r) {
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
    }
  }
  function line(x0, y0, x1, y1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let n = 0; n < 600; n++) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  function sprite(rows, pal) {
    const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
    const g = c.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '.' && pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); }
    }));
    return c;
  }
  function blit(img, x, y, flip) {
    x = Math.round(x); y = Math.round(y);
    if (!flip) { ctx.drawImage(img, x, y); return; }
    ctx.save(); ctx.translate(x + img.width, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore();
  }

  // hi-res text queue, drawn after the pixel buffer is upscaled
  const hiQ = [];
  const hi = (text, x, y, size, color, align = 'center', a = 1) => hiQ.push({ text, x, y, size, color, align, a });

  // ---------- themes ----------
  const TH = {
    kyiv: { sky: ['#1b1440', '#45286a', '#b8507a', '#f0a25a'], ground: ['#5d5d6c', '#45454f', '#8b8b99'], block: 'books' },
    site: { sky: ['#3b8bd0', '#69b2e6', '#a5d6f4', '#d6f0fb'], ground: ['#8a6a4a', '#6a4e34', '#a98b62'], block: 'cubes' },
    qc: { sky: ['#56708e', '#7c94ae', '#a7b8ca', '#d0d9e2'], ground: ['#8f9196', '#6f7176', '#b4b6ba'], block: 'cubes' },
    egypt: { sky: ['#e3953f', '#f1b866', '#f7d595', '#fdedc3'], ground: ['#dfbb76', '#c59e57', '#f0d89e'], block: 'sand' },
    systems: { sky: ['#050a1a', '#0a1530', '#0f2147', '#15305e'], ground: ['#0c2442', '#081a31', '#3de0ff'], block: 'server', grid: true },
    ai: { sky: ['#04020d', '#0c0724', '#190e3b', '#2a1557'], ground: ['#1b0d3a', '#120829', '#ff4fd8'], block: 'glow', grid: true },
    final: { sky: ['#2a1f5a', '#7a3f8a', '#e0708a', '#ffc27a'], ground: ['#3a3560', '#2a2548', '#ffc27a'], block: 'glow', grid: true },
  };
  for (const k in TH) {
    const st = TH[k].sky, bands = 16;
    TH[k].bands = [];
    for (let i = 0; i < bands; i++) {
      const f = i / (bands - 1), seg = f * (st.length - 1), j = Math.min(st.length - 2, Math.floor(seg));
      TH[k].bands.push(mix(st[j], st[j + 1], seg - j));
    }
  }

  function tiles(camX, p, tw, fn) {
    const off = camX * p, i0 = Math.floor(off / tw) - 1, i1 = i0 + Math.ceil(W / tw) + 2;
    for (let i = i0; i <= i1; i++) fn(i, Math.round(i * tw - off));
  }

  const LAYERS = {
    kyiv(camX) {
      tiles(camX, 0.2, 22, (i, x) => {
        const h = 26 + Math.floor(hash(i * 7 + 1) * 44), w = 20 - Math.floor(hash(i * 3) * 6);
        alpha(1); rect('#2b2150', x, GY - h, w, h);
        if (hash(i * 11) > 0.78) { ctx.fillStyle = '#d8a540'; disc(x + w / 2, GY - h, Math.floor(w / 3)); rect('#d8a540', x + w / 2, GY - h - w / 3 - 5, 1, 5); }
        for (let ly = 4; ly < h - 6; ly += 5) for (let lx = 2; lx < w - 2; lx += 4)
          if (hash(i * 131 + ly * 7 + lx) > 0.62) rect('#ffd479', x + lx, GY - h + ly, 2, 2);
      });
      tiles(camX, 0.5, 46, (i, x) => {
        x += Math.floor(hash(i * 5) * 14); const r = 9 + Math.floor(hash(i * 9) * 6);
        rect('#2a1c14', x - 1, GY - 14, 3, 14);
        ctx.fillStyle = '#1f4a33'; disc(x, GY - 11 - r, r);
        ctx.fillStyle = '#2f6a46'; disc(x - 2, GY - 13 - r, r - 4);
      });
    },
    site(camX) {
      for (let x = 0; x < W; x += 2) {
        const wx = x + camX * 0.12;
        const y = GY - 30 - Math.round(10 * Math.sin(wx * 0.017) + 6 * Math.sin(wx * 0.043));
        rect('#9cc4b0', x, y, 2, GY - y);
      }
      tiles(camX, 0.3, 74, (i, x) => {
        if (hash(i * 13) < 0.35) return;
        const fl = 3 + Math.floor(hash(i * 3) * 4), w = 34;
        for (let f = 0; f < fl; f++) { rect('#b8bcc0', x, GY - (f + 1) * 12, w, 2); rect('#9a9ea4', x + 2, GY - (f + 1) * 12 + 2, 3, 10); rect('#9a9ea4', x + w - 5, GY - (f + 1) * 12 + 2, 3, 10); }
        if (hash(i * 17) > 0.5) { alpha(0.55); rect('#f07a2a', x + 6, GY - fl * 12 + 2, w - 12, fl * 12 - 4); alpha(1); }
      });
      tiles(camX, 0.55, 150, (i, x) => {
        if (hash(i * 7) < 0.3) return;
        const h = 82 + Math.floor(hash(i * 5) * 26), top = GY - h;
        rect('#e8a51c', x, top, 4, h);
        for (let y = top; y < GY; y += 4) rect('#b9810f', x + ((y / 4) % 2 ? 0 : 2), y, 2, 1);
        rect('#e8a51c', x - 46, top, 76, 3);
        for (let k = -46; k < 30; k += 4) rect('#b9810f', x + k, top + 1, 2, 1);
        rect('#6f7378', x + 20, top + 3, 9, 6);
        rect('#3b4a5a', x - 3, top + 3, 8, 6);
        const hx = x - 30 - Math.round(Math.sin(i + camX * 0.002) * 4);
        rect('#333', hx, top + 3, 1, 24); rect('#8a8f96', hx - 5, top + 27, 11, 6);
      });
    },
    qc(camX) {
      tiles(camX, 0.2, 28, (i, x) => {
        const h = 30 + Math.floor(hash(i * 5 + 2) * 42);
        rect('#5d6d82', x, GY - h, 25, h);
        for (let ly = 4; ly < h - 4; ly += 6) for (let lx = 3; lx < 22; lx += 5)
          rect(hash(i * 97 + ly + lx * 3) > 0.5 ? '#9cb0c6' : '#6f8197', x + lx, GY - h + ly, 3, 3);
      });
      tiles(camX, 0.5, 130, (i, x) => {
        if (hash(i * 3) < 0.25) return;
        rect('#e9eef2', x, GY - 22, 54, 22); rect('#c5ced6', x, GY - 22, 54, 2);
        rect('#2f6fd1', x, GY - 10, 54, 3);
        rect('#3d4f63', x + 6, GY - 17, 10, 5); rect('#3d4f63', x + 40, GY - 18, 8, 18);
        rect('#4b5563', x + 70, GY - 40, 2, 40); rect('#ffe7a0', x + 68, GY - 42, 6, 3);
      });
    },
    egypt(camX) {
      alpha(0.35); ctx.fillStyle = '#fff6d5'; disc(250, 44, 22); alpha(1);
      ctx.fillStyle = '#fff1c1'; disc(250, 44, 15);
      tiles(camX, 0.12, 170, (i, x) => {
        if (hash(i * 19) < 0.3) return;
        const h = 34 + Math.floor(hash(i * 3) * 26);
        for (let r = 0; r < h; r++) {
          const half = Math.floor(r * 1.25);
          rect('#e3b26a', x + 60 - half, GY - h + r, half, 1);
          rect('#c48f4a', x + 60, GY - h + r, half, 1);
        }
      });
      tiles(camX, 0.5, 64, (i, x) => {
        x += Math.floor(hash(i * 7) * 20);
        if (hash(i * 23) > 0.82) { // crane
          rect('#e8a51c', x, GY - 96, 3, 96); rect('#e8a51c', x - 36, GY - 96, 58, 3); rect('#555', x - 26, GY - 93, 1, 20);
          return;
        }
        const h = 30 + Math.floor(hash(i * 5) * 16);
        for (let k = 0; k < h; k += 3) rect(k % 6 ? '#7a5532' : '#5f4127', x + Math.round(Math.sin(k * 0.06) * 3), GY - k - 3, 3, 3);
        const tx = x + Math.round(Math.sin(h * 0.06) * 3) + 1, ty = GY - h - 2;
        ctx.fillStyle = '#3f7a3a';
        for (let a = 0; a < 6; a++) {
          const ang = Math.PI + (a / 5) * Math.PI;
          for (let s = 0; s < 13; s++) ctx.fillRect(Math.round(tx + Math.cos(ang) * s), Math.round(ty + Math.sin(ang) * s * 0.55 + s * s * 0.05), 2, 1);
        }
      });
    },
    systems(camX) {
      alpha(0.5);
      for (let k = 0; k < 5; k++) rect('#1d4a8a', 0, GY - 3 - k * k * 3, W, 1);
      alpha(1);
      const tick = Math.floor(performance.now() / 600);
      tiles(camX, 0.2, 24, (i, x) => {
        const h = 40 + Math.floor(hash(i * 5 + 1) * 60);
        rect('#0d1c3c', x, GY - h, 21, h); rect('#163064', x, GY - h, 21, 1);
        for (let ly = 4; ly < h - 4; ly += 5) for (let lx = 3; lx < 18; lx += 4)
          if (hash(i * 97 + ly * 13 + lx + (hash(i) > 0.7 ? tick * 31 : 0)) > 0.72) rect('#3de0ff', x + lx, GY - h + ly, 2, 1);
      });
      tiles(camX, 0.5, 84, (i, x) => {
        if (hash(i * 3) < 0.3) return;
        rect('#0a1830', x, GY - 46, 22, 46); rect('#1e3c6e', x, GY - 46, 22, 1); rect('#1e3c6e', x, GY - 46, 1, 46); rect('#1e3c6e', x + 21, GY - 46, 1, 46);
        for (let r = 0; r < 10; r++) {
          rect('#132a50', x + 3, GY - 43 + r * 4, 16, 2);
          if (hash(i * 31 + r + tick * 7) > 0.4) rect(r % 3 ? '#38f28a' : '#3de0ff', x + 16, GY - 43 + r * 4, 2, 2);
        }
      });
    },
    ai(camX) {
      const t = performance.now() / 1000;
      for (let k = 0; k < 70; k++) {
        const x = ((hash(k * 3) * W * 3 - camX * 0.05) % W + W) % W, y = hash(k * 7) * GY * 0.85;
        alpha(0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + k)));
        rect('#ffffff', x, y, 1, 1);
      }
      alpha(1);
      const node = (i) => ({ x: i * 56 + hash(i) * 30, y: 26 + hash(i * 2 + 1) * 74 });
      const off = camX * 0.25, i0 = Math.floor(off / 56) - 2, i1 = i0 + Math.ceil(W / 56) + 4;
      for (let i = i0; i <= i1; i++) {
        const a = node(i);
        for (const j of [i + 1, i + 2]) {
          const b = node(j);
          alpha(0.55); ctx.fillStyle = '#3a2470'; line(a.x - off, a.y, b.x - off, b.y);
          const f = (t * 0.45 + hash(i * 9 + j)) % 1;
          alpha(1); rect('#ff4fd8', lerp(a.x, b.x, f) - off, lerp(a.y, b.y, f), 2, 2);
        }
      }
      for (let i = i0; i <= i1; i++) { const a = node(i); ctx.fillStyle = '#8a5cff'; disc(a.x - off, a.y, 2); }
      tiles(camX, 0.5, 116, (i, x) => {
        if (hash(i * 5) < 0.35) return;
        const h = 36 + Math.floor(hash(i * 3) * 24);
        rect('#140a2c', x, GY - h, 14, h);
        alpha(0.5 + 0.4 * Math.sin(t * 2 + i));
        rect('#ff4fd8', x, GY - h, 14, 1); rect('#ff4fd8', x, GY - h, 1, h); rect('#ff4fd8', x + 13, GY - h, 1, h);
        rect('#8a5cff', x + 4, GY - h + 6, 6, 1); rect('#8a5cff', x + 4, GY - h + 10, 4, 1);
        alpha(1);
      });
    },
    final(camX) {
      ctx.fillStyle = '#ffd27a'; disc(160, GY - 4, 30);
      alpha(0.25); ctx.fillStyle = '#fff0c0'; disc(160, GY - 4, 40); alpha(1);
      tiles(camX, 0.1, 90, (i, x) => {
        const y = 20 + Math.floor(hash(i * 7) * 50);
        alpha(0.6); rect('#ffd0d8', x, y, 34, 4); rect('#ffd0d8', x + 6, y - 3, 20, 3); alpha(1);
      });
      tiles(camX, 0.25, 26, (i, x) => {
        const h = 30 + Math.floor(hash(i * 5 + 4) * 58);
        rect('#3a2f6a', x, GY - h, 22, h);
        for (let ly = 4; ly < h - 4; ly += 5) for (let lx = 3; lx < 19; lx += 4)
          if (hash(i * 51 + ly * 3 + lx) > 0.55) rect('#ffe0a0', x + lx, GY - h + ly, 2, 2);
      });
    },
  };

  // ---------- sprites ----------
  const BASEPAL = { H: '#3a281d', h: '#5c4130', S: '#e3b48e', s: '#c48f6a', E: '#24324a', P: '#2a2c38', B: '#15151a' };
  const COSTUME = {
    student: { T: '#3f7a5c', t: '#2f5e46', C: '#e8e8e8' },
    lab: { T: '#ff8a1f', t: '#e6e6e6', C: '#5a5f6a', helmet: { Y: '#ffb21f', y: '#ffe08a' } },
    qc: { T: '#2f6fd1', t: '#e6e6e6', C: '#f0f0f0', helmet: { Y: '#f2f2f2', y: '#ffffff' } },
    egypt: { T: '#ffd21f', t: '#e6e6e6', C: '#f0f0f0', P: '#7a6644', helmet: { Y: '#f2f2f2', y: '#ffffff' } },
    dev: { T: '#1f2a4a', t: '#151d36', C: '#f4f4f4' },
  };
  const HEAD = [
    '...HhHHhH...',
    '..HHhHHHHh..',
    '.hHHHHhHHHH.',
    '.HHSSSSSSHH.',
    '.HSSSSSSSSs.',
    '.HSSSESSSEs.',
    '..SSSSSSSSs.',
    '..SSSSssSs..',
    '...SsSSsS...',
    '....sSSs....',
  ];
  const HELMET = ['...YYYYYY...', '..YYYYyYYY..', '.YYYYYYYYYYY', '.HHSSSSSSHH.'];
  const TORSO = [
    '..TTTCCTTT..',
    '.TTTTCCTTTT.',
    '.TTTTCCTTTT.',
    'STtTTCCTTtTS',
    'STtTTTTTTtTS',
    '.TTTTTTTTTT.',
  ];
  const LEGS = {
    stand: ['..PPPPPPPP..', '..PPP..PPP..', '..PPP..PPP..', '..BBB..BBB..'],
    run1: ['..PPPPPPPP..', '.PPP....PPP.', 'PPP......PP.', 'BB.......BB.'],
    run2: ['..PPPPPPPP..', '...PPPPPP...', '....PPPP....', '....BBBB....'],
    jump: ['..PPPPPPPP..', '.PPP...PPP..', '.PP.....PPP.', '.BB......BB.'],
  };
  const PLAYER = {};
  for (const name in COSTUME) {
    const c = COSTUME[name], pal = Object.assign({}, BASEPAL, c, c.helmet || {});
    const head = c.helmet ? HELMET.concat(HEAD.slice(4)) : HEAD;
    PLAYER[name] = {};
    for (const f in LEGS) PLAYER[name][f] = sprite(head.concat(TORSO, LEGS[f]), pal);
  }

  const IPAL = {
    K: '#1a1a24', w: '#f4f4f4', b: '#3c78aa', y: '#ffd43b', c: '#3de0ff', d: '#0e5a7a', g: '#7ee081',
    p: '#ff8ad8', P: '#c04fa8', o: '#f07a3a', r: '#e04848', k: '#8a8a9a', m: '#aab0ba', n: '#8a5a2a', a: '#ffb24a', l: '#5ab0ff',
  };
  const ICONS = {
    scroll: ['.KKKKKK.', 'KwwwwwwK', 'KwkkkkwK', 'KwwwwwwK', 'KwkkkwwK', 'KwwwwrrK', '.KKKKrr.', '.....r..'],
    hammer: ['.KKKKK..', 'KmmmmmK.', 'KmmmmmKK', '.KKnKK..', '...nK...', '...nK...', '...nK...', '...KK...'],
    flask: ['..KKKK..', '...ww...', '...ww...', '..wwww..', '.wggggw.', 'wggggggw', 'wggggggw', '.wwwwww.'],
    gauge: ['..KKKK..', '.KwwwwK.', 'KwwwwrwK', 'KwwwrwwK', 'KwwKwwwK', 'KwwwwwwK', '.KKKKKK.', '..KKKK..'],
    clip: ['..KKKK..', '.wKwwKw.', '.wwwwww.', '.wkkkkw.', '.wwwwww.', '.wkkkww.', '.wwwwww.', '.wwwwww.'],
    people: ['.aa..ll.', '.aa..ll.', '........', 'aaaallll', 'aaaallll', 'aaaallll', '........', '........'],
    wave: ['........', 'g.......', 'g...g...', 'gg.ggg.g', '.ggg.ggg', '..g...g.', '........', '........'],
    gear: ['...gg...', '.g.gg.g.', '..gggg..', 'gggKKggg', 'gggKKggg', '..gggg..', '.g.gg.g.', '...gg...'],
    py: ['..bbbb..', '.bwbbbb.', '.bbbbbb.', 'bbbbyyyy', 'bbbbyyyy', '.yyyyyy.', '.yyyywy.', '..yyyy..'],
    db: ['.cccccc.', 'cwwwwwwc', 'cccccccc', 'cddddddc', 'cccccccc', 'cddddddc', 'cccccccc', '.cccccc.'],
    key: ['..yyy...', '.y...y..', '.y...y..', '..yyy...', '...y....', '...yy...', '...y....', '...yy...'],
    plane: ['........', '......ww', '....wwwl', '..wwwwl.', 'wwwwwl..', '..wwll..', '...wl...', '...l....'],
    eye: ['........', '..wwww..', '.wwccww.', 'wwcKKcww', 'wwcKKcww', '.wwccww.', '..wwww..', '........'],
    brain: ['..pppp..', '.pPppPp.', 'pppPpppp', 'pPppppPp', 'ppppPppp', '.pPpppp.', '..pppp..', '...pp...'],
    chip: ['.k.k.k..', 'kccccccK', '.cddddc.', 'kcdccdck', '.cdccdc.', 'kcddddck', '.cccccc.', '.k.k.k..'],
    bot: ['...c....', '.cccccc.', 'cwKccKwc', 'cccccccc', 'cc.cc.cc', '.cccccc.', '..c..c..', '........'],
    crab: ['o......o', 'oo....oo', '.oooooo.', 'oowooowo', 'oooooooo', '.oooooo.', 'o.o..o.o', '........'],
    droid: ['g......g', '.g....g.', '..gggg..', '.gwggwg.', '.gggggg.', '........', '.gggggg.', '.gggggg.'],
    film: ['KKKKKKKK', 'KwKwKwKw', 'KrrrrrrK', 'KrrrrrrK', 'KrrrrrrK', 'KrrrrrrK', 'KwKwKwKw', 'KKKKKKKK'],
    star: ['...yy...', '...yy...', 'yyyyyyyy', '.yyyyyy.', '..yyyy..', '.yy..yy.', 'yy....yy', '........'],
  };
  const ICON = {};
  for (const k in ICONS) ICON[k] = sprite(ICONS[k], IPAL);
  const HALO = { scroll: '#ffe7a0', hammer: '#cfd6e0', flask: '#7ee081', gauge: '#ff9a7a', clip: '#ffffff', people: '#ffb24a', wave: '#7ee081', gear: '#7ee081', py: '#ffd43b', db: '#3de0ff', key: '#ffd43b', plane: '#5ab0ff', eye: '#3de0ff', brain: '#ff8ad8', chip: '#3de0ff', bot: '#3de0ff', crab: '#f07a3a', droid: '#7ee081', film: '#ff6a6a', star: '#ffd43b' };

  const BUG = [
    sprite(['..K....K..', '...K..K...', '.RRRRRRRR.', 'RRwRRRRwRR', 'RRRRKKRRRR', '.RRRRRRRR.', '.K.K..K.K.'], { K: '#1a1a24', R: '#e0483c', w: '#ffffff' }),
    sprite(['..K....K..', '...K..K...', '.RRRRRRRR.', 'RRwRRRRwRR', 'RRRRKKRRRR', '.RRRRRRRR.', 'K.K....K.K'], { K: '#1a1a24', R: '#e0483c', w: '#ffffff' }),
  ];
  const GHOST = [
    sprite(['...pppp...', '..pppppp..', '.pwwppwwp.', '.pwKppwKp.', '.pppppppp.', '.pppppppp.', '.pppppppp.', '.pp.pp.pp.', '..........'], { p: '#b48cff', w: '#ffffff', K: '#1a1030' }),
    sprite(['...pppp...', '..pppppp..', '.pwwppwwp.', '.pwKppwKp.', '.pppppppp.', '.pppppppp.', '.pppppppp.', '..pp.pp.pp', '..........'], { p: '#b48cff', w: '#ffffff', K: '#1a1030' }),
  ];

  // ---------- world ----------
  const world = { chapters: [], blocks: [], items: [], bugs: [], cards: [], stats: [], decos: [], signs: [], end: 0, portal: null };
  function build() {
    let x = 24;
    R.chapters.forEach((ch, ci) => {
      const C = Object.assign({}, ch, { i: ci, x0: x - 24 });
      x += 30;
      const theme = TH[ch.theme];
      for (const b of ch.beats) {
        switch (b.t) {
          case 'sign': world.signs.push({ x, text: b.text, ci }); x += 46; break;
          case 'card': world.cards.push(Object.assign({}, b, { x, ci, seen: false })); x += 84; break;
          case 'item': {
            const high = b.hi !== false;
            world.items.push({ x, y: high ? GY - 36 : GY - 12, icon: b.icon, label: b.label, hi: high, ci, got: false, done: false, trig: x - JD / 2 });
            x += high ? 72 : 58; break;
          }
          case 'block': {
            const w = b.w || 20, h = b.h || 16;
            world.blocks.push({ x, y: GY - h, w, h, ci, style: b.style || theme.block, trig: x + w / 2 - JD / 2, done: false });
            x += w + 68; break;
          }
          case 'bug': {
            const ghost = b.kind === 'ghost';
            world.bugs.push({ x0: x, x1: x + 44, x: x + 44, y: GY - (ghost ? 11 : 7), w: 10, h: ghost ? 9 : 7, vx: -12, kind: ghost ? 'ghost' : 'bug', alive: true, ci, sx: x + 44 });
            x += 124; break;
          }
          case 'stat': world.stats.push({ x, value: b.value, label: b.label, t: -1, ci }); x += b.adv ?? 40; break;
          case 'deco': world.decos.push({ x, kind: b.kind, text: b.text, ci }); x += b.adv ?? 40; break;
          case 'gap': x += b.w || 40; break;
        }
      }
      x += 40;
      C.x1 = x;
      world.chapters.push(C);
    });
    world.end = x;
    world.portal = world.decos.find((d) => d.kind === 'portal') || { x: x - 40 };
  }
  build();
  const TOTAL_SKILLS = world.items.length;

  const chapterAt = (x) => {
    const cs = world.chapters;
    for (let i = cs.length - 1; i >= 0; i--) if (x >= cs[i].x0) return i;
    return 0;
  };

  // ---------- state ----------
  const P = { x: 40, y: GY - 20, w: 10, h: 20, vx: 0, vy: 0, onGround: true, face: 1, anim: 0, knock: 0, coyote: 0, costume: 'student' };
  const cam = { x: 0 };
  const st = { mode: 'title', auto: true, card: null, readT: 0, readDur: 0, paused: false, bugs: 0, ch: -1, stuckT: 0, lastX: 0, skills: [] };
  const parts = [], floats = [];
  let time = 0;

  function puff(x, y, color, n, spread = 40) {
    for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * spread, vy: -Math.random() * spread, life: 0.4 + Math.random() * 0.4, color, s: Math.random() < 0.3 ? 2 : 1 });
  }
  const floatText = (text, x, y, color) => floats.push({ text, x, y, life: 1.4, color });

  // ---------- input ----------
  const keys = { left: false, right: false, jump: false };
  let jumpBuf = 0;
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump' };

  function takeControl() {
    if (!st.auto) return;
    st.auto = false;
    if (st.card) cardMode();
    syncUI();
    toast('Управляете вы: ← → и пробел. Кнопка «Автопилот» вернёт кино.');
  }

  window.addEventListener('keydown', (e) => {
    if ($('#cv').open) return;
    if (e.code === 'Enter' && st.mode === 'title') { start(true); return; }
    if (st.mode !== 'play') return;
    if ((e.code === 'Enter' || e.code === 'Space') && st.auto && st.card) { e.preventDefault(); closeCard(); return; }
    if (e.code === 'KeyP' || e.code === 'Escape') { setPaused(!st.paused); return; }
    if (e.code === 'KeyM') { toggleMute(); return; }
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (st.paused) setPaused(false);
    takeControl();
    if (k === 'jump' && !keys.jump) jumpBuf = 0.12;
    keys[k] = true;
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });

  document.querySelectorAll('[data-touch]').forEach((btn) => {
    const k = btn.dataset.touch;
    const on = (e) => { e.preventDefault(); takeControl(); if (k === 'jump' && !keys.jump) jumpBuf = 0.12; keys[k] = true; btn.classList.add('on'); };
    const off = (e) => { e.preventDefault(); keys[k] = false; btn.classList.remove('on'); };
    btn.addEventListener('pointerdown', on); btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off); btn.addEventListener('pointerleave', off);
  });

  // ---------- physics ----------
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function moveX(dx) {
    P.x = clamp(P.x + dx, 0, world.end - P.w);
    for (const b of world.blocks) if (overlap(P, b)) {
      if (dx > 0) P.x = b.x - P.w; else if (dx < 0) P.x = b.x + b.w;
      P.vx = 0;
    }
  }
  function moveY(dy) {
    P.y += dy;
    const was = P.onGround; P.onGround = false;
    if (P.y + P.h >= GY) { P.y = GY - P.h; P.vy = 0; P.onGround = true; }
    for (const b of world.blocks) if (overlap(P, b)) {
      if (dy > 0) { P.y = b.y - P.h; P.vy = 0; P.onGround = true; } else { P.y = b.y + b.h; P.vy = 0; }
    }
    if (P.onGround && !was && dy > 0) puff(P.x + 5, GY - 1, '#ddd', 4, 30);
  }

  function autopilot() {
    if (!P.onGround) return false;
    const cx = P.x + P.w / 2;
    for (const b of world.blocks) if (!b.done && cx >= b.trig && cx < b.trig + 10) { b.done = true; return true; }
    for (const it of world.items) if (it.hi && !it.got && !it.done && cx >= it.trig && cx < it.trig + 10) { it.done = true; return true; }
    for (const g of world.bugs) if (g.alive) {
      const d = g.x + g.w / 2 - cx, close = V_AUTO - g.vx;
      if (d > close * AIR * 0.82 && d <= close * AIR * 0.96) return true;
    }
    return false;
  }

  function update(dt) {
    time += dt;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt; p.vy += 120 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.life -= dt; f.y -= 14 * dt; if (f.life <= 0) floats.splice(i, 1); }
    if (st.mode !== 'play' || st.paused) return;

    for (const b of world.bugs) if (b.alive) {
      b.x += b.vx * dt;
      if (b.x < b.x0) { b.x = b.x0; b.vx = Math.abs(b.vx); }
      if (b.x > b.x1) { b.x = b.x1; b.vx = -Math.abs(b.vx); }
    }

    let target = 0, wantJump = false;
    if (st.auto) {
      if (st.card) {
        st.readT += dt;
        $('#cardBar').style.width = Math.min(100, st.readT / st.readDur * 100) + '%';
        if (st.readT >= st.readDur) closeCard();
      } else {
        target = V_AUTO; wantJump = autopilot();
        if (P.onGround) {
          st.stuckT = P.x - st.lastX < 0.2 ? st.stuckT + dt : 0;
          if (st.stuckT > 0.35) { wantJump = true; st.stuckT = 0; }
        }
        st.lastX = P.x;
      }
    } else {
      target = ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * V_MAN;
      jumpBuf -= dt;
      if (jumpBuf > 0 && (P.onGround || P.coyote > 0)) { wantJump = true; jumpBuf = 0; }
    }

    if (P.knock > 0) P.knock -= dt;
    else if (st.auto) P.vx = target;
    else {
      const acc = (P.onGround ? 900 : 560) * dt;
      P.vx = P.vx < target ? Math.min(target, P.vx + acc) : Math.max(target, P.vx - acc);
    }
    if (Math.abs(P.vx) > 4) P.face = P.vx > 0 ? 1 : -1;

    P.coyote = P.onGround ? 0.08 : P.coyote - dt;
    if (wantJump && (P.onGround || P.coyote > 0)) {
      P.vy = -JV; P.onGround = false; P.coyote = 0;
      Sound.sfx('jump'); puff(P.x + 5, GY - 1, '#ddd', 3, 25);
    }
    if (!st.auto && !keys.jump && P.vy < -130) P.vy = -130; // short hop when the key is released early
    P.vy = Math.min(P.vy + GRAV * dt, 420);
    moveX(P.vx * dt);
    moveY(P.vy * dt);
    P.anim += dt * Math.abs(P.vx) * 0.11;

    // pickups
    for (const it of world.items) if (!it.got) {
      if (P.x < it.x + 6 && P.x + P.w > it.x - 6 && P.y < it.y + 6 && P.y + P.h > it.y - 6) {
        it.got = true; st.skills.push(it.label);
        Sound.sfx('pick'); puff(it.x, it.y, HALO[it.icon] || '#ffd43b', 10, 60);
        floatText('+ ' + it.label, it.x, it.y - 8, HALO[it.icon] || '#ffd43b');
        skillHUD(it.label);
      }
    }

    // enemies
    for (const b of world.bugs) if (b.alive && overlap(P, b)) {
      if (P.vy > 0 && P.y + P.h - b.y < 10) {
        b.alive = false; st.bugs++; P.vy = -210; P.onGround = false;
        Sound.sfx('stomp'); puff(b.x + 5, b.y + 3, b.kind === 'ghost' ? '#b48cff' : '#e0483c', 14, 70);
        floatText(b.kind === 'ghost' ? 'галлюцинация поймана!' : 'баг исправлен!', b.x + 5, b.y - 10, '#7ee081');
      } else if (P.knock <= 0) {
        const dir = P.x + 5 < b.x + 5 ? -1 : 1;
        P.vx = dir * 120; P.vy = -150; P.onGround = false; P.knock = 0.3; b.vx = -b.vx;
        Sound.sfx('bump');
      }
    }

    // checkpoints
    const pcx = P.x + P.w / 2;
    for (const c of world.cards) if (!c.seen && pcx >= c.x - 2 && P.onGround) {
      c.seen = true; openCard(c);
      if (st.auto) P.vx = 0;
    }
    if (st.card && !st.auto && Math.abs(pcx - st.card.x) > 230) closeCard();

    // chapters
    const ci = chapterAt(pcx);
    if (ci !== st.ch) enterChapter(ci, st.ch >= 0);

    // stats count up when visible
    for (const s of world.stats) if (s.t < 0 && s.x + 60 > cam.x && s.x < cam.x + W - 40) s.t = 0;
    for (const s of world.stats) if (s.t >= 0) s.t += dt;

    if (pcx >= world.portal.x + 14) finish();

    const tx = clamp(P.x - 104, 0, world.end - W);
    cam.x = lerp(cam.x, tx, 1 - Math.exp(-dt * 8));
  }

  // ---------- rendering ----------
  function themeBlend(cx) {
    const cs = world.chapters;
    for (let i = 0; i < cs.length - 1; i++) {
      const bx = cs[i].x1;
      if (Math.abs(cx - bx) < 90) return { a: cs[i].theme, b: cs[i + 1].theme, t: (cx - bx + 90) / 180 };
    }
    return { a: cs[chapterAt(cx)].theme, b: null, t: 0 };
  }

  const buf2 = document.createElement('canvas'); buf2.width = W; buf2.height = H;
  const ctx2 = buf2.getContext('2d');
  function drawTheme(name, camX, a) {
    const T = TH[name], n = T.bands.length;
    if (a < 1) { // render the incoming theme off-screen, then fade it in as a whole
      const main = ctx;
      ctx = ctx2; ctx.clearRect(0, 0, W, H);
      drawTheme(name, camX, 1);
      ctx = main;
      ctx.globalAlpha = a; ctx.drawImage(buf2, 0, 0, W, GY, 0, 0, W, GY); ctx.globalAlpha = 1;
      return;
    }
    T.bands.forEach((c, i) => { const y0 = Math.floor(i * GY / n), y1 = Math.floor((i + 1) * GY / n); rect(c, 0, y0, W, y1 - y0); });
    LAYERS[name](camX);
    ctx.globalAlpha = 1;
  }

  function groundTheme(wx, i) {
    const cs = world.chapters;
    for (let k = 0; k < cs.length - 1; k++) {
      const d = wx - cs[k].x1;
      if (Math.abs(d) < 48) return hash(i * 7 + 3) < (d + 48) / 96 ? cs[k + 1].theme : cs[k].theme;
    }
    return cs[chapterAt(wx)].theme;
  }

  function drawGround(camX) {
    const t0 = Math.floor(camX / 16), t1 = t0 + Math.ceil(W / 16) + 1;
    for (let i = t0; i <= t1; i++) {
      const wx = i * 16, T = TH[groundTheme(wx + 8, i)], x = wx - camX;
      rect(T.ground[0], x, GY, 16, H - GY);
      rect(T.ground[2], x, GY, 16, 2);
      if (T.grid) {
        alpha(0.35); rect(T.ground[2], x, GY + 2, 1, H - GY); rect(T.ground[2], x, GY + 12, 16, 1); alpha(1);
      } else {
        for (let k = 0; k < 5; k++) rect(T.ground[1], x + Math.floor(hash(i * 17 + k) * 15), GY + 4 + Math.floor(hash(i * 29 + k * 3) * (H - GY - 6)), 2, 1);
      }
    }
  }

  function drawDeco(d, camX) {
    const x = Math.round(d.x - camX);
    if (x < -140 || x > W + 140) return;
    const t = time;
    switch (d.kind) {
      case 'univ': {
        const w = 110, h = 60, bx = x - 10;
        rect('#e9dcb0', bx, GY - h, w, h);
        for (let r = 0; r < 14; r++) rect('#d9c890', bx + 14 - r, GY - h - 14 + r, w - 28 + r * 2, 1);
        rect('#c9b680', bx, GY - h, w, 3);
        for (let c = 0; c < 6; c++) { rect('#fbf6e6', bx + 10 + c * 17, GY - h + 6, 5, h - 12); rect('#d6cba6', bx + 14 + c * 17, GY - h + 6, 1, h - 12); }
        rect('#5a4a3a', bx + w / 2 - 6, GY - 22, 12, 16);
        for (let s = 0; s < 3; s++) rect('#cfc3a0', bx - 4 + s * 2, GY - 6 + s * 2, w + 8 - s * 4, 2);
        hi('УНИВЕРСИТЕТ', bx + w / 2, GY - h - 4, 4, '#5a4a3a');
        break;
      }
      case 'lab': {
        rect('#f0f4f6', x, GY - 26, 62, 26); rect('#c5ced6', x, GY - 26, 62, 2); rect('#ff8a1f', x, GY - 9, 62, 3);
        rect('#3d4f63', x + 44, GY - 20, 10, 20); rect('#7fb4e0', x + 6, GY - 20, 12, 7);
        rect('#4b5563', x + 22, GY - 21, 18, 7);
        hi('ЛАБ', x + 31, GY - 17.5, 4, '#ffffff');
        break;
      }
      case 'plane': {
        const px = x + ((t * 26) % 140) - 30, py = 30;
        alpha(0.6); for (let k = 1; k < 8; k++) rect('#ffffff', px - k * 9, py + 3, 6, 1); alpha(1);
        rect('#ffffff', px, py + 1, 22, 5); rect('#ffffff', px + 22, py + 2, 3, 3);
        rect('#2f6fd1', px + 2, py + 3, 18, 1); rect('#dfe6ee', px + 8, py - 3, 6, 4); rect('#dfe6ee', px + 8, py + 6, 6, 3);
        rect('#ffffff', px - 1, py - 3, 3, 5);
        break;
      }
      case 'laptop': {
        rect('#6a4a2a', x - 4, GY - 14, 26, 2); rect('#4a321c', x - 2, GY - 12, 2, 12); rect('#4a321c', x + 18, GY - 12, 2, 12);
        rect('#3a3f4a', x + 3, GY - 16, 14, 2); rect('#2a2e38', x + 4, GY - 27, 12, 11);
        for (let r = 0; r < 4; r++) rect(r % 2 ? '#3de0ff' : '#7ee081', x + 6 + (r % 2) * 2, GY - 25 + r * 2, 3 + Math.floor(hash(r + Math.floor(t * 3)) * 5), 1);
        alpha(0.25 + 0.15 * Math.sin(t * 4)); ctx.fillStyle = '#3de0ff'; disc(x + 10, GY - 22, 9); alpha(1);
        break;
      }
      case 'portal': {
        const ph = 50, pw = 30, px = x - pw / 2;
        for (let r = 0; r < ph - 4; r++) {
          const f = (r / ph + t * 0.6) % 1;
          rect(f < 0.5 ? mix('#3de0ff', '#ff4fd8', f * 2) : mix('#ff4fd8', '#3de0ff', (f - 0.5) * 2), px + 4, GY - ph + 2 + r, pw - 8, 1);
        }
        rect('#2a2548', px, GY - ph, 4, ph); rect('#2a2548', px + pw - 4, GY - ph, 4, ph); rect('#2a2548', px, GY - ph - 4, pw, 4);
        rect('#ffc27a', px, GY - ph - 4, pw, 1);
        if (Math.random() < 0.3) puff(px + 4 + Math.random() * (pw - 8), GY - Math.random() * ph, Math.random() < 0.5 ? '#3de0ff' : '#ff4fd8', 1, 10);
        hi(d.text || '', x, GY - ph - 12, 5, '#ffe0a0');
        break;
      }
    }
  }

  function drawSign(s, camX) {
    const x = Math.round(s.x - camX);
    if (x < -80 || x > W + 80) return;
    const w = Math.max(16, s.text.length * 5 + 8);
    rect('#5a3b22', x - 1, GY - 22, 3, 22);
    rect('#8a5a32', x - w / 2, GY - 32, w, 11); rect('#a8743f', x - w / 2, GY - 32, w, 1); rect('#4a2f1a', x - w / 2, GY - 22, w, 1);
    hi(s.text, x + 0.5, GY - 26.2, 4, '#fff3d6');
  }

  function drawCardFlag(c, camX) {
    const x = Math.round(c.x - camX);
    if (x < -60 || x > W + 60) return;
    rect('#d8d8e0', x, GY - 34, 2, 34);
    const wave = Math.round(Math.sin(time * 6) * 1);
    rect(c.seen ? '#38c172' : '#ffcf3f', x + 2, GY - 34 + wave, 12, 7); rect(c.seen ? '#2a9a5a' : '#e0a51f', x + 2, GY - 28 + wave, 12, 1);
    hi(c.year, x + 1, GY - 41, 4, '#ffffff');
  }

  function drawStat(s, camX) {
    const x = Math.round(s.x - camX);
    if (x < -130 || x > W + 10) return;
    const bw = 112, top = GY - 82;
    rect('#334', x + 18, top + 32, 2, GY - top - 32); rect('#334', x + bw - 20, top + 32, 2, GY - top - 32);
    rect('#081428', x, top, bw, 32); rect('#3de0ff', x, top, bw, 1); rect('#3de0ff', x, top + 31, bw, 1); rect('#3de0ff', x, top, 1, 32); rect('#3de0ff', x + bw - 1, top, 1, 32);
    const m = s.value.match(/[\d\s]+/), num = m ? parseInt(m[0].replace(/\s/g, ''), 10) : 0;
    const k = s.t < 0 ? 0 : Math.min(1, s.t / 1.4), ease = 1 - Math.pow(1 - k, 3);
    const cur = Math.round(num * ease), txt = String(cur).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (k >= 1 ? s.value.replace(/[\d\s]+/, '') : '');
    hi(txt, x + bw / 2, top + 12, 10, '#3de0ff');
    hi(s.label, x + bw / 2, top + 25, 4, '#cfe9ff');
  }

  function drawBlock(b, camX) {
    const x = Math.round(b.x - camX), y = b.y;
    if (x < -40 || x > W + 10) return;
    switch (b.style) {
      case 'books': {
        const cols = ['#b84a3a', '#3a6ab8', '#d9a540', '#4a9a5a', '#8a4ab8'];
        for (let yy = GY - 4, k = 0; yy >= y; yy -= 4, k++) {
          const ins = Math.floor(hash(b.x + k) * 3);
          rect(cols[Math.floor(hash(b.x * 3 + k) * cols.length)], x + ins, yy, b.w - ins - 1, 4);
          rect('#f4ecd8', x + b.w - 3, yy + 1, 1, 2);
        }
        break;
      }
      case 'cubes':
        for (let cy = GY - 10; cy >= y; cy -= 10) for (let cx = x; cx < x + b.w; cx += 10) {
          rect('#a9a9a4', cx, cy, 10, 10); rect('#cfcfc8', cx, cy, 10, 1); rect('#cfcfc8', cx, cy, 1, 10);
          rect('#7a7a76', cx, cy + 9, 10, 1); rect('#7a7a76', cx + 9, cy, 1, 10); rect('#d14b3a', cx + 3, cy + 3, 2, 1);
        }
        break;
      case 'sand':
        for (let cy = GY - 5, r = 0; cy >= y; cy -= 5, r++) for (let cx = x - (r % 2 ? 4 : 0); cx < x + b.w; cx += 8) {
          const sx = Math.max(cx, x), sw = Math.min(cx + 8, x + b.w) - sx;
          if (sw <= 0) continue;
          rect('#c9a76a', sx, cy, sw, 5); rect('#e0c48a', sx, cy, sw, 1); rect('#9a7a44', sx, cy + 4, sw, 1); rect('#9a7a44', sx + sw - 1, cy, 1, 5);
        }
        break;
      case 'server': {
        rect('#0c1a33', x, y, b.w, b.h); rect('#2a5a9a', x, y, b.w, 1); rect('#2a5a9a', x, y, 1, b.h); rect('#2a5a9a', x + b.w - 1, y, 1, b.h);
        for (let r = y + 3; r < GY - 2; r += 4) {
          rect('#16305a', x + 2, r, b.w - 7, 1);
          if (hash(r * 7 + b.x + Math.floor(time * 2)) > 0.35) rect(hash(r + b.x) > 0.5 ? '#38f28a' : '#3de0ff', x + b.w - 4, r, 2, 2);
        }
        break;
      }
      default: {
        rect('#160c30', x, y, b.w, b.h);
        alpha(0.6 + 0.4 * Math.sin(time * 3 + b.x));
        rect('#ff4fd8', x, y, b.w, 1); rect('#ff4fd8', x, y, 1, b.h); rect('#ff4fd8', x + b.w - 1, y, 1, b.h);
        ctx.fillStyle = '#8a5cff'; line(x + 3, y + b.h - 3, x + b.w - 4, y + 3);
        alpha(1);
      }
    }
  }

  function drawItem(it, camX) {
    if (it.got) return;
    const x = it.x - camX;
    if (x < -10 || x > W + 10) return;
    const bob = it.hi ? Math.round(Math.sin(time * 3 + it.x) * 1.5) : 0;
    alpha(0.22 + 0.1 * Math.sin(time * 4 + it.x)); ctx.fillStyle = HALO[it.icon] || '#ffd43b'; disc(x, it.y + bob, 7); alpha(1);
    blit(ICON[it.icon] || ICON.star, x - 4, it.y - 4 + bob);
  }

  function drawPlayer(camX) {
    const set = PLAYER[P.costume];
    let f = 'stand';
    if (!P.onGround) f = 'jump';
    else if (Math.abs(P.vx) > 5) f = ['run1', 'stand', 'run2', 'stand'][Math.floor(P.anim) % 4];
    const bobY = f === 'stand' && Math.abs(P.vx) <= 5 && Math.sin(time * 3) > 0.7 ? 1 : 0;
    blit(set[f], P.x - 1 - camX, P.y + bobY, P.face < 0);
  }

  function render() {
    const camX = Math.round(cam.x);
    hiQ.length = 0;
    const bl = themeBlend(camX + W / 2);
    drawTheme(bl.a, camX, 1);
    if (bl.b && bl.t > 0) drawTheme(bl.b, camX, bl.t);
    drawGround(camX);
    world.decos.forEach((d) => drawDeco(d, camX));
    world.stats.forEach((s) => drawStat(s, camX));
    world.signs.forEach((s) => drawSign(s, camX));
    world.cards.forEach((c) => drawCardFlag(c, camX));
    world.blocks.forEach((b) => drawBlock(b, camX));
    world.items.forEach((it) => drawItem(it, camX));
    for (const b of world.bugs) if (b.alive) {
      const x = b.x - camX;
      if (x < -12 || x > W + 12) continue;
      const fr = Math.floor(time * 6) % 2;
      if (b.kind === 'ghost') { alpha(0.85); blit(GHOST[fr], x, b.y + Math.round(Math.sin(time * 4 + b.x0) * 1.5), b.vx > 0); alpha(1); }
      else blit(BUG[fr], x, b.y, b.vx > 0);
    }
    drawPlayer(camX);
    for (const p of parts) { alpha(Math.min(1, p.life * 2)); rect(p.color, p.x - camX, p.y, p.s, p.s); }
    alpha(1);

    vctx.imageSmoothingEnabled = false;
    vctx.drawImage(buf, 0, 0, view.width, view.height);

    for (const f of floats) hi(f.text, f.x - camX, f.y, 5, f.color, 'center', Math.min(1, f.life * 1.5));
    vctx.textBaseline = 'middle';
    for (const q of hiQ) {
      vctx.globalAlpha = q.a;
      vctx.font = Math.round(q.size * S) + 'px ' + FONT;
      vctx.textAlign = q.align;
      const sx = q.x * S, sy = q.y * S;
      vctx.fillStyle = 'rgba(0,0,0,0.55)';
      vctx.fillText(q.text, sx + Math.max(1, S * 0.5), sy + Math.max(1, S * 0.5));
      vctx.fillStyle = q.color;
      vctx.fillText(q.text, sx, sy);
    }
    vctx.globalAlpha = 1;
  }

  // ---------- UI ----------
  const cardEl = $('#card');
  function openCard(c) {
    st.card = c; st.readT = 0;
    const chars = (c.title + c.lines.join(' ')).length;
    st.readDur = clamp(3.2 + chars / 42, 5, 9);
    $('#cardYear').textContent = c.year;
    $('#cardTitle').textContent = c.title;
    $('#cardPlace').textContent = c.place || '';
    $('#cardLines').innerHTML = '';
    c.lines.forEach((l) => { const li = document.createElement('li'); li.textContent = l; $('#cardLines').appendChild(li); });
    $('#cardTags').innerHTML = '';
    (c.tags || []).forEach((t) => { const s = document.createElement('span'); s.textContent = t; $('#cardTags').appendChild(s); });
    $('#cardBar').style.width = '0%';
    cardMode();
    cardEl.hidden = false;
    cardEl.classList.remove('show'); void cardEl.offsetWidth; cardEl.classList.add('show');
    Sound.sfx('card');
  }
  function cardMode() {
    cardEl.classList.toggle('manual', !st.auto);
    $('#cardNext').textContent = st.auto ? 'Дальше ⏎' : 'Закрыть ✕';
  }
  function closeCard() { st.card = null; cardEl.hidden = true; }
  $('#cardNext').addEventListener('click', closeCard);

  let bannerT = 0;
  function enterChapter(ci, announce) {
    const C = world.chapters[ci];
    const was = P.costume;
    st.ch = ci; P.costume = C.costume;
    Sound.chapter(ci);
    if (announce) {
      if (was !== P.costume) { puff(P.x + 5, P.y + 10, '#ffffff', 16, 60); Sound.sfx('level'); }
      const b = $('#banner');
      b.innerHTML = '<span>' + C.years + '</span>' + C.title;
      b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
      clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), 2800);
    }
    document.querySelectorAll('.tl-seg').forEach((s, i) => s.classList.toggle('cur', i === ci));
  }

  let toastT = 0;
  function toast(text) {
    const t = $('#toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3600);
  }

  function skillHUD(label) {
    $('#skillCount').textContent = st.skills.length + '/' + TOTAL_SKILLS;
    const l = $('#skillLast'); l.textContent = label;
    l.classList.remove('pop'); void l.offsetWidth; l.classList.add('pop');
  }

  // timeline
  const tl = $('#timeline');
  world.chapters.forEach((C, i) => {
    const seg = document.createElement('button');
    seg.className = 'tl-seg'; seg.style.flexGrow = String(C.x1 - C.x0);
    seg.innerHTML = '<span>' + C.short + '</span>';
    seg.title = C.years + ' · ' + C.title;
    seg.setAttribute('aria-label', 'Перейти: ' + C.years + ', ' + C.title);
    seg.addEventListener('click', () => jumpTo(i));
    tl.appendChild(seg);
  });
  const tlFill = document.createElement('div'); tlFill.className = 'tl-fill'; tlFill.id = 'tlFill'; tl.appendChild(tlFill);

  function jumpTo(ci) {
    if (st.mode !== 'play') start(st.mode === 'title' ? true : st.auto);
    const x = world.chapters[ci].x0 + 10;
    P.x = x; P.y = GY - P.h; P.vx = 0; P.vy = 0; P.knock = 0;
    for (const c of world.cards) c.seen = c.x < x;
    for (const b of world.blocks) if (b.x >= x) b.done = false;
    for (const it of world.items) if (it.x >= x) it.done = false;
    closeCard();
    cam.x = clamp(P.x - 104, 0, world.end - W);
    st.ch = -1;
  }

  function syncUI() {
    $('#btnAuto').classList.toggle('on', st.auto);
    $('#btnAuto').setAttribute('aria-pressed', String(st.auto));
    document.body.classList.toggle('manual', !st.auto && st.mode === 'play');
    $('#btnSound').textContent = Sound.muted ? '🔇' : '🔊';
  }

  function setPaused(p) {
    st.paused = p; $('#pause').hidden = !p;
    if (p) Sound.stop(); else if (!Sound.muted) Sound.start();
  }
  function toggleMute() { Sound.setMuted(!Sound.muted); if (!Sound.muted) Sound.start(); syncUI(); }

  function reset() {
    P.x = 40; P.y = GY - P.h; P.vx = P.vy = 0; P.face = 1; P.knock = 0;
    cam.x = 0; st.skills = []; st.bugs = 0; st.ch = -1; closeCard();
    world.items.forEach((it) => { it.got = false; it.done = false; });
    world.blocks.forEach((b) => { b.done = false; });
    world.cards.forEach((c) => { c.seen = false; });
    world.bugs.forEach((b) => { b.alive = true; b.x = b.sx; b.vx = -12; });
    world.stats.forEach((s) => { s.t = -1; });
    $('#skillCount').textContent = '0/' + TOTAL_SKILLS; $('#skillLast').textContent = '';
  }

  function start(auto) {
    if (st.mode === 'end') reset();
    st.mode = 'play'; st.auto = auto; st.paused = false;
    $('#title').hidden = true; $('#end').hidden = true; $('#pause').hidden = true;
    Sound.start();
    syncUI();
    if (!auto) toast('← → или A D — идти, пробел — прыжок. Собирайте навыки!');
  }

  function finish() {
    if (st.mode !== 'play') return;
    st.mode = 'end'; closeCard(); Sound.sfx('win'); $('#banner').classList.remove('show');
    $('#endStats').textContent = 'Навыков собрано: ' + st.skills.length + ' из ' + TOTAL_SKILLS + ' · Багов исправлено: ' + st.bugs;
    const chips = $('#endSkills'); chips.innerHTML = '';
    world.items.forEach((it) => { const s = document.createElement('span'); s.textContent = it.label; if (!it.got) s.className = 'miss'; chips.appendChild(s); });
    $('#end').hidden = false;
    document.body.classList.remove('manual');
  }

  // buttons
  $('#btnWatch').addEventListener('click', () => start(true));
  $('#btnPlay').addEventListener('click', () => start(false));
  $('#btnAgain').addEventListener('click', () => { reset(); start(true); });
  $('#btnRestart').addEventListener('click', () => { reset(); start(st.auto); });
  $('#btnAuto').addEventListener('click', () => {
    if (st.mode !== 'play') { start(true); return; }
    st.auto = !st.auto;
    if (st.auto) { closeCard(); keys.left = keys.right = keys.jump = false; }
    else if (st.card) cardMode();
    syncUI();
  });
  $('#btnSound').addEventListener('click', toggleMute);
  $('#btnResume').addEventListener('click', () => setPaused(false));

  // contacts
  const tg = R.telegram ? 'https://t.me/' + R.telegram : '';
  document.querySelectorAll('[data-tg]').forEach((a) => {
    if (tg) { a.href = tg; a.hidden = false; } else a.hidden = true;
  });

  // pause when the tab is hidden
  document.addEventListener('visibilitychange', () => { if (document.hidden && st.mode === 'play' && !st.paused) setPaused(true); });

  // ---------- loop ----------
  resize();
  syncUI();
  $('#skillCount').textContent = '0/' + TOTAL_SKILLS;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    update(dt);
    if (st.mode === 'play' || st.mode === 'title') {
      $('#tlFill').style.width = (clamp((P.x + 5) / world.end, 0, 1) * 100) + '%';
    }
    render();
    requestAnimationFrame(frame);
  }
  if (document.fonts && document.fonts.load) document.fonts.load('10px "Press Start 2P"').catch(() => {});
  // ?cover renders the social preview image (title over the 'systems' chapter)
  if (new URLSearchParams(location.search).has('cover')) {
    document.body.classList.add('cover');
    P.x = 2430; P.costume = 'egypt'; cam.x = P.x - 104;
    world.stats.forEach((s) => { s.t = 5; });
    const draw = () => { resize(); render(); };
    draw(); setTimeout(draw, 300);
    if (document.fonts) document.fonts.ready.then(draw);
  }
  requestAnimationFrame(frame);

  // debug hook for automated checks
  window.__game = {
    st, P, world, jumpTo, start, reset,
    sim(sec) { for (let i = 0; i < sec * 60; i++) update(1 / 60); cam.x = clamp(P.x - 104, 0, world.end - W); render(); },
  };
})();
