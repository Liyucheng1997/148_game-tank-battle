// ===== 场景地形与地块：地面 / 砖墙 / 钢墙 / 水面 / 树林 / 冰面 / 边框 =====
const WALL_H = 0.9;          // 墙体高度（世界单位）
const WATER_DEPTH = 0.5;     // 河床深度

class World {
  constructor(r) {
    this.r = r;
    const scene = r.scene, T = r.tex;
    this.T = T;
    const MSM = (o) => new THREE.MeshStandardMaterial(o);
    this.mat = {
      ground: MSM({ map: T.ground.texture, roughness: 0.96 }),
      bank: MSM({ color: 0x4a3e2e, roughness: 1, map: T.grain }),
      basin: MSM({ color: 0x1e2a26, roughness: 1, map: T.grain }),
      brick: MSM({ color: 0xffffff, map: T.grain, roughness: 0.82 }),
      mortar: MSM({ color: 0x8e877b, map: T.grain, roughness: 0.95 }),
      steel: MSM({ color: 0x8f989f, map: T.steel, roughness: 0.34, metalness: 0.85 }),
      steelTop: MSM({ color: 0xb9c2c8, map: T.steel, roughness: 0.24, metalness: 0.9 }),
      rivet: MSM({ color: 0x5f676d, roughness: 0.3, metalness: 0.95 }),
      leaf: MSM({ color: 0xffffff, roughness: 0.82, flatShading: true }),
      trunk: MSM({ color: 0x4a3626, roughness: 0.9 }),
      ice: MSM({ color: 0x86c4ee, map: T.ice, transparent: true, opacity: 0.88, roughness: 0.04, metalness: 0.15 }),
      concrete: MSM({ map: T.concrete, roughness: 0.88 }),
      hazard: MSM({ map: T.hazard, roughness: 0.6 }),
      lamp: MSM({ color: 0xffb060, emissive: 0xff8a20, emissiveIntensity: 2.2 }),
      outer: MSM({ map: T.outer, roughness: 1 }),
    };

    // 外围地表（中间挖空战场区域，否则会盖住河床）
    const S = 100, c = GRID / 2;
    const outerShape = new THREE.Shape([[c - S, -c - S], [c + S, -c - S], [c + S, -c + S], [c - S, -c + S]].map(([x, y]) => new THREE.Vector2(x, y)));
    outerShape.holes.push(new THREE.Path([[0, 0], [0, -GRID], [GRID, -GRID], [GRID, 0]].map(([x, y]) => new THREE.Vector2(x, y))));
    const outer = new THREE.Mesh(new THREE.ShapeGeometry(outerShape).rotateX(-Math.PI / 2), this.mat.outer);
    T.outer.repeat.set(0.12, 0.12);
    outer.position.y = -0.03;
    outer.receiveShadow = true;
    scene.add(outer);

    // 地图地面（含河床开口），每关重建
    this.ground = new THREE.Mesh(new THREE.BufferGeometry(), [this.mat.ground, this.mat.bank]);
    this.ground.receiveShadow = true;
    scene.add(this.ground);
    const basin = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID).rotateX(-Math.PI / 2), this.mat.basin);
    basin.position.set(GRID / 2, -WATER_DEPTH, GRID / 2);
    basin.receiveShadow = true;
    scene.add(basin);

    // 双层水面：两张法线贴图以不同速度滚动，叠出自然波纹
    const n1 = T.waterNormal, n2 = T.waterNormal.clone();
    n1.repeat.set(7, 7); n2.repeat.set(4, 4);
    this.waterNormals = [n1, n2];
    this.waterA = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
      color: 0x14527e, roughness: 0.06, metalness: 0.25, normalMap: n1, normalScale: new THREE.Vector2(0.8, 0.8),
      transparent: true, opacity: 0.82,
    }));
    this.waterA.position.set(GRID / 2, -0.2, GRID / 2);
    this.waterB = new THREE.Mesh(this.waterA.geometry, new THREE.MeshStandardMaterial({
      color: 0x3a8cc0, roughness: 0.1, metalness: 0.1, normalMap: n2, normalScale: new THREE.Vector2(0.5, 0.5),
      transparent: true, opacity: 0.3, depthWrite: false,
    }));
    this.waterB.position.set(GRID / 2, -0.18, GRID / 2);
    this.waterA.receiveShadow = true;
    scene.add(this.waterA, this.waterB);

    this._buildFrame(scene);
    this._buildInstancers(scene);

    this.snap = new Uint8Array(GRID * GRID).fill(255);
    this.grid = null;
    this.marksDirty = false;
    this.marksUploadAt = 0;
  }

  // 地图四周的混凝土围墙 + 警示条 + 角柱灯
  _buildFrame(scene) {
    const b = new GFX.PartBuilder();
    const t = 0.8, h = 0.55, L = GRID + 2 * t;
    b.add('concrete', GFX.chamferBox(L, h, t, 0.06), [GRID / 2, h / 2, -t / 2]);
    b.add('concrete', GFX.chamferBox(L, h, t, 0.06), [GRID / 2, h / 2, GRID + t / 2]);
    b.add('concrete', GFX.chamferBox(t, h, GRID, 0.06), [-t / 2, h / 2, GRID / 2]);
    b.add('concrete', GFX.chamferBox(t, h, GRID, 0.06), [GRID + t / 2, h / 2, GRID / 2]);
    const s = 0.16;
    b.add('hazard', GFX.chamferBox(GRID, 0.02, s, 0.005), [GRID / 2, h + 0.005, -s / 2 - 0.04]);
    b.add('hazard', GFX.chamferBox(GRID, 0.02, s, 0.005), [GRID / 2, h + 0.005, GRID + s / 2 + 0.04]);
    b.add('hazard', GFX.chamferBox(s, 0.02, GRID, 0.005), [-s / 2 - 0.04, h + 0.005, GRID / 2], [0, 0, 0]);
    b.add('hazard', GFX.chamferBox(s, 0.02, GRID, 0.005), [GRID + s / 2 + 0.04, h + 0.005, GRID / 2]);
    for (const x of [-t / 2, GRID + t / 2]) for (const z of [-t / 2, GRID + t / 2]) {
      b.add('concrete', GFX.chamferBox(1.2, 0.9, 1.2, 0.08), [x, 0.45, z]);
      b.add('rivet', GFX.cylY(0.18, 0.08, 16), [x, 0.94, z]);
      b.add('lamp', new THREE.SphereGeometry(0.13, 16, 10), [x, 1.02, z]);
    }
    // 每隔一段的立柱，增加节奏感
    for (let k = 4; k < GRID; k += 6) {
      for (const [x, z] of [[k, -t / 2], [k, GRID + t / 2], [-t / 2, k], [GRID + t / 2, k]]) {
        b.add('concrete', GFX.chamferBox(0.95, 0.7, 0.95, 0.06), [x, 0.35, z]);
      }
    }
    scene.add(b.build(this.mat, 'frame'));
  }

  _buildInstancers(scene) {
    const N = GRID * GRID;
    const hc = WALL_H / 4;
    this.brickFull = this._instanced(GFX.chamferBox(0.455, hc - 0.03, 0.455, 0.022), this.mat.brick, N * 12, true);
    this.brickHalf = this._instanced(GFX.chamferBox(0.205, hc - 0.03, 0.455, 0.022), this.mat.brick, N * 8, true);
    this.mortar = this._instanced(GFX.chamferBox(0.95, WALL_H - 0.02, 0.95, 0.01), this.mat.mortar, N, false);
    this.steelBlock = this._instanced(GFX.chamferBox(0.97, WALL_H - 0.05, 0.97, 0.05), this.mat.steel, N, false);
    this.steelTop = this._instanced(GFX.chamferBox(0.74, 0.05, 0.74, 0.02), this.mat.steelTop, N, false);
    this.steelBar = this._instanced(GFX.chamferBox(0.84, 0.035, 0.08, 0.012), this.mat.steelTop, N * 2, false);
    this.rivets = this._instanced(new THREE.SphereGeometry(0.038, 10, 6, 0, GFX.TAU, 0, Math.PI / 2), this.mat.rivet, N * 8, false);
    const blob = GFX.blobGeometry(3);
    this.leaves = this._instanced(blob, this.mat.leaf, N * 4, true);
    this.trunks = this._instanced(GFX.cylY(0.06, 0.6, 6, 0.04), this.mat.trunk, N, false);
    this.iceTiles = this._instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.mat.ice, N, false);
    this.iceTiles.castShadow = false;

    // 树冠随风轻摆
    this.windTime = { value: 0 };
    this.mat.leaf.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = this.windTime;
      shader.vertexShader = 'uniform float uWind;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float sw = sin(uWind * 1.7 + ip.x * 0.9 + ip.z * 0.6) * 0.05 * (position.y + 1.0);
          transformed.x += sw; transformed.z += sw * 0.6;
        #endif`);
    };
  }

  _instanced(geo, mat, max, colored) {
    const m = new THREE.InstancedMesh(geo, mat, max);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    if (colored) {
      const c = new THREE.Color(1, 1, 1);
      for (let i = 0; i < max; i++) m.setColorAt(i, c);
    }
    this.r.scene.add(m);
    return m;
  }

  // 每帧调用：检测网格变化，按需重建
  sync(grid, effects) {
    if (grid !== this.grid) {
      this.grid = grid;
      this._rebuildStatic(grid);
      this._rebuildBlocks(grid);
      return true;
    }
    let changed = false;
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const t = grid[r][c], old = this.snap[r * GRID + c];
        if (t === old) continue;
        changed = true;
        // 铁锹道具：砖墙 ⇄ 钢墙 时的闪光
        if (effects && ((old === TILE.BRICK && t === TILE.STEEL) || (old === TILE.STEEL && t === TILE.BRICK))) {
          effects.sparkle(c + 0.5, WALL_H, r + 0.5, t === TILE.STEEL ? 0xbfe0ff : 0xffb070, 4, 0.5);
        }
      }
    }
    if (changed) this._rebuildBlocks(grid);
    return false;
  }

  _rebuildStatic(grid) {
    this._buildGround(grid);
    this._paintGround(grid);
    let hasWater = false;
    const o = new THREE.Object3D();
    let nl = 0, nt = 0, ni = 0;
    const green = [0x2d6a2a, 0x3a7c30, 0x285c28, 0x47893a, 0x356f2c];
    const col = new THREE.Color();
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const t = grid[r][c];
        if (t === TILE.WATER) hasWater = true;
        if (t === TILE.FOREST) {
          const R = GFX.rng(r * 977 + c * 131 + 7);
          o.rotation.set(0, 0, 0);
          o.position.set(c + 0.5 + (R() - 0.5) * 0.3, 0.3, r + 0.5 + (R() - 0.5) * 0.3);
          o.scale.set(1, 1, 1);
          o.updateMatrix(); this.trunks.setMatrixAt(nt++, o.matrix);
          const blobs = 3 + (R() < 0.4 ? 1 : 0);
          for (let k = 0; k < blobs; k++) {
            const s = 0.42 + R() * 0.2;
            o.position.set(c + 0.2 + R() * 0.6, 0.8 + R() * 0.32, r + 0.2 + R() * 0.6);
            o.rotation.set(R() * 3, R() * 3, R() * 3);
            o.scale.set(s, s * (0.75 + R() * 0.25), s);
            o.updateMatrix();
            this.leaves.setMatrixAt(nl, o.matrix);
            col.setHex(green[Math.floor(R() * green.length)]);
            col.offsetHSL(0, 0, (R() - 0.5) * 0.04);
            this.leaves.setColorAt(nl, col);
            nl++;
          }
        } else if (t === TILE.ICE) {
          const R = GFX.rng(r * 51 + c * 7 + 3);
          o.position.set(c + 0.5, 0.012, r + 0.5);
          o.rotation.set(0, Math.floor(R() * 4) * Math.PI / 2, 0);
          o.scale.set(1, 1, 1);
          o.updateMatrix(); this.iceTiles.setMatrixAt(ni++, o.matrix);
        }
      }
    }
    this.leaves.count = nl; this.trunks.count = nt; this.iceTiles.count = ni;
    for (const m of [this.leaves, this.trunks, this.iceTiles]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.waterA.visible = this.waterB.visible = hasWater;
  }

  // 地面网格：非水面格子为顶面，与水面相邻处生成竖直河岸
  _buildGround(grid) {
    const top = new GFX.GeoBuilder(), wall = new GFX.GeoBuilder();
    const up = [0, 1, 0];
    const isWater = (r, c) => r >= 0 && c >= 0 && r < GRID && c < GRID && grid[r][c] === TILE.WATER;
    const uv = (x, z) => [x / GRID, 1 - z / GRID];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (isWater(r, c)) continue;
        const x0 = c, x1 = c + 1, z0 = r, z1 = r + 1;
        top.quad([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], up, up, up, up, uv(x0, z0), uv(x1, z0), uv(x1, z1), uv(x0, z1));
        const y1 = -WATER_DEPTH;
        if (isWater(r - 1, c)) { const n = [0, 0, -1]; wall.quad([x0, 0, z0], [x1, 0, z0], [x1, y1, z0], [x0, y1, z0], n, n, n, n, [0, 1], [1, 1], [1, 0], [0, 0]); }
        if (isWater(r + 1, c)) { const n = [0, 0, 1]; wall.quad([x0, 0, z1], [x1, 0, z1], [x1, y1, z1], [x0, y1, z1], n, n, n, n, [0, 1], [1, 1], [1, 0], [0, 0]); }
        if (isWater(r, c - 1)) { const n = [-1, 0, 0]; wall.quad([x0, 0, z0], [x0, 0, z1], [x0, y1, z1], [x0, y1, z0], n, n, n, n, [0, 1], [1, 1], [1, 0], [0, 0]); }
        if (isWater(r, c + 1)) { const n = [1, 0, 0]; wall.quad([x1, 0, z0], [x1, 0, z1], [x1, y1, z1], [x1, y1, z0], n, n, n, n, [0, 1], [1, 1], [1, 0], [0, 0]); }
      }
    }
    const merge = (a, b) => {
      const g = new THREE.BufferGeometry();
      const cat = (k) => new THREE.Float32BufferAttribute(a[k].concat(b[k]), k === 'u' ? 2 : 3);
      g.setAttribute('position', cat('p'));
      g.setAttribute('normal', cat('n'));
      g.setAttribute('uv', cat('u'));
      g.addGroup(0, a.vertexCount, 0);
      g.addGroup(a.vertexCount, b.vertexCount, 1);
      g.computeBoundingSphere();
      return g;
    };
    this.ground.geometry.dispose();
    this.ground.geometry = merge(top, wall);
  }

  // 在地面贴图上画出关卡装饰：树林下的草地、基地的水泥台、出生点标记
  _paintGround(grid) {
    const G = this.T.ground, ctx = G.ctx, k = G.size / GRID;
    ctx.putImageData(G.base, 0, 0);
    const R = GFX.rng(71);
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (grid[r][c] !== TILE.FOREST) continue;
        for (let i = 0; i < 5; i++) {
          const x = (c + R()) * k, y = (r + R()) * k, rad = k * (0.5 + R() * 0.5);
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, 'rgba(40,70,28,0.55)'); g.addColorStop(1, 'rgba(40,70,28,0)');
          ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
      }
    }
    const base = findBase(grid);
    if (base) {
      const cx = (base.c + 1) * k, cy = (base.r + 1) * k, s = 1.25 * k;
      ctx.fillStyle = 'rgba(120,118,110,0.85)'; ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
      ctx.strokeStyle = 'rgba(60,58,52,0.9)'; ctx.lineWidth = 2; ctx.strokeRect(cx - s, cy - s, s * 2, s * 2);
    }
    const ringAt = (cx, cy, color, dashed) => {
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      if (dashed) ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(cx * k, cy * k, 0.9 * k, 0, GFX.TAU); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx * k, cy * k, 0.55 * k, 0, GFX.TAU); ctx.stroke();
      ctx.restore();
    };
    for (const x of [1, 13, 25]) ringAt(x, 1, 'rgba(200,50,40,0.55)', true);
    ringAt(9, 25, 'rgba(240,190,50,0.55)', false);
    ringAt(17, 25, 'rgba(70,150,240,0.55)', false);
    G.texture.needsUpdate = true;
  }

  _rebuildBlocks(grid) {
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    const hc = WALL_H / 4;
    const brickCols = [0x9a4527, 0xa5512f, 0x8b3d22, 0xae5b36, 0x93492b, 0x7f3a20];
    let nf = 0, nh = 0, nm = 0, ns = 0, nb = 0, nr = 0;
    const put = (mesh, idx, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => {
      o.position.set(x, y, z); o.rotation.set(0, ry, 0); o.scale.set(sx, sy, sz);
      o.updateMatrix(); mesh.setMatrixAt(idx, o.matrix);
    };
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const t = grid[r][c];
        this.snap[r * GRID + c] = t;
        if (t === TILE.BRICK) {
          put(this.mortar, nm++, c + 0.5, (WALL_H - 0.02) / 2, r + 0.5);
          const R = GFX.rng(r * 733 + c * 97 + 11);
          for (let k = 0; k < 4; k++) {
            const y = k * hc + hc / 2;
            for (const zz of [0.25, 0.75]) {
              const xs = k % 2 === 0 ? [[0.25, 1], [0.75, 1]] : [[0.125, 0], [0.5, 1], [0.875, 0]];
              for (const [xx, full] of xs) {
                const mesh = full ? this.brickFull : this.brickHalf;
                const idx = full ? nf++ : nh++;
                put(mesh, idx, c + xx + (R() - 0.5) * 0.008, y, r + zz + (R() - 0.5) * 0.008, (R() - 0.5) * 0.03);
                col.setHex(brickCols[Math.floor(R() * brickCols.length)]);
                col.offsetHSL((R() - 0.5) * 0.01, 0, (R() - 0.5) * 0.05);
                mesh.setColorAt(idx, col);
              }
            }
          }
        } else if (t === TILE.STEEL) {
          const yb = (WALL_H - 0.05) / 2;
          put(this.steelBlock, ns, c + 0.5, yb, r + 0.5);
          put(this.steelTop, ns++, c + 0.5, WALL_H - 0.03, r + 0.5);
          put(this.steelBar, nb++, c + 0.5, WALL_H - 0.035, r + 0.5, Math.PI / 4);
          put(this.steelBar, nb++, c + 0.5, WALL_H - 0.035, r + 0.5, -Math.PI / 4);
          for (const [dx, dz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42], [0, -0.42], [0, 0.42], [-0.42, 0], [0.42, 0]]) {
            put(this.rivets, nr++, c + 0.5 + dx, WALL_H - 0.05, r + 0.5 + dz, 0, 1, 0.7, 1);
          }
        }
      }
    }
    this.brickFull.count = nf; this.brickHalf.count = nh; this.mortar.count = nm;
    this.steelBlock.count = ns; this.steelTop.count = ns; this.steelBar.count = nb; this.rivets.count = nr;
    for (const m of [this.brickFull, this.brickHalf, this.mortar, this.steelBlock, this.steelTop, this.steelBar, this.rivets]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  // ---------- 地面痕迹：履带印 / 焦痕 ----------
  stampTrack(x, z, yaw, onIce) {
    const G = this.T.ground, ctx = G.ctx, k = G.size / GRID;
    ctx.save();
    ctx.translate(x * k, z * k);
    ctx.rotate(-yaw);
    ctx.fillStyle = onIce ? 'rgba(230,245,255,0.12)' : 'rgba(34,26,16,0.16)';
    for (const sx of [-0.7, 0.7]) {
      for (let i = 0; i < 3; i++) ctx.fillRect((sx - 0.19) * k, (-0.1 + i * 0.08) * k, 0.38 * k, 0.045 * k);
    }
    ctx.restore();
    this.marksDirty = true;
  }

  stampScorch(x, z, rad) {
    const G = this.T.ground, ctx = G.ctx, k = G.size / GRID;
    const cx = x * k, cy = z * k, R = rad * k;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, 'rgba(14,11,9,0.75)');
    g.addColorStop(0.55, 'rgba(24,19,14,0.45)');
    g.addColorStop(1, 'rgba(24,19,14,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, GFX.TAU); ctx.fill();
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * GFX.TAU, d = R * (0.4 + Math.random() * 0.7);
      ctx.fillStyle = 'rgba(16,12,10,0.35)';
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * (0.05 + Math.random() * 0.1), 0, GFX.TAU); ctx.fill();
    }
    this.marksDirty = true;
  }

  update(dt, time, now) {
    this.windTime.value = time;
    this.waterNormals[0].offset.set(time * 0.012, time * 0.02);
    this.waterNormals[1].offset.set(-time * 0.018, time * 0.009);
    // 履带印上传 GPU 做节流
    if (this.marksDirty && now - this.marksUploadAt > 120) {
      this.T.ground.texture.needsUpdate = true;
      this.marksDirty = false;
      this.marksUploadAt = now;
    }
  }

  tileAt(x, z) {
    const c = Math.floor(x), r = Math.floor(z);
    if (!this.grid || r < 0 || c < 0 || r >= GRID || c >= GRID) return TILE.EMPTY;
    return this.grid[r][c];
  }
}
