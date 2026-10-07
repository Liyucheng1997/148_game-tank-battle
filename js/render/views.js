// ===== 实体视图：把游戏逻辑对象（坦克 / 子弹 / 道具 / 基地）映射成 3D 对象 =====
const DEG = Math.PI / 180;
const PX = 1 / UNIT;

function wrapAngle(a) {
  while (a > Math.PI) a -= GFX.TAU;
  while (a < -Math.PI) a += GFX.TAU;
  return a;
}

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// 局部坐标 (lx, lz) 按偏航角旋转到世界坐标
function yawRotate(lx, lz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [lx * c + lz * s, -lx * s + lz * c];
}

class TankView {
  constructor(r, tank, tmpl, spawnAnim) {
    this.r = r;
    this.tank = tank;
    this.tmpl = tmpl;
    this.key = tmpl.key;
    const root = tmpl.root.clone(true);
    this.root = root;
    this.yawNode = root.getObjectByName('yaw');
    this.body = root.getObjectByName('body');
    this.turret = root.getObjectByName('turret');
    this.gun = root.getObjectByName('gun');
    this.antenna = root.getObjectByName('antenna');
    this.gunZ = this.gun.position.z;

    // 每辆坦克独立的漆面 / 履带材质（受损变色、冰冻、履带滚动互不影响）
    const trackMat = tmpl.mats.track.clone();
    trackMat.map = tmpl.mats.track.map.clone();
    this.mats = { paint: tmpl.mats.paint.clone(), paintDark: tmpl.mats.paintDark.clone(), track: trackMat };
    root.traverse(o => { if (o.isMesh && this.mats[o.userData.matKey]) o.material = this.mats[o.userData.matKey]; });
    this.basePaint = this.mats.paint.color.clone();
    this.baseDark = this.mats.paintDark.color.clone();

    if (tank.isPlayer) {
      this.halo = new THREE.Mesh(r.shared.haloGeo, r.shared.haloMats[tank.playerIndex] || r.shared.haloMats[1]);
      this.halo.position.y = 0.025;
      this.halo.renderOrder = 5;
      root.add(this.halo);
    }
    this.shield = new THREE.Mesh(r.shared.shieldGeo, r.shared.shieldMats.spawn);
    this.shield.position.y = 0.3;
    this.shield.visible = false;
    this.shield.renderOrder = 30;
    root.add(this.shield);

    if (!tank.isPlayer && tank.maxHp > 1) {
      this.pips = [];
      const g = new THREE.Group();
      g.position.set(0, 1.55, 0);
      for (let i = 0; i < tank.maxHp; i++) {
        const m = new THREE.Mesh(r.shared.pipGeo, r.shared.pipOn);
        m.position.x = (i - (tank.maxHp - 1) / 2) * 0.24;
        g.add(m); this.pips.push(m);
      }
      g.visible = false;
      this.pipGroup = g;
      root.add(g);
    }

    this.yaw = -tank.dir.rot * DEG;
    this.yawNode.rotation.y = this.yaw;
    this.px = (tank.x + tank.w / 2) * PX;
    this.pz = (tank.y + tank.h / 2) * PX;
    root.position.set(this.px, 0, this.pz);
    this.spawnT = spawnAnim ? 0 : 1;
    if (spawnAnim) {
      root.scale.setScalar(0.001);
      r.effects.spawnBeam(this.px, this.pz, tank.isPlayer ? (tank.playerIndex === 2 ? 0x6cc0ff : 0xffd24a) : 0xff5a4a);
    }
    this.trackDist = 0;
    this.dustT = 0; this.exhaustT = Math.random() * 0.3; this.smokeT = 0;
    this.recoil = 0;
    this.pitch = 0; this.pitchV = 0;
    this.antSway = 0; this.antV = 0;
    this.wasMoving = false;
    this.t = Math.random() * 10;
    r.scene.add(root);
  }

  fire() {
    this.recoil = 1;
    this.pitchV += 0.9;
    this.antV -= 3;
  }

  gunTipWorld(out) {
    this.root.updateMatrixWorld(true);
    return this.gun.localToWorld(out.copy(this.tmpl.gunTip));
  }

  update(dt, now) {
    const t = this.tank, r = this.r, fx = r.effects;
    this.t += dt;
    const x = (t.x + t.w / 2) * PX, z = (t.y + t.h / 2) * PX;
    const moved = Math.hypot(x - this.px, z - this.pz);
    this.px = x; this.pz = z;
    this.root.position.set(x, 0, z);

    // 平滑转向
    const target = -t.dir.rot * DEG;
    const diff = wrapAngle(target - this.yaw);
    this.yaw += diff * Math.min(1, dt * 16);
    this.yawNode.rotation.y = this.yaw;

    const moving = dt > 0 && t.moving && moved > 1e-4 && moved < 0.5;
    if (moving) this.mats.track.map.offset.x += moved / this.tmpl.linkLen;

    // 起步 / 刹车时车身前后俯仰（弹簧阻尼）
    if (moving !== this.wasMoving && dt > 0) { this.pitchV += moving ? 0.7 : -0.9; this.antV += moving ? 2.5 : -2.5; }
    this.wasMoving = moving;
    this.pitchV += (-160 * this.pitch - 11 * this.pitchV) * dt;
    this.pitch += this.pitchV * dt;
    this.body.rotation.x = this.pitch * 0.06;
    this.body.position.y = moving ? Math.sin(this.t * 38) * 0.006 : 0;

    // 天线摆动
    this.antV += (-90 * this.antSway - 4 * this.antV) * dt;
    this.antSway += this.antV * dt;
    this.antenna.rotation.x = this.antSway * 0.12;

    // 火炮后坐
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 4.5);
    this.gun.position.z = this.gunZ + 0.15 * this.recoil * this.recoil;

    // 出生动画
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt / 0.5);
      this.root.scale.setScalar(Math.max(0.001, easeOutBack(this.spawnT)));
    }

    // 状态着色：受损 / 冰冻 / 无敌
    const paint = this.mats.paint, dark = this.mats.paintDark;
    paint.color.copy(this.basePaint);
    dark.color.copy(this.baseDark);
    paint.emissive.setRGB(0, 0, 0);
    const frozen = !t.isPlayer && now < (t.frozenUntil || 0);
    if (!t.isPlayer && t.hp < t.maxHp) {
      const k = (1 - t.hp / t.maxHp) * 0.75;
      paint.color.lerp(r.shared.colors.damaged, k);
      dark.color.lerp(r.shared.colors.charred, k);
    }
    if (frozen) {
      paint.color.lerp(r.shared.colors.ice, 0.55);
      dark.color.lerp(r.shared.colors.ice, 0.4);
      paint.emissive.setRGB(0.05, 0.12, 0.2);
    }
    if (this.pipGroup) {
      this.pipGroup.visible = t.hp < t.maxHp;
      this.pips.forEach((p, i) => { p.material = i < t.hp ? r.shared.pipOn : r.shared.pipOff; });
    }

    // 护盾
    const inv = t.isInvulnerable ? t.isInvulnerable() : false;
    this.shield.visible = inv;
    if (inv) {
      this.shield.material = now < (t.shieldUntil || 0) ? r.shared.shieldMats.helmet : r.shared.shieldMats.spawn;
      const s = 1 + Math.sin(this.t * 6) * 0.02;
      this.shield.scale.set(s, s, s);
    }
    if (this.halo) {
      this.halo.rotation.y = this.t * 0.8;
      this.halo.material.opacity = 0.55 + Math.sin(this.t * 3) * 0.15;
    }

    if (dt <= 0) return;
    const yaw = this.yaw;
    const tile = r.world.tileAt(x, z);
    const onIce = tile === TILE.ICE;

    // 履带扬尘 + 履带印
    if (moving) {
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = 0.06;
        for (const sx of [-0.7, 0.7]) {
          const [ox, oz] = yawRotate(sx, 0.85, yaw);
          fx.smoke.emit({
            x: x + ox, y: 0.08, z: z + oz, vx: (Math.random() - 0.5) * 0.4, vy: 0.25 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.4,
            life: 0.6 + Math.random() * 0.4, s0: 0.22, s1: 0.85, c0: onIce ? 0xdcecf8 : 0x8a7658, c1: onIce ? 0xeef6ff : 0xa89a84,
            a: onIce ? 0.4 : 0.5, drag: 2, fin: 0.15,
          });
        }
      }
      this.trackDist += moved;
      if (this.trackDist > 0.2) {
        this.trackDist = 0;
        r.world.stampTrack(x, z, yaw, onIce);
      }
    }

    // 排气烟
    this.exhaustT -= dt;
    if (this.exhaustT <= 0) {
      this.exhaustT = moving ? 0.07 : 0.28;
      for (const e of this.tmpl.exhausts) {
        const [ox, oz] = yawRotate(e.x * 0.97, e.z * 0.97, yaw);
        const [bx, bz] = yawRotate(0, 1, yaw);
        fx.smoke.emit({
          x: x + ox, y: e.y, z: z + oz, vx: bx * 0.5 + (Math.random() - 0.5) * 0.15, vy: 0.35 + Math.random() * 0.2, vz: bz * 0.5,
          life: 0.7 + Math.random() * 0.4, s0: 0.1, s1: moving ? 0.6 : 0.45, c0: 0x3a3836, c1: 0x8a8682, a: moving ? 0.3 : 0.18, drag: 1.5, fin: 0.1,
        });
      }
    }

    // 受损冒烟 / 冰冻雪花
    if (!t.isPlayer && t.hp < t.maxHp) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.1;
        const [ox, oz] = yawRotate((Math.random() - 0.5) * 0.4, 0.45, yaw);
        fx.smoke.emit({ x: x + ox, y: 0.75, z: z + oz, vx: 0.1, vy: 0.9 + Math.random() * 0.4, life: 1.2 + Math.random() * 0.6, s0: 0.25, s1: 1.2, c0: 0x1e1c1a, c1: 0x5a5652, a: 0.5, drag: 0.8, fin: 0.1 });
        if (Math.random() < 0.3) fx.fire.emit({ x: x + ox, y: 0.7, z: z + oz, vy: 0.8, life: 0.3, s0: 0.3, s1: 0.1, c0: 0xffc060, c1: 0xb02000, a: 0.8 });
      }
    }
    if (frozen && Math.random() < dt * 8) {
      fx.sparks.emit({ x: x + (Math.random() - 0.5) * 1.6, y: 0.4 + Math.random() * 0.6, z: z + (Math.random() - 0.5) * 1.6, vy: -0.2, life: 0.8, s0: 0.12, s1: 0.04, c0: 0xffffff, c1: 0x9fd8ff, a: 0.9 });
    }
  }

  dispose() {
    this.r.scene.remove(this.root);
    this.mats.track.map.dispose();
    for (const k in this.mats) this.mats[k].dispose();
  }
}

class BulletView {
  constructor(r, bullet) {
    this.r = r;
    this.b = bullet;
    const s = r.shared;
    const player = bullet.isPlayerBullet;
    this.group = new THREE.Group();
    const shell = new THREE.Mesh(s.shellGeo, player ? s.shellMatP : s.shellMatE);
    shell.castShadow = true;
    this.group.add(shell);
    const glow = new THREE.Sprite(player ? s.bulletGlowP : s.bulletGlowE);
    glow.scale.set(0.75, 0.75, 1);
    this.group.add(glow);
    this.color = player ? 0xffc050 : 0xff6a50;
    this.group.rotation.y = -bullet.dir.rot * DEG;
    this.update(0);
    r.scene.add(this.group);
  }

  pos() {
    const b = this.b;
    return [(b.x + b.w / 2) * PX, 0.78, (b.y + b.h / 2) * PX];
  }

  update(dt) {
    const [x, y, z] = this.pos();
    this.group.position.set(x, y, z);
    if (dt > 0) {
      const fx = this.r.effects;
      fx.glow.emit({ x, y, z, life: 0.16, s0: 0.32, s1: 0.06, c0: this.color, a: 0.7 });
      if (Math.random() < 0.5) {
        fx.smoke.emit({ x, y, z, vy: 0.15, life: 0.45, s0: 0.1, s1: 0.35, c0: 0x8a8682, c1: 0xb0aca6, a: 0.16, fin: 0.1 });
      }
    }
  }

  dispose() { this.r.scene.remove(this.group); }
}

class PowerupView {
  constructor(r, pu) {
    this.r = r;
    this.pu = pu;
    const color = new THREE.Color(POWERUP_COLOR[pu.type] || '#ffffff');
    this.colorHex = color.getHex();
    this.group = new THREE.Group();
    this.group.position.set((pu.x + pu.w / 2) * PX, 0, (pu.y + pu.h / 2) * PX);
    this.model = r.getPowerupTemplate(pu.type).clone(true);
    this.model.position.y = 0.9;
    this.group.add(this.model);
    this.disc = new THREE.Mesh(r.shared.discGeo, new THREE.MeshBasicMaterial({
      map: r.tex.glow, color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.disc.position.y = 0.03;
    this.beam = new THREE.Mesh(r.shared.beamGeo, new THREE.MeshBasicMaterial({
      map: r.tex.beam, color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.beam.position.y = 1.1;
    this.group.add(this.disc, this.beam);
    this.t = Math.random() * 6;
    r.scene.add(this.group);
    r.effects.sparkle(this.group.position.x, 0.8, this.group.position.z, this.colorHex, 20);
  }

  update(dt, now) {
    this.t += dt;
    this.model.position.y = 0.95 + Math.sin(this.t * 3) * 0.1;
    this.model.rotation.y += dt * 1.8;
    this.beam.rotation.y -= dt * 0.6;
    this.disc.scale.setScalar(1 + Math.sin(this.t * 4) * 0.06);
    const age = now - this.pu.spawnAt;
    const blinking = age > ITEM_LIFETIME_MS - 3000;
    this.group.visible = !(blinking && Math.floor(now / 150) % 2 === 0);
    if (dt > 0 && Math.random() < dt * 6) {
      const p = this.group.position, a = Math.random() * GFX.TAU;
      this.r.effects.sparks.emit({ x: p.x + Math.cos(a) * 0.6, y: 0.1, z: p.z + Math.sin(a) * 0.6, vy: 1.2, life: 0.9, s0: 0.1, s1: 0.02, c0: 0xffffff, c1: this.colorHex, a: 0.9 });
    }
  }

  dispose(picked) {
    if (picked) {
      const p = this.group.position;
      this.r.effects.sparkle(p.x, 0.9, p.z, this.colorHex, 36, 1);
      this.r.effects.ring(p.x, p.z, 1.8, 0.5, this.colorHex, 0.9);
    }
    this.r.scene.remove(this.group);
    this.disc.material.dispose();
    this.beam.material.dispose();
  }
}

class BaseView {
  constructor(r) {
    this.r = r;
    this.group = Models.buildBase();
    this.alive = this.group.getObjectByName('alive');
    this.dead = this.group.getObjectByName('dead');
    this.fireT = 0;
    this.t = 0;
    r.scene.add(this.group);
  }

  place(base) {
    if (!base) { this.group.visible = false; return; }
    this.group.visible = true;
    this.group.position.set(base.c + 1, 0, base.r + 1);
  }

  update(dt, isAlive) {
    this.t += dt;
    this.alive.visible = isAlive;
    this.dead.visible = !isAlive;
    if (isAlive) {
      this.alive.position.y = 0;
      return;
    }
    if (dt <= 0) return;
    this.fireT -= dt;
    if (this.fireT > 0) return;
    this.fireT = 0.05;
    const p = this.group.position, fx = this.r.effects, R = Effects.rnd;
    fx.fire.emit({ x: p.x + R(-0.5, 0.5), y: 0.4, z: p.z + R(-0.5, 0.5), vx: R(-0.2, 0.2), vy: R(1, 2), vz: R(-0.2, 0.2),
      life: R(0.4, 0.8), s0: R(0.5, 0.8), s1: 0.2, c0: 0xffd070, c1: 0xb02000, a: 0.85, drag: 1 });
    fx.smoke.emit({ x: p.x + R(-0.4, 0.4), y: 0.9, z: p.z + R(-0.4, 0.4), vx: R(-0.2, 0.3), vy: R(1, 1.6), vz: R(-0.2, 0.2),
      life: R(2, 3), s0: 0.6, s1: R(2.2, 3.2), c0: 0x1c1a18, c1: 0x5a5652, a: 0.55, drag: 0.6, fin: 0.12 });
  }
}
