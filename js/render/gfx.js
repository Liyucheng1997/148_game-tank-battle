// ===== 3D 渲染基础工具：随机数 / 噪声 / 程序化贴图 / 几何构建 =====
// 注意：本文件只定义函数，所有 THREE 调用都发生在运行期（three.js 由 main.js 异步加载）
const GFX = (() => {
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  function rng(seed) {
    let s = (seed | 0) % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  function hash2(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  // 可平铺的分形值噪声，返回 [0,1] 区间的 Float32Array(size*size)
  function fbm(size, freq0, octaves, seed) {
    const out = new Float32Array(size * size);
    const r = rng(seed);
    let amp = 1, freq = freq0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const lat = new Float32Array(freq * freq);
      for (let i = 0; i < lat.length; i++) lat[i] = r();
      for (let y = 0; y < size; y++) {
        const fy = y / size * freq, y0 = Math.floor(fy), y1 = (y0 + 1) % freq;
        let ty = fy - y0; ty = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < size; x++) {
          const fx = x / size * freq, x0 = Math.floor(fx), x1 = (x0 + 1) % freq;
          let tx = fx - x0; tx = tx * tx * (3 - 2 * tx);
          const a = lat[y0 * freq + x0], b = lat[y0 * freq + x1];
          const c = lat[y1 * freq + x0], d = lat[y1 * freq + x1];
          out[y * size + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
        }
      }
      norm += amp; amp *= 0.5; freq *= 2;
    }
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    return out;
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function toTexture(canvas, { srgb = true, repeat = true } = {}) {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }

  // ---------------- 程序化贴图 ----------------

  // 战场地面：泥土 + 草斑 + 碎石 + 裂纹
  function groundCanvas(size) {
    const c = makeCanvas(size, size), ctx = c.getContext('2d');
    const n1 = fbm(size, 5, 6, 7), n2 = fbm(size, 20, 3, 19), n3 = fbm(size, 128, 1, 31);
    const img = ctx.createImageData(size, size), d = img.data;
    for (let i = 0; i < size * size; i++) {
      const a = clamp01((n1[i] - 0.5) * 2.4 + 0.5);
      const b = clamp01((n2[i] - 0.5) * 2.4 + 0.5);
      let r = lerp(84, 128, a), g = lerp(74, 110, a), bl = lerp(54, 78, a);
      const grass = smoothstep(0.58, 0.78, a * 0.45 + b * 0.55) * 0.8;
      r = lerp(r, 72, grass); g = lerp(g, 96, grass); bl = lerp(bl, 46, grass);
      const k = (n3[i] - 0.5) * 34;
      d[i * 4] = r + k; d[i * 4 + 1] = g + k; d[i * 4 + 2] = bl + k * 0.8; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const R = rng(5);
    for (let i = 0; i < 3200; i++) {
      const x = R() * size, y = R() * size, rad = 0.6 + R() * 1.9;
      ctx.fillStyle = R() < 0.5 ? `rgba(38,32,24,${0.3 + R() * 0.3})` : `rgba(176,166,140,${0.25 + R() * 0.35})`;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      let x = R() * size, y = R() * size, ang = R() * TAU;
      ctx.strokeStyle = `rgba(34,27,19,${0.25 + R() * 0.2})`;
      ctx.lineWidth = 0.6 + R() * 0.9;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 9; k++) {
        ang += (R() - 0.5) * 1.3;
        x += Math.cos(ang) * (4 + R() * 9); y += Math.sin(ang) * (4 + R() * 9);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return c;
  }

  // 地图外围的暗色地表（可平铺）
  function outerCanvas() {
    const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
    const n = fbm(s, 4, 5, 77), m = fbm(s, 32, 2, 78);
    const img = ctx.createImageData(s, s), d = img.data;
    for (let i = 0; i < s * s; i++) {
      const a = clamp01((n[i] - 0.5) * 2.2 + 0.5), k = (m[i] - 0.5) * 30;
      d[i * 4] = lerp(44, 70, a) + k; d[i * 4 + 1] = lerp(42, 62, a) + k; d[i * 4 + 2] = lerp(34, 46, a) + k; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // 通用细颗粒（亮度 lo~1），用于砖、漆面、水泥等材质
  function grainCanvas(lo = 0.8) {
    const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
    const n = fbm(s, 16, 4, 91), m = fbm(s, 128, 1, 92);
    const img = ctx.createImageData(s, s), d = img.data;
    for (let i = 0; i < s * s; i++) {
      const k = 1 - lo;
      const v = 255 * (lo + k * 0.7 * clamp01((n[i] - 0.5) * 2 + 0.5) + k * 0.3 * m[i]);
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // 水泥：灰度 + 斑点 + 气孔
  function concreteCanvas() {
    const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
    const n = fbm(s, 8, 5, 55);
    const img = ctx.createImageData(s, s), d = img.data;
    for (let i = 0; i < s * s; i++) {
      const v = lerp(150, 196, clamp01((n[i] - 0.5) * 2.2 + 0.5)) + (Math.random() - 0.5) * 14;
      d[i * 4] = v; d[i * 4 + 1] = v * 0.98; d[i * 4 + 2] = v * 0.94; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const R = rng(56);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(70,66,60,${0.2 + R() * 0.3})`;
      ctx.beginPath(); ctx.arc(R() * s, R() * s, 0.5 + R() * 1.4, 0, TAU); ctx.fill();
    }
    return c;
  }

  // 拉丝钢板
  function steelCanvas() {
    const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
    const n = fbm(s, 8, 4, 41);
    const R = rng(42);
    const rows = new Float32Array(s);
    for (let y = 0; y < s; y++) rows[y] = R();
    const img = ctx.createImageData(s, s), d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        const v = 255 * (0.72 + 0.12 * rows[y] + 0.16 * n[i]);
        d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v * 1.02; d[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + R() * 0.12})`;
      ctx.lineWidth = 0.5;
      const x = R() * s, y = R() * s, a = R() * TAU, l = 6 + R() * 26;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    return c;
  }

  // 履带板：U 方向沿履带前进方向，一张图 4 节履带板
  function trackCanvas() {
    const w = 128, h = 32, c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#141414'; ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 4; k++) {
      const x0 = k * 32;
      const g = ctx.createLinearGradient(x0, 0, x0 + 30, 0);
      g.addColorStop(0, '#2c2c2b'); g.addColorStop(0.5, '#4a4946'); g.addColorStop(1, '#2a2a29');
      ctx.fillStyle = g; ctx.fillRect(x0 + 1, 1, 29, h - 2);
      ctx.fillStyle = '#5f5c57'; ctx.fillRect(x0 + 12, 2, 6, h - 4);   // 履刺
      ctx.fillStyle = '#7a766f'; ctx.fillRect(x0 + 12, 2, 2, h - 4);
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(x0 + 3, h / 2 - 2, 4, 4); ctx.fillRect(x0 + 24, h / 2 - 2, 4, 4); // 销孔
    }
    return c;
  }

  // 冰面：淡蓝 + 裂纹 + 霜
  function iceCanvas() {
    const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
    const n = fbm(s, 4, 4, 13);
    const img = ctx.createImageData(s, s), d = img.data;
    for (let i = 0; i < s * s; i++) {
      const v = n[i];
      d[i * 4] = lerp(150, 215, v); d[i * 4 + 1] = lerp(200, 238, v); d[i * 4 + 2] = 255; d[i * 4 + 3] = lerp(120, 190, v);
    }
    ctx.putImageData(img, 0, 0);
    const R = rng(14);
    for (let i = 0; i < 14; i++) {
      let x = R() * s, y = R() * s, a = R() * TAU;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + R() * 0.4})`;
      ctx.lineWidth = 0.6 + R();
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        a += (R() - 0.5) * 1.4; x += Math.cos(a) * (8 + R() * 18); y += Math.sin(a) * (8 + R() * 18);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120,170,200,0.5)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    return c;
  }

  // 水面法线贴图
  function waterNormalCanvas() {
    const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
    const h = fbm(s, 8, 4, 61);
    const img = ctx.createImageData(s, s), d = img.data;
    const k = 6;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const hl = h[y * s + ((x - 1 + s) % s)], hr = h[y * s + ((x + 1) % s)];
        const hu = h[((y - 1 + s) % s) * s + x], hd = h[((y + 1) % s) * s + x];
        let nx = (hl - hr) * k, ny = (hu - hd) * k, nz = 1;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const i = (y * s + x) * 4;
        d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // 黄黑警示条
  function hazardCanvas() {
    const c = makeCanvas(64, 16), ctx = c.getContext('2d');
    ctx.fillStyle = '#e8b31c'; ctx.fillRect(0, 0, 64, 16);
    ctx.fillStyle = '#1b1b1b';
    for (let x = -16; x < 64; x += 16) {
      ctx.beginPath(); ctx.moveTo(x, 16); ctx.lineTo(x + 8, 16); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 8, 0); ctx.closePath(); ctx.fill();
    }
    return c;
  }

  // ---- 粒子精灵 ----
  function glowCanvas() {
    const s = 64, c = makeCanvas(s, s), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    return c;
  }

  function smokeCanvas() {
    const s = 128, c = makeCanvas(s, s), ctx = c.getContext('2d');
    const R = rng(3);
    for (let i = 0; i < 16; i++) {
      const a = R() * TAU, r = R() * 22;
      const x = s / 2 + Math.cos(a) * r, y = s / 2 + Math.sin(a) * r, rad = 18 + R() * 22;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.32)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
    // 统一的径向衰减，避免方形边缘
    ctx.globalCompositeOperation = 'destination-in';
    const m = ctx.createRadialGradient(s / 2, s / 2, s * 0.2, s / 2, s / 2, s / 2);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = m; ctx.fillRect(0, 0, s, s);
    return c;
  }

  function sparkCanvas() {
    const s = 32, c = makeCanvas(s, s), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    return c;
  }

  // 竖直方向渐隐，用于道具光柱
  function beamCanvas() {
    const c = makeCanvas(4, 64), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 64);
    return c;
  }

  function createTextures() {
    const groundSize = 1024;
    const ground = groundCanvas(groundSize);
    const gctx = ground.getContext('2d');
    const T = {
      ground: {
        canvas: ground, ctx: gctx, size: groundSize,
        base: gctx.getImageData(0, 0, groundSize, groundSize),
        texture: toTexture(ground, { repeat: false }),
      },
      outer: toTexture(outerCanvas()),
      grain: toTexture(grainCanvas(0.8)),
      grainSoft: toTexture(grainCanvas(0.92)),
      concrete: toTexture(concreteCanvas()),
      steel: toTexture(steelCanvas()),
      track: toTexture(trackCanvas()),
      ice: toTexture(iceCanvas()),
      waterNormal: toTexture(waterNormalCanvas(), { srgb: false }),
      hazard: toTexture(hazardCanvas()),
      glow: toTexture(glowCanvas(), { repeat: false }),
      smoke: toTexture(smokeCanvas(), { repeat: false }),
      spark: toTexture(sparkCanvas(), { repeat: false }),
      beam: toTexture(beamCanvas(), { repeat: false }),
    };
    return T;
  }

  // 程序化环境贴图：渐变天空 + 柔光板，给金属材质提供反射
  function makeEnvironment(renderer) {
    const scene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(50, 32, 16);
    const pos = geo.attributes.position, cols = [];
    const sky = new THREE.Color(0xb9cff0), hor = new THREE.Color(0x8a8f96), gnd = new THREE.Color(0x2c2820);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / 50;
      if (t > 0) tmp.copy(hor).lerp(sky, Math.pow(t, 0.6)); else tmp.copy(hor).lerp(gnd, Math.min(1, -t * 3));
      cols.push(tmp.r, tmp.g, tmp.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const panel = (w, h, x, y, z, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.96), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); scene.add(m);
    };
    panel(30, 16, -20, 34, 18, 5);
    panel(16, 10, 28, 22, -10, 2.2);
    panel(40, 6, 0, 10, -40, 1.4);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(scene, 0.03).texture;
    pmrem.dispose();
    return tex;
  }

  // ---------------- 几何构建 ----------------

  // 倒角方块：所有棱带 45° 小倒角，比直角盒子在光照下精致得多
  function chamferBox(w, h, d, r = 0.03) {
    r = Math.max(0.001, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
    const hw = w / 2 - r, hh = h / 2 - r;
    const shape = new THREE.Shape();
    shape.moveTo(-hw, -hh); shape.lineTo(hw, -hh); shape.lineTo(hw, hh); shape.lineTo(-hw, hh); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.0005, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 1, curveSegments: 1,
    });
    g.translate(0, 0, -(d - 2 * r) / 2);
    return g;
  }

  // 圆柱：轴向分别为 X / Y / Z
  function cylY(r, h, seg = 16, r2 = r) { return new THREE.CylinderGeometry(r2, r, h, seg); }
  function cylX(r, h, seg = 16) { return new THREE.CylinderGeometry(r, r, h, seg).rotateZ(Math.PI / 2); }
  function cylZ(r, h, seg = 16, r2 = r) { return new THREE.CylinderGeometry(r2, r, h, seg).rotateX(Math.PI / 2); }

  // 侧面轮廓 (z, y) 沿 X 方向挤出，用于车体
  function profileExtrudeX(points, width, bevel = 0.03) {
    const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1,
    });
    g.translate(0, 0, -(width - 2 * bevel) / 2);
    g.rotateY(-Math.PI / 2);
    return g;
  }

  // 俯视轮廓 (x, z) 向上挤出，用于炮塔
  function topExtrudeY(points, height, bevel = 0.04, segs = 2) {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: height, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 1,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, bevel, 0); // 底面落在 y=0
    return g;
  }

  function starShape(R, r, n = 5) {
    const s = new THREE.Shape();
    for (let i = 0; i < n * 2; i++) {
      const a = Math.PI / 2 + i * Math.PI / n, rad = i % 2 ? r : R;
      const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath();
    return s;
  }

  function heartShape(size) {
    const k = size, s = new THREE.Shape();
    s.moveTo(0, -0.9 * k);
    s.bezierCurveTo(0.35 * k, -0.55 * k, 1.0 * k, -0.2 * k, 0.95 * k, 0.3 * k);
    s.bezierCurveTo(0.9 * k, 0.8 * k, 0.25 * k, 0.95 * k, 0, 0.5 * k);
    s.bezierCurveTo(-0.25 * k, 0.95 * k, -0.9 * k, 0.8 * k, -0.95 * k, 0.3 * k);
    s.bezierCurveTo(-1.0 * k, -0.2 * k, -0.35 * k, -0.55 * k, 0, -0.9 * k);
    return s;
  }

  function extrude(shape, depth, bevel = 0, segs = 2, curveSegs = 12) {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: curveSegs,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  }

  // 合并多个几何体（统一转为非索引，保留 position / normal / uv）
  function mergeGeometries(list) {
    const parts = list.map(g => {
      const ng = g.index ? g.toNonIndexed() : g;
      if (!ng.attributes.normal) ng.computeVertexNormals();
      return ng;
    });
    let total = 0;
    for (const p of parts) total += p.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let o = 0;
    for (const p of parts) {
      const n = p.attributes.position.count;
      pos.set(p.attributes.position.array.subarray(0, n * 3), o * 3);
      nor.set(p.attributes.normal.array.subarray(0, n * 3), o * 3);
      if (p.attributes.uv) uv.set(p.attributes.uv.array.subarray(0, n * 2), o * 2);
      o += n;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    return g;
  }

  // 零件装配器：按材质归并零件，最后每种材质合成一个网格，大幅减少 draw call
  class PartBuilder {
    constructor() { this.groups = {}; }
    add(key, geom, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p[0], p[1], p[2]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])),
        new THREE.Vector3(s[0], s[1], s[2]),
      );
      const g = geom.clone().applyMatrix4(m);
      (this.groups[key] = this.groups[key] || []).push(g);
      return this;
    }
    build(mats, name = '') {
      const grp = new THREE.Group();
      grp.name = name;
      for (const key in this.groups) {
        const geo = mergeGeometries(this.groups[key]);
        this.groups[key].forEach(g => g.dispose());
        const mesh = new THREE.Mesh(geo, mats[key]);
        mesh.userData.matKey = key;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        grp.add(mesh);
      }
      return grp;
    }
  }

  // 手工构建三角面：quad 会根据给定法线自动校正绕序
  class GeoBuilder {
    constructor() { this.p = []; this.n = []; this.u = []; }
    _v(p, n, u) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.u.push(u[0], u[1]); }
    quad(a, b, c, d, na, nb, nc, nd, ua, ub, uc, ud) {
      const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
      const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
      const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
      const sx = na[0] + nb[0] + nc[0] + nd[0], sy = na[1] + nb[1] + nc[1] + nd[1], sz = na[2] + nb[2] + nc[2] + nd[2];
      if (cx * sx + cy * sy + cz * sz < 0) {
        [b, d] = [d, b]; [nb, nd] = [nd, nb]; [ub, ud] = [ud, ub];
      }
      this._v(a, na, ua); this._v(b, nb, ub); this._v(c, nc, uc);
      this._v(a, na, ua); this._v(c, nc, uc); this._v(d, nd, ud);
    }
    get vertexCount() { return this.p.length / 3; }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
      g.computeBoundingSphere();
      return g;
    }
  }

  // 履带环带：圆角矩形轮廓（z-y 平面），带厚度，U 坐标按弧长展开以便滚动贴图
  function trackBelt(len, h, rad, width, thick, linkLen) {
    const pts = [];
    const arc = (cz, cy, a0, a1, seg) => {
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (a1 - a0) * i / seg;
        pts.push({ z: cz + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, nz: Math.cos(a), ny: Math.sin(a) });
      }
    };
    const zf = -len / 2 + rad, zr = len / 2 - rad;
    arc(zr, h - rad, Math.PI / 2, 0, 6);          // 后上角（顶部履带向后走）
    arc(zr, rad, 0, -Math.PI / 2, 6);             // 后下角
    arc(zf, rad, -Math.PI / 2, -Math.PI, 6);      // 前下角
    arc(zf, h - rad, Math.PI, Math.PI / 2, 6);    // 前上角
    const gb = new GeoBuilder();
    const hw = width / 2;
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % pts.length];
      const dl = Math.hypot(p1.z - p0.z, p1.y - p0.y);
      if (dl < 1e-6) continue;
      const u0 = s / linkLen, u1 = (s + dl) / linkLen;
      s += dl;
      const o0 = [p0.z, p0.y], o1 = [p1.z, p1.y];
      const i0 = [p0.z - p0.nz * thick, p0.y - p0.ny * thick], i1 = [p1.z - p1.nz * thick, p1.y - p1.ny * thick];
      const n0 = [0, p0.ny, p0.nz], n1 = [0, p1.ny, p1.nz];
      const m0 = [0, -p0.ny, -p0.nz], m1 = [0, -p1.ny, -p1.nz];
      // 外表面
      gb.quad([-hw, o0[1], o0[0]], [hw, o0[1], o0[0]], [hw, o1[1], o1[0]], [-hw, o1[1], o1[0]], n0, n0, n1, n1, [u0, 0], [u0, 1], [u1, 1], [u1, 0]);
      // 内表面
      gb.quad([-hw, i0[1], i0[0]], [hw, i0[1], i0[0]], [hw, i1[1], i1[0]], [-hw, i1[1], i1[0]], m0, m0, m1, m1, [u0, 0], [u0, 1], [u1, 1], [u1, 0]);
      // 两侧边
      for (const sx of [-1, 1]) {
        const nn = [sx, 0, 0];
        gb.quad([sx * hw, o0[1], o0[0]], [sx * hw, o1[1], o1[0]], [sx * hw, i1[1], i1[0]], [sx * hw, i0[1], i0[0]], nn, nn, nn, nn, [u0, 0], [u1, 0], [u1, 0.1], [u0, 0.1]);
      }
    }
    return gb.build();
  }

  // 抖动后的低多边形团块（树冠）
  function blobGeometry(seed) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = 0.82 + 0.3 * hash2(x * 13.1 + seed + z * 3.7, y * 17.3 + z * 5.1);
      pos.setXYZ(i, x * k, y * k, z * k);
    }
    g.computeVertexNormals();
    return g;
  }

  function hexRGB(hex) {
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  }

  return {
    TAU, lerp, clamp01, smoothstep, rng, hash2, fbm, hexRGB,
    createTextures, makeEnvironment, toTexture, makeCanvas,
    chamferBox, cylX, cylY, cylZ, profileExtrudeX, topExtrudeY, starShape, heartShape, extrude,
    mergeGeometries, PartBuilder, GeoBuilder, trackBelt, blobGeometry,
  };
})();
