// ===== 2.5D 渲染器：倾斜视角的 Three.js 场景，按帧同步游戏逻辑状态 =====
const CAM_ELEVATION = 50 * Math.PI / 180;   // 镜头俯角：越小越有立体感，越大越接近正俯视

class Renderer3D {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121720);
    scene.fog = new THREE.Fog(0x121720, 48, 95);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 220);
    this.target = new THREE.Vector3(GRID / 2, 0, GRID / 2 + 0.4);

    this.tex = GFX.createTextures();
    scene.environment = GFX.makeEnvironment(renderer);
    scene.environmentIntensity = 0.55;
    Models.init(this.tex);

    this._setupLights();
    this._setupShared();
    this.world = new World(this);
    this.effects = new Effects(this);
    this.baseView = new BaseView(this);

    this.tankTemplates = {};
    this.powerupTemplates = {};
    this.tankViews = new Map();
    this.bulletViews = new Map();
    this.powerupViews = new Map();
    this.seenExplosions = new WeakSet();
    this._tmpV = new THREE.Vector3();

    this.lastT = performance.now();
    this.time = 0;
    this.menuAngle = 0.5;
    this.playPos = new THREE.Vector3();
    this.camPos = null;
    this.camLook = this.target.clone();

    this.resize();
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    else window.addEventListener('resize', () => this.resize());
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xcfdfff, 0x4a4030, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.9);
    sun.position.set(GRID / 2 - 11, 26, GRID / 2 + 7);
    sun.target.position.set(GRID / 2, 0, GRID / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 5; sc.far = 70;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    // 冷色轮廓补光
    const rim = new THREE.DirectionalLight(0x7fa8ff, 0.6);
    rim.position.set(GRID / 2 + 12, 10, GRID / 2 - 14);
    this.scene.add(rim);
  }

  _setupShared() {
    const add = THREE.AdditiveBlending;
    const shieldMat = (color) => new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, time: { value: 0 } },
      vertexShader: `
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          vP = position;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 color; uniform float time;
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          float hex = abs(sin(vP.x * 9.0 + time) * sin(vP.y * 9.0 - time * 1.3) * sin(vP.z * 9.0));
          float band = smoothstep(0.85, 1.0, sin(vP.y * 6.0 - time * 4.0));
          float a = f * 0.85 + hex * 0.08 + band * 0.18 + 0.03;
          gl_FragColor = vec4(color * (0.6 + f * 0.8), a);
        }`,
      transparent: true, blending: add, depthWrite: false, side: THREE.DoubleSide,
    });
    this.shared = {
      haloGeo: new THREE.RingGeometry(1.02, 1.14, 48).rotateX(-Math.PI / 2),
      haloMats: {
        1: new THREE.MeshBasicMaterial({ color: 0xffcf40, transparent: true, opacity: 0.6, blending: add, depthWrite: false }),
        2: new THREE.MeshBasicMaterial({ color: 0x5cb8ff, transparent: true, opacity: 0.6, blending: add, depthWrite: false }),
      },
      shieldGeo: new THREE.SphereGeometry(1.28, 40, 20),
      shieldMats: { spawn: shieldMat(0x9fe8ff), helmet: shieldMat(0xffd060) },
      pipGeo: GFX.chamferBox(0.18, 0.07, 0.07, 0.015),
      pipOn: new THREE.MeshBasicMaterial({ color: 0x6dff7a }),
      pipOff: new THREE.MeshBasicMaterial({ color: 0x3a2020 }),
      shellGeo: GFX.mergeGeometries([
        GFX.cylZ(0.05, 0.16, 12).translate(0, 0, 0.02),
        new THREE.ConeGeometry(0.05, 0.1, 12).rotateX(-Math.PI / 2).translate(0, 0, -0.11),
      ]),
      shellMatP: new THREE.MeshBasicMaterial({ color: 0xfff0a0 }),
      shellMatE: new THREE.MeshBasicMaterial({ color: 0xffd0c0 }),
      bulletGlowP: new THREE.SpriteMaterial({ map: this.tex.glow, color: 0xffb030, blending: add, depthWrite: false }),
      bulletGlowE: new THREE.SpriteMaterial({ map: this.tex.glow, color: 0xff5030, blending: add, depthWrite: false }),
      discGeo: new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2),
      beamGeo: new THREE.CylinderGeometry(0.62, 0.8, 2.2, 28, 1, true),
      colors: {
        damaged: new THREE.Color(0xb8672a),
        charred: new THREE.Color(0x2a1e16),
        ice: new THREE.Color(0xa8dcff),
      },
    };
  }

  getTankTemplate(tank) {
    const spec = Models.tankSpec(tank);
    if (!this.tankTemplates[spec.key]) this.tankTemplates[spec.key] = { key: spec.key, ...Models.buildTank(spec) };
    return this.tankTemplates[spec.key];
  }

  getPowerupTemplate(type) {
    if (!this.powerupTemplates[type]) this.powerupTemplates[type] = Models.buildPowerup(type);
    return this.powerupTemplates[type];
  }

  // ---------- 尺寸与镜头 ----------
  resize() {
    const el = this.canvas.parentElement;
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dir = new THREE.Vector3(0, Math.sin(CAM_ELEVATION), Math.cos(CAM_ELEVATION));
    const d = this._fitDistance(dir, 0.97);
    this.playPos.copy(this.target).addScaledVector(dir, d);
    this.menuDist = d * 1.02;
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.effects.setScale(buf.y / (2 * Math.tan(this.camera.fov * DEG / 2)));
  }

  // 二分搜索相机距离，使整张地图（含围墙）恰好铺满画面
  _fitDistance(dir, margin) {
    const cam = this.camera.clone();
    const pts = [];
    for (const x of [-0.8, GRID + 0.8]) for (const z of [-0.8, GRID + 0.8]) for (const y of [0, 1]) pts.push(new THREE.Vector3(x, y, z));
    const v = new THREE.Vector3();
    let lo = 5, hi = 300;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      cam.position.copy(this.target).addScaledVector(dir, mid);
      cam.lookAt(this.target);
      cam.updateMatrixWorld();
      const ok = pts.every(p => { v.copy(p).project(cam); return Math.abs(v.x) <= margin && Math.abs(v.y) <= margin; });
      if (ok) hi = mid; else lo = mid;
    }
    return hi;
  }

  _menuPose(out) {
    const el = 40 * DEG, R = this.menuDist;
    return out.set(
      this.target.x + Math.sin(this.menuAngle) * Math.cos(el) * R,
      Math.sin(el) * R,
      this.target.z + Math.cos(this.menuAngle) * Math.cos(el) * R,
    );
  }

  _updateCamera(dt, inMenu) {
    const desired = inMenu ? this._menuPose(new THREE.Vector3()) : this.playPos;
    if (inMenu) this.menuAngle += dt * 0.1;
    if (!this.camPos) this.camPos = desired.clone();
    const k = 1 - Math.exp(-dt * (inMenu ? 2 : 3.2));
    this.camPos.lerp(desired, k);
    const cam = this.camera;
    cam.position.copy(this.camPos);
    const fx = this.effects;
    if (fx.shake > 0.001) {
      const s = fx.shake;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      fx.shake *= Math.exp(-dt * 7);
    }
    cam.lookAt(this.camLook);
  }

  // ---------- 菜单展示场景 ----------
  _demo() {
    if (!this.demo) {
      const mk = (x, y, dir, opts) => {
        const t = new Tank(x * UNIT, y * UNIT, dir, opts);
        t.invulnerableUntil = 0;
        return t;
      };
      this.demo = {
        grid: getLevelGrid(0),
        base: null,
        tanks: [
          mk(8, 24, DIR.UP, { isPlayer: true, playerIndex: 1 }),
          mk(16, 24, DIR.UP, { isPlayer: true, playerIndex: 2 }),
          mk(0, 0, DIR.DOWN, { isPlayer: false, enemyType: 'BASIC' }),
          mk(12, 0, DIR.DOWN, { isPlayer: false, enemyType: 'FAST' }),
          mk(24, 0, DIR.DOWN, { isPlayer: false, enemyType: 'POWER' }),
          mk(12, 8, DIR.DOWN, { isPlayer: false, enemyType: 'ARMOR' }),
        ],
      };
      this.demo.base = findBase(this.demo.grid);
    }
    return this.demo;
  }

  // ---------- 主渲染 ----------
  render() {
    const now = performance.now();
    const dt = Math.min((now - this.lastT) / 1000, 0.05);
    this.lastT = now;
    const g = this.game;
    const inMenu = g.state === STATE.MENU || !g.grid;
    const simDt = g.state === STATE.PAUSED ? 0 : dt;
    this.time += simDt;

    const demo = inMenu ? this._demo() : null;
    const grid = inMenu ? demo.grid : g.grid;
    if (this.world.sync(grid, this.effects)) {
      // 换关：清空旧视图与特效，坦克重新播放出生动画
      for (const v of this.tankViews.values()) v.dispose();
      this.tankViews.clear();
      this.effects.clear();
      this.baseView.place(inMenu ? demo.base : { r: g.base.r, c: g.base.c });
    }

    // 先处理爆炸（此时被击毁坦克的视图还在，可取其涂装色做碎片）
    if (!inMenu) this._syncExplosions(g.explosions);
    const tanks = inMenu ? demo.tanks : g.allTanks().filter(t => t.alive);
    this._syncTanks(tanks, simDt, now);
    this._syncBullets(inMenu ? [] : g.bullets, simDt);
    this._syncPowerups(inMenu ? [] : g.powerups, simDt, now);
    this.baseView.update(simDt, inMenu ? true : g.base.alive);

    this.shared.shieldMats.spawn.uniforms.time.value = this.time;
    this.shared.shieldMats.helmet.uniforms.time.value = this.time;
    this.effects.update(simDt);
    this.world.update(simDt, this.time, now);
    this._updateCamera(dt, inMenu);
    this.renderer.render(this.scene, this.camera);
  }

  _syncTanks(tanks, dt, now) {
    const seen = new Set();
    for (const t of tanks) {
      seen.add(t);
      let v = this.tankViews.get(t);
      const key = Models.tankSpec(t).key;
      let spawn = true;
      if (v && v.key !== key) {         // 玩家升级：换装新模型
        v.dispose(); v = null; spawn = false;
        const p = (t.x + t.w / 2) * PX, q = (t.y + t.h / 2) * PX;
        this.effects.sparkle(p, 0.9, q, 0xffd24a, 40, 1.2);
        this.effects.ring(p, q, 2, 0.5, 0xffd24a);
      }
      if (!v) {
        v = new TankView(this, t, this.getTankTemplate(t), spawn);
        this.tankViews.set(t, v);
      }
      v.update(dt, now);
    }
    for (const [t, v] of this.tankViews) {
      if (!seen.has(t)) { v.dispose(); this.tankViews.delete(t); }
    }
  }

  _syncBullets(bullets, dt) {
    const seen = new Set();
    for (const b of bullets) {
      if (!b.alive) continue;
      seen.add(b);
      let v = this.bulletViews.get(b);
      if (!v) {
        v = new BulletView(this, b);
        this.bulletViews.set(b, v);
        // 炮口火焰 + 后坐
        const ov = this.tankViews.get(b.owner);
        if (ov) {
          ov.fire();
          const tip = ov.gunTipWorld(this._tmpV);
          this.effects.muzzle(tip, { x: b.dir.x, z: b.dir.y });
        }
      }
      v.update(dt);
    }
    for (const [b, v] of this.bulletViews) {
      if (!seen.has(b)) { v.dispose(); this.bulletViews.delete(b); }
    }
  }

  _syncPowerups(list, dt, now) {
    const seen = new Set();
    for (const pu of list) {
      if (!pu.alive) continue;
      seen.add(pu);
      let v = this.powerupViews.get(pu);
      if (!v) { v = new PowerupView(this, pu); this.powerupViews.set(pu, v); }
      v.update(dt, now);
    }
    for (const [pu, v] of this.powerupViews) {
      if (!seen.has(pu)) {
        v.dispose(now - pu.spawnAt < ITEM_LIFETIME_MS - 30);
        this.powerupViews.delete(pu);
      }
    }
  }

  _syncExplosions(list) {
    const fx = this.effects;
    for (const ex of list) {
      if (this.seenExplosions.has(ex)) continue;
      this.seenExplosions.add(ex);
      const x = (ex.x + ex.size / 2) * PX, z = (ex.y + ex.size / 2) * PX;
      switch (ex.kind) {
        case 'brick': fx.brickHit(x, 0.7, z); break;
        case 'steel': fx.steelHit(x, 0.75, z, false); break;
        case 'steel_break': fx.steelHit(x, 0.75, z, true); break;
        case 'bullet': fx.smallPop(x, 0.78, z, 0xffd080, 12); break;
        case 'armor': fx.smallPop(x, 0.78, z, 0x9fd0ff, 14); fx.addShake(0.03); break;
        case 'edge': fx.smallPop(x, 0.78, z, 0xffc070, 6); break;
        case 'base': fx.bigExplosion(x, z, 1.6, [0xffc23a, 0x55595e, 0x2a2522]); break;
        default: {
          const ov = [...this.tankViews.values()].find(v => Math.abs(v.px - x) < 0.6 && Math.abs(v.pz - z) < 0.6);
          const paint = ov ? ov.basePaint.getHex() : 0x777777;
          fx.bigExplosion(x, z, 1, [paint, 0x333333, 0x1d1d1f]);
        }
      }
    }
  }
}
