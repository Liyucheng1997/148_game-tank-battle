// ===== 特效：GPU 粒子 / 物理碎片 / 冲击波 / 闪光灯 / 镜头震动 =====

// 点精灵粒子系统：一次 draw call 渲染全部粒子，CPU 端做简单物理
class ParticleSystem {
  constructor(scene, texture, blending, max) {
    this.max = max;
    this.n = 0;
    const F = () => new Float32Array(max);
    this.px = F(); this.py = F(); this.pz = F();
    this.vx = F(); this.vy = F(); this.vz = F();
    this.age = F(); this.life = F(); this.s0 = F(); this.s1 = F();
    this.rot = F(); this.rv = F(); this.drag = F(); this.grav = F();
    this.alpha = F(); this.fin = F();
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
    this.scalars = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.age, this.life, this.s0, this.s1,
      this.rot, this.rv, this.drag, this.grav, this.alpha, this.fin];

    this.aPos = new Float32Array(max * 3);
    this.aCol = new Float32Array(max * 4);
    this.aSize = F(); this.aRot = F();
    const geo = new THREE.BufferGeometry();
    const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr(this.aPos, 3));
    geo.setAttribute('pcolor', attr(this.aCol, 4));
    geo.setAttribute('psize', attr(this.aSize, 1));
    geo.setAttribute('prot', attr(this.aRot, 1));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, scale: { value: 600 } },
      vertexShader: `
        attribute vec4 pcolor; attribute float psize; attribute float prot;
        uniform float scale;
        varying vec4 vColor; varying float vRot;
        void main() {
          vColor = pcolor; vRot = prot;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec4 vColor; varying float vRot;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + 0.5;
          vec4 t = texture2D(map, uv);
          gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
        }`,
      blending, transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = blending === THREE.AdditiveBlending ? 20 : 10;
    scene.add(this.points);
  }

  // o: { x,y,z, vx,vy,vz, life, s0, s1, c0, c1 (0xRRGGBB), a, drag, grav, rv, fin }
  emit(o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0; this.vz[i] = o.vz || 0;
    this.age[i] = 0; this.life[i] = o.life;
    this.s0[i] = o.s0; this.s1[i] = o.s1 === undefined ? o.s0 : o.s1;
    this.rot[i] = Math.random() * GFX.TAU; this.rv[i] = o.rv === undefined ? (Math.random() - 0.5) * 2 : o.rv;
    this.drag[i] = o.drag || 0; this.grav[i] = o.grav || 0;
    this.alpha[i] = o.a === undefined ? 1 : o.a; this.fin[i] = o.fin || 0.05;
    const a = GFX.hexRGB(o.c0), b = GFX.hexRGB(o.c1 === undefined ? o.c0 : o.c1);
    this.c0.set(a, i * 3); this.c1.set(b, i * 3);
  }

  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const arr of this.scalars) arr[i] = arr[j];
    for (let k = 0; k < 3; k++) { this.c0[i * 3 + k] = this.c0[j * 3 + k]; this.c1[i * 3 + k] = this.c1[j * 3 + k]; }
  }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this._kill(i); continue; }
      const dk = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= dk; this.vz[i] *= dk;
      this.vy[i] = this.vy[i] * dk + this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.03 && this.grav[i] < 0) { this.py[i] = 0.03; this.vy[i] *= -0.35; this.vx[i] *= 0.6; this.vz[i] *= 0.6; }
      this.rot[i] += this.rv[i] * dt;
      i++;
    }
    for (let k = 0; k < this.n; k++) {
      const t = this.age[k] / this.life[k];
      const e = 1 - (1 - t) * (1 - t);
      this.aPos[k * 3] = this.px[k]; this.aPos[k * 3 + 1] = this.py[k]; this.aPos[k * 3 + 2] = this.pz[k];
      this.aSize[k] = this.s0[k] + (this.s1[k] - this.s0[k]) * e;
      this.aRot[k] = this.rot[k];
      const f = this.fin[k];
      const a = t < f ? t / f : 1 - (t - f) / (1 - f);
      for (let c = 0; c < 3; c++) this.aCol[k * 4 + c] = this.c0[k * 3 + c] + (this.c1[k * 3 + c] - this.c0[k * 3 + c]) * t;
      this.aCol[k * 4 + 3] = this.alpha[k] * a;
    }
    const at = this.geo.attributes;
    at.position.needsUpdate = true; at.pcolor.needsUpdate = true; at.psize.needsUpdate = true; at.prot.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }

  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

// 带物理的碎片（砖块 / 装甲残片），InstancedMesh 一次绘制
class DebrisSystem {
  constructor(scene, max) {
    this.max = max; this.n = 0;
    this.items = [];
    this.mesh = new THREE.InstancedMesh(
      GFX.chamferBox(1, 1, 1, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.2 }),
      max,
    );
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    const c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, c);
    scene.add(this.mesh);
    this._o = new THREE.Object3D();
    this._c = new THREE.Color();
  }

  emit(x, y, z, vx, vy, vz, size, color, life = 1.6) {
    if (this.items.length >= this.max) return;
    this.items.push({
      x, y, z, vx, vy, vz, size, life, age: 0,
      rx: Math.random() * 3, ry: Math.random() * 3, rz: Math.random() * 3,
      wx: (Math.random() - 0.5) * 16, wy: (Math.random() - 0.5) * 16, wz: (Math.random() - 0.5) * 16,
      color: new THREE.Color(color), sx: 0.7 + Math.random() * 0.6, sy: 0.6 + Math.random() * 0.5,
    });
  }

  update(dt) {
    const o = this._o;
    let w = 0;
    for (let i = 0; i < this.items.length; i++) {
      const d = this.items[i];
      d.age += dt;
      if (d.age >= d.life) continue;
      d.vy -= 20 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      const floor = d.size * 0.3;
      if (d.y < floor) {
        d.y = floor;
        if (d.vy < 0) d.vy *= -0.32;
        d.vx *= 0.55; d.vz *= 0.55; d.wx *= 0.5; d.wy *= 0.5; d.wz *= 0.5;
      }
      d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
      const fade = Math.min(1, (d.life - d.age) / 0.35);
      o.position.set(d.x, d.y, d.z);
      o.rotation.set(d.rx, d.ry, d.rz);
      o.scale.set(d.size * d.sx * fade, d.size * d.sy * fade, d.size * fade);
      o.updateMatrix();
      this.mesh.setMatrixAt(w, o.matrix);
      this.mesh.setColorAt(w, d.color);
      this.items[w++] = d;
    }
    this.items.length = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.items.length = 0; this.mesh.count = 0; }
}

class Effects {
  constructor(r) {
    this.r = r;
    const scene = r.scene, T = r.tex;
    this.glow = new ParticleSystem(scene, T.glow, THREE.AdditiveBlending, 1600);
    this.fire = new ParticleSystem(scene, T.smoke, THREE.AdditiveBlending, 1000);
    this.smoke = new ParticleSystem(scene, T.smoke, THREE.NormalBlending, 1600);
    this.sparks = new ParticleSystem(scene, T.spark, THREE.AdditiveBlending, 1600);
    this.systems = [this.glow, this.fire, this.smoke, this.sparks];
    this.debris = new DebrisSystem(scene, 500);

    // 冲击波环
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false; m.renderOrder = 15;
      scene.add(m);
      this.rings.push({ mesh: m, t: 1, dur: 1, r0: 0, r1: 1, a: 1 });
    }
    // 爆炸闪光点光源（固定数量，避免 shader 重编译）
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xff9a40, 0, 9, 2);
      l.position.set(-100, 2, -100);
      scene.add(l);
      this.lights.push({ light: l, peak: 0, t: 1, dur: 1 });
    }
    this.emitters = [];
    this.shake = 0;
  }

  setScale(s) { for (const ps of this.systems) ps.mat.uniforms.scale.value = s; }

  clear() {
    for (const ps of this.systems) ps.clear();
    this.debris.clear();
    this.emitters.length = 0;
    for (const r of this.rings) { r.t = r.dur; r.mesh.visible = false; }
  }

  update(dt) {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.t += dt; e.acc += dt;
      while (e.acc >= e.every) { e.acc -= e.every; e.fn(e.t / e.dur); }
      if (e.t >= e.dur) this.emitters.splice(i, 1);
    }
    for (const ps of this.systems) ps.update(dt);
    this.debris.update(dt);
    for (const r of this.rings) {
      if (r.t >= r.dur) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.dur), e = 1 - Math.pow(1 - k, 3);
      const s = r.r0 + (r.r1 - r.r0) * e;
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = r.a * (1 - k);
      if (k >= 1) r.mesh.visible = false;
    }
    for (const l of this.lights) {
      if (l.t >= l.dur) { l.light.intensity = 0; continue; }
      l.t += dt;
      const k = Math.min(1, l.t / l.dur);
      l.light.intensity = l.peak * (1 - k) * (1 - k);
    }
  }

  addEmitter(dur, every, fn) { this.emitters.push({ dur, every, fn, t: 0, acc: 0 }); }

  ring(x, z, r1, dur, color, a = 0.9, y = 0.04) {
    const r = this.rings.find(q => q.t >= q.dur) || this.rings[0];
    r.mesh.position.set(x, y, z);
    r.mesh.material.color.setHex(color);
    r.mesh.visible = true;
    Object.assign(r, { t: 0, dur, r0: 0.15, r1, a });
  }

  flashLight(x, y, z, peak, dur, color = 0xff9a40) {
    let best = this.lights[0];
    for (const l of this.lights) if (l.light.intensity < best.light.intensity) best = l;
    best.light.position.set(x, y, z);
    best.light.color.setHex(color);
    Object.assign(best, { peak, t: 0, dur });
  }

  addShake(a) { this.shake = Math.min(0.6, this.shake + a); }

  // ---------- 各种爆炸配方 ----------
  burst(sys, n, x, y, z, f) { for (let i = 0; i < n; i++) sys.emit(f(i, x, y, z)); }

  static rnd(a, b) { return a + Math.random() * (b - a); }
  static dir3(minUp = 0) {
    const a = Math.random() * GFX.TAU, u = minUp + Math.random() * (1 - minUp);
    const h = Math.sqrt(1 - u * u);
    return [Math.cos(a) * h, u, Math.sin(a) * h];
  }

  bigExplosion(x, z, scale = 1, debrisColors = [0x555555, 0x333333]) {
    const R = Effects.rnd, D = Effects.dir3, y = 0.5;
    this.glow.emit({ x, y: y + 0.2, z, life: 0.18, s0: 3.5 * scale, s1: 5 * scale, c0: 0xfff6d0, c1: 0xffa040, a: 1, fin: 0.05 });
    this.burst(this.fire, Math.round(20 * scale), x, y, z, () => {
      const [dx, dy, dz] = D(0.1), sp = R(1.2, 3.2) * scale;
      return { x: x + dx * 0.3, y: y + dy * 0.3, z: z + dz * 0.3, vx: dx * sp, vy: dy * sp + 1.2, vz: dz * sp,
        life: R(0.45, 0.9), s0: R(0.7, 1.1) * scale, s1: R(1.8, 2.6) * scale, c0: 0xffe8a0, c1: 0xb02a08, a: 0.95, drag: 3, fin: 0.08 };
    });
    this.burst(this.smoke, Math.round(22 * scale), x, y, z, () => {
      const [dx, dy, dz] = D(0.2), sp = R(0.5, 1.8) * scale;
      return { x: x + dx * 0.5, y: y + dy * 0.4, z: z + dz * 0.5, vx: dx * sp, vy: dy * sp + R(0.8, 1.6), vz: dz * sp,
        life: R(1.6, 3.0), s0: R(0.8, 1.2) * scale, s1: R(2.6, 3.8) * scale, c0: 0x2a2420, c1: 0x5e5a56, a: 0.62, drag: 1.4, fin: 0.12 };
    });
    this.burst(this.sparks, Math.round(34 * scale), x, y, z, () => {
      const [dx, dy, dz] = D(0.15), sp = R(4, 10) * scale;
      return { x, y: y + 0.2, z, vx: dx * sp, vy: dy * sp + 2, vz: dz * sp,
        life: R(0.4, 1.0), s0: R(0.1, 0.2), s1: 0.04, c0: 0xfff2b0, c1: 0xff5a00, a: 1, grav: -12, drag: 0.6, fin: 0.02 };
    });
    for (let i = 0; i < Math.round(14 * scale); i++) {
      const [dx, dy, dz] = D(0.35), sp = R(2, 5.5);
      this.debris.emit(x + dx * 0.3, y + 0.3, z + dz * 0.3, dx * sp, R(4, 9), dz * sp, R(0.07, 0.22), debrisColors[i % debrisColors.length], R(1.6, 2.6));
    }
    this.ring(x, z, 3.2 * scale, 0.5, 0xffb060, 0.85);
    this.ring(x, z, 2.0 * scale, 0.8, 0x806040, 0.5);
    this.flashLight(x, 1.4, z, 70 * scale, 0.55);
    this.addShake(0.22 * scale);
    this.r.world.stampScorch(x, z, 1.1 * scale);
    // 残骸余烟
    this.addEmitter(2.6 * scale, 0.09, (k) => {
      this.smoke.emit({ x: x + R(-0.4, 0.4), y: 0.3, z: z + R(-0.4, 0.4), vx: R(-0.2, 0.2), vy: R(0.8, 1.4), vz: R(-0.2, 0.2),
        life: R(1.4, 2.2), s0: 0.5, s1: R(1.6, 2.4), c0: 0x2b2826, c1: 0x6a6662, a: 0.45 * (1 - k), drag: 0.8, fin: 0.15 });
      if (k < 0.5 && Math.random() < 0.6) {
        this.fire.emit({ x: x + R(-0.3, 0.3), y: 0.25, z: z + R(-0.3, 0.3), vy: R(0.6, 1.2), life: R(0.3, 0.5), s0: 0.5, s1: 0.2, c0: 0xffc060, c1: 0xa02000, a: 0.8 * (1 - k * 2) });
      }
    });
  }

  brickHit(x, y, z) {
    const R = Effects.rnd, D = Effects.dir3;
    this.glow.emit({ x, y, z, life: 0.1, s0: 1.0, s1: 1.4, c0: 0xffe0a0, a: 0.9 });
    this.burst(this.smoke, 7, x, y, z, () => {
      const [dx, dy, dz] = D(0.2);
      return { x, y, z, vx: dx * R(0.4, 1.2), vy: dy * R(0.3, 1) + 0.3, vz: dz * R(0.4, 1.2),
        life: R(0.6, 1.1), s0: 0.3, s1: R(0.9, 1.3), c0: 0x8d6a52, c1: 0xa89a8c, a: 0.5, drag: 2, fin: 0.1 };
    });
    for (let i = 0; i < 7; i++) {
      const [dx, , dz] = D(0.3);
      this.debris.emit(x + dx * 0.2, y, z + dz * 0.2, dx * R(1, 3.5), R(1.5, 4.5), dz * R(1, 3.5), R(0.05, 0.12),
        [0x9c4a2a, 0xa95a35, 0x7f3a1f, 0x8c8478][i % 4], R(1.0, 1.8));
    }
    this.burst(this.sparks, 5, x, y, z, () => {
      const [dx, dy, dz] = D(0.2), sp = R(2, 5);
      return { x, y, z, vx: dx * sp, vy: dy * sp, vz: dz * sp, life: R(0.15, 0.35), s0: 0.1, s1: 0.03, c0: 0xffe8a0, c1: 0xff6a00, grav: -8 };
    });
    this.addShake(0.03);
  }

  steelHit(x, y, z, broken) {
    const R = Effects.rnd, D = Effects.dir3;
    this.glow.emit({ x, y, z, life: 0.08, s0: 1.2, s1: 1.6, c0: 0xffffff, c1: 0xb0d0ff, a: 1 });
    this.burst(this.sparks, broken ? 30 : 18, x, y, z, () => {
      const [dx, dy, dz] = D(0.0), sp = R(3, 8);
      return { x, y, z, vx: dx * sp, vy: dy * sp + 1, vz: dz * sp, life: R(0.2, 0.55), s0: R(0.08, 0.15), s1: 0.02,
        c0: 0xffffff, c1: 0xffa030, grav: -14, drag: 0.5 };
    });
    this.burst(this.smoke, 3, x, y, z, () => ({ x, y, z, vy: R(0.3, 0.7), life: R(0.5, 0.8), s0: 0.25, s1: 0.8, c0: 0x777777, c1: 0x9a9a9a, a: 0.35 }));
    if (broken) {
      for (let i = 0; i < 9; i++) {
        const [dx, , dz] = D(0.3);
        this.debris.emit(x, y, z, dx * R(1.5, 4), R(2, 5), dz * R(1.5, 4), R(0.06, 0.14), i % 2 ? 0x8d969c : 0x5c6368, R(1.2, 2));
      }
      this.flashLight(x, y + 0.6, z, 18, 0.25, 0xb0d0ff);
      this.addShake(0.08);
    } else {
      this.addShake(0.02);
    }
  }

  smallPop(x, y, z, color = 0xffe0a0, n = 8) {
    const R = Effects.rnd, D = Effects.dir3;
    this.glow.emit({ x, y, z, life: 0.12, s0: 0.9, s1: 1.3, c0: color, a: 1 });
    this.burst(this.sparks, n, x, y, z, () => {
      const [dx, dy, dz] = D(0.0), sp = R(2, 6);
      return { x, y, z, vx: dx * sp, vy: dy * sp, vz: dz * sp, life: R(0.15, 0.4), s0: 0.12, s1: 0.02, c0: 0xffffff, c1: color, grav: -10 };
    });
  }

  muzzle(pos, dir) {
    const R = Effects.rnd;
    const { x, y, z } = pos;
    this.glow.emit({ x, y, z, life: 0.08, s0: 1.1, s1: 1.5, c0: 0xfff2c0, c1: 0xff9a30, a: 1 });
    for (let i = 0; i < 5; i++) {
      const sp = R(1.5, 4);
      this.fire.emit({ x, y, z, vx: dir.x * sp + R(-0.4, 0.4), vy: R(-0.2, 0.3), vz: dir.z * sp + R(-0.4, 0.4),
        life: R(0.08, 0.16), s0: R(0.35, 0.55), s1: 0.15, c0: 0xfff0b0, c1: 0xff6010, a: 0.9, drag: 6 });
    }
    for (let i = 0; i < 4; i++) {
      const sp = R(0.4, 1.4);
      this.smoke.emit({ x, y, z, vx: dir.x * sp + R(-0.3, 0.3), vy: R(0.2, 0.6), vz: dir.z * sp + R(-0.3, 0.3),
        life: R(0.5, 0.9), s0: 0.25, s1: R(0.7, 1.0), c0: 0x9a958e, c1: 0xbdb8b0, a: 0.32, drag: 2.5, fin: 0.1 });
    }
    this.flashLight(x, y + 0.2, z, 10, 0.1, 0xffc070);
  }

  spawnBeam(x, z, color) {
    const R = Effects.rnd;
    this.ring(x, z, 1.6, 0.6, color, 0.9);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * GFX.TAU, rr = R(0.2, 1.1);
      this.sparks.emit({ x: x + Math.cos(a) * rr, y: R(0, 0.3), z: z + Math.sin(a) * rr, vy: R(1.5, 3.5),
        life: R(0.4, 0.8), s0: R(0.1, 0.18), s1: 0.02, c0: 0xffffff, c1: color, a: 1 });
    }
    this.glow.emit({ x, y: 0.6, z, life: 0.35, s0: 2.6, s1: 0.8, c0: color, a: 0.9 });
  }

  sparkle(x, y, z, color, n = 16, spread = 0.6) {
    const R = Effects.rnd, D = Effects.dir3;
    for (let i = 0; i < n; i++) {
      const [dx, dy, dz] = D(0.2), sp = R(0.8, 2.4);
      this.sparks.emit({ x: x + dx * spread * 0.3, y, z: z + dz * spread * 0.3, vx: dx * sp, vy: dy * sp + 0.8, vz: dz * sp,
        life: R(0.4, 0.9), s0: R(0.12, 0.2), s1: 0.02, c0: 0xffffff, c1: color, drag: 2 });
    }
  }
}
