// ===== 3D 模型：坦克 / 老鹰基地 / 道具 =====
// 所有模型都是程序化建模，朝向 -Z（屏幕上方），地面为 y=0，1 个单位 = 1 个 UNIT(24px)
const Models = (() => {
  const { chamferBox, cylX, cylY, cylZ, PartBuilder } = GFX;
  const MSM = (o) => new THREE.MeshStandardMaterial(o);
  let T = null;
  const shared = {};

  // ---------- 涂装与车型配置 ----------
  const PLAYER_PAINT = { 1: 0xe7b12a, 2: 0x3b93e0 };
  const ENEMY_STYLE = {
    BASIC: { paint: 0x8b9398, hull: 'medium', turretScale: 1.0, barrelLen: 0.56, barrelR: 0.05 },
    FAST: { paint: 0x36aab3, hull: 'light', turretScale: 0.84, barrelLen: 0.46, barrelR: 0.042, stripes: true },
    POWER: { paint: 0xc0406f, hull: 'medium', turretScale: 1.06, barrelLen: 0.7, barrelR: 0.058, muzzleBrake: true },
    ARMOR: { paint: 0x587f40, hull: 'heavy', turretScale: 1.12, barrelLen: 0.6, barrelR: 0.062, skirts: true, era: true },
  };
  const HULLS = {
    light: { deck: 0.56, width: 1.3, profile: [[-0.95, 0.36], [-0.56, 0.54], [0.8, 0.56], [0.93, 0.46], [0.93, 0.36]] },
    medium: { deck: 0.62, width: 1.4, profile: [[-0.95, 0.38], [-0.62, 0.6], [0.78, 0.62], [0.93, 0.5], [0.93, 0.38]] },
    heavy: { deck: 0.68, width: 1.5, profile: [[-0.96, 0.38], [-0.64, 0.66], [0.78, 0.68], [0.94, 0.54], [0.94, 0.38]] },
  };

  function tankSpec(tank) {
    if (tank.isPlayer) {
      const lv = tank.level || 0;
      return {
        key: `P${tank.playerIndex}_L${lv}`,
        paint: PLAYER_PAINT[tank.playerIndex] || PLAYER_PAINT[1],
        hull: lv >= 3 ? 'heavy' : 'medium',
        turretScale: 1.0 + lv * 0.03,
        barrelLen: 0.56 + lv * 0.05,
        barrelR: 0.05 + lv * 0.004,
        muzzleBrake: lv >= 1,
        era: lv >= 2,
        skirts: lv >= 3,
        stars: lv,
        enemy: false,
      };
    }
    return { key: tank.enemyType, ...ENEMY_STYLE[tank.enemyType], stars: 0, enemy: true };
  }

  function init(textures) {
    T = textures;
    shared.metal = MSM({ color: 0x3e4246, roughness: 0.38, metalness: 0.85, map: T.grain });
    shared.rubber = MSM({ color: 0x1d1d1f, roughness: 0.92, metalness: 0.05 });
    shared.glass = MSM({ color: 0x14202c, roughness: 0.06, metalness: 0.95 });
    shared.lamp = MSM({ color: 0xfff1c8, emissive: 0xffdc96, emissiveIntensity: 1.8, roughness: 0.2 });
    shared.redMark = MSM({ color: 0xd42228, roughness: 0.45, emissive: 0x3a0000 });
    shared.white = MSM({ color: 0xefefea, roughness: 0.55, map: T.grain });
    shared.gold = MSM({ color: 0xffcf4a, roughness: 0.26, metalness: 0.85, emissive: 0x7a4c00, emissiveIntensity: 0.6 });
    shared.canvas = MSM({ color: 0x6d6748, roughness: 0.95, map: T.grain });
    shared.concrete = MSM({ color: 0xffffff, roughness: 0.9, map: T.concrete });
    shared.stoneDark = MSM({ color: 0x55595e, roughness: 0.75, map: T.concrete });
    shared.charred = MSM({ color: 0x2a2522, roughness: 0.95, map: T.grain });
    shared.wood = MSM({ color: 0x8a5a32, roughness: 0.7, map: T.grain });
    shared.steelBright = MSM({ color: 0xc8d0d6, roughness: 0.2, metalness: 1.0 });
  }

  function darker(hex, k) {
    const c = new THREE.Color(hex);
    c.multiplyScalar(k);
    return c;
  }

  // ---------- 坦克 ----------
  function buildTank(spec) {
    const H = HULLS[spec.hull];
    const ts = spec.turretScale;
    const trackTex = T.track.clone();
    const mats = {
      ...shared,
      paint: MSM({ color: spec.paint, roughness: 0.46, metalness: 0.3, map: T.grainSoft }),
      paintDark: MSM({ color: darker(spec.paint, 0.5), roughness: 0.6, metalness: 0.3, map: T.grainSoft }),
      track: MSM({ color: 0xb4b4b4, map: trackTex, roughness: 0.72, metalness: 0.5 }),
      mark: spec.enemy ? shared.redMark : shared.white,
    };
    const hb = new PartBuilder(), tb = new PartBuilder(), gb = new PartBuilder();

    // ---- 行走机构：履带 / 负重轮 / 主动轮 / 诱导轮 / 托带轮 / 挡泥板 ----
    const LINK = 0.48;
    const belt = GFX.trackBelt(1.86, 0.42, 0.19, 0.4, 0.05, LINK);
    const tire = cylX(0.15, 0.3, 20), hub = cylX(0.085, 0.34, 14), cap = cylX(0.04, 0.37, 8);
    const sprocketCore = cylX(0.12, 0.26, 12), tooth = chamferBox(0.26, 0.06, 0.045, 0.008);
    const idler = cylX(0.13, 0.28, 18), roller = cylX(0.05, 0.22, 10);
    for (const sd of [-1, 1]) {
      const x = sd * 0.7;
      hb.add('track', belt, [x, 0, 0]);
      for (const z of [-0.54, -0.27, 0, 0.27, 0.54]) {
        hb.add('rubber', tire, [x, 0.2, z]);
        hb.add('metal', hub, [x, 0.2, z]);
        hb.add('metal', cap, [x, 0.2, z]);
      }
      hb.add('metal', sprocketCore, [x, 0.23, -0.74]);
      for (let k = 0; k < 10; k++) {
        const a = k * GFX.TAU / 10;
        hb.add('metal', tooth, [x, 0.23 + Math.sin(a) * 0.13, -0.74 + Math.cos(a) * 0.13], [Math.PI / 2 - a, 0, 0]);
      }
      hb.add('rubber', idler, [x, 0.22, 0.74]);
      hb.add('metal', hub, [x, 0.22, 0.74]);
      for (const z of [-0.3, 0.3]) hb.add('metal', roller, [x, 0.33, z]);
      hb.add('paintDark', chamferBox(0.47, 0.035, 1.9, 0.012), [x, 0.455, 0.02]);
      hb.add('paintDark', chamferBox(0.47, 0.03, 0.16, 0.01), [x, 0.425, -0.99], [-0.4, 0, 0]);
      hb.add('paintDark', chamferBox(0.2, 0.1, 0.3, 0.015), [x + sd * 0.08, 0.52, 0.5]);   // 工具箱
      hb.add('metal', chamferBox(0.03, 0.03, 0.26, 0.008), [x + sd * 0.08, 0.585, 0.5]);   // 箱扣
      if (spec.skirts) {
        for (let k = 0; k < 5; k++) hb.add('paint', chamferBox(0.035, 0.22, 0.34, 0.01), [sd * 0.93, 0.34, -0.72 + k * 0.36]);
      }
      if (spec.stripes) hb.add('white', chamferBox(0.08, 0.006, 1.7, 0.002), [x, 0.475, 0.02]);
      // 前大灯 + 护罩
      hb.add('metal', cylZ(0.055, 0.06, 14), [sd * 0.62, 0.53, -0.93]);
      hb.add('lamp', cylZ(0.045, 0.02, 14), [sd * 0.62, 0.53, -0.965]);
      hb.add('metal', chamferBox(0.13, 0.015, 0.08, 0.005), [sd * 0.62, 0.595, -0.94]);
    }

    // ---- 车体 ----
    hb.add('paintDark', chamferBox(0.96, 0.28, 1.7, 0.03), [0, 0.26, 0]);
    hb.add('paint', GFX.profileExtrudeX(H.profile, H.width, 0.03));
    // 首上装甲（glacis）上的细节
    const [fz, fy] = H.profile[0], [gz, gy] = H.profile[1];
    const dz = gz - fz, dy = gy - fy, dl = Math.hypot(dz, dy);
    const nz = -dy / dl, ny = dz / dl, tilt = Math.atan2(nz, ny);
    const onGlacis = (t, off) => [fz + dz * t + nz * off, fy + dy * t + ny * off];
    {
      const [hz, hy] = onGlacis(0.62, 0.02);
      hb.add('paintDark', chamferBox(0.26, 0.04, 0.17, 0.012), [-0.22, hy, hz], [tilt, 0, 0]);       // 驾驶员舱盖
      const [vz, vy] = onGlacis(0.9, 0.025);
      hb.add('glass', chamferBox(0.18, 0.03, 0.035, 0.008), [-0.22, vy, vz], [tilt, 0, 0]);         // 观察窗
      if (spec.era) {
        for (const t of [0.22, 0.5]) {
          const [ez, ey] = onGlacis(t, 0.03);
          for (let k = -2; k <= 2; k++) {
            if (t > 0.4 && k < 0) continue; // 避开舱盖
            hb.add('paintDark', chamferBox(0.16, 0.05, 0.11, 0.01), [k * 0.18, ey, ez], [tilt, 0, 0]);
          }
        }
      } else {
        const [sz, sy] = onGlacis(0.3, 0.015);
        for (const x of [0.06, 0.2, 0.34]) hb.add('metal', chamferBox(0.12, 0.025, 0.09, 0.006), [x, sy, sz], [tilt, 0, 0]); // 备用履带板
      }
    }
    for (const sd of [-1, 1]) hb.add('metal', chamferBox(0.08, 0.06, 0.08, 0.01), [sd * 0.3, 0.3, -0.88]);  // 拖钩
    // 发动机舱格栅
    hb.add('paintDark', chamferBox(0.9, 0.02, 0.46, 0.006), [0, H.deck + 0.005, 0.56]);
    for (let k = 0; k < 7; k++) hb.add('metal', chamferBox(0.84, 0.018, 0.024, 0.004), [0, H.deck + 0.024, 0.37 + k * 0.064]);
    // 排气管 & 尾部油桶
    const exhausts = [];
    for (const sd of [-1, 1]) {
      hb.add('metal', cylZ(0.045, 0.14, 12), [sd * 0.36, 0.49, 0.95]);
      hb.add('rubber', cylZ(0.032, 0.02, 12), [sd * 0.36, 0.49, 1.02]);
      exhausts.push(new THREE.Vector3(sd * 0.36, 0.49, 1.04));
      hb.add('paintDark', chamferBox(0.15, 0.2, 0.07, 0.015), [sd * 0.13, 0.47, 0.965]);
    }

    // ---- 炮塔 ----
    const outline = [[-0.27, -0.48], [0.27, -0.48], [0.44, -0.28], [0.48, 0.16], [0.38, 0.42], [-0.38, 0.42], [-0.48, 0.16], [-0.44, -0.28]]
      .map(([x, z]) => [x * ts, z * ts]);
    const th = 0.18 + ts * 0.02;
    const top = th + 0.1;
    tb.add('paintDark', cylY(0.4 * ts, 0.06, 28), [0, 0.03, 0]);
    tb.add('paint', GFX.topExtrudeY(outline, th, 0.045, 2), [0, 0.01, 0]);
    tb.add('paintDark', chamferBox(0.34 * ts, 0.17, 0.12, 0.03), [0, 0.16, -0.48 * ts - 0.06]);   // 炮盾
    // 车长指挥塔
    const cx = 0.18 * ts, cz = 0.1 * ts;
    tb.add('paint', cylY(0.12, 0.08, 18), [cx, top + 0.04, cz]);
    tb.add('paintDark', cylY(0.112, 0.025, 18), [cx, top + 0.09, cz]);
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.55;
      tb.add('glass', chamferBox(0.05, 0.03, 0.02, 0.006), [cx + Math.cos(a) * 0.12, top + 0.05, cz + Math.sin(a) * 0.12], [0, -a - Math.PI / 2, 0]);
    }
    tb.add('metal', chamferBox(0.05, 0.05, 0.1, 0.01), [cx, top + 0.13, cz - 0.02]);
    tb.add('metal', cylZ(0.014, 0.24, 8), [cx, top + 0.13, cz - 0.18]);
    // 装填手舱盖
    tb.add('paintDark', cylY(0.09, 0.025, 16), [-0.18 * ts, top + 0.012, 0.12 * ts]);
    tb.add('metal', chamferBox(0.1, 0.012, 0.02, 0.004), [-0.18 * ts, top + 0.03, 0.12 * ts]);
    // 烟雾弹发射器
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        tb.add('metal', cylZ(0.028, 0.11, 8), [sd * 0.43 * ts, 0.24, -0.3 * ts + k * 0.065], [0.55, sd * 0.7, 0]);
      }
    }
    // 尾部储物篮
    const bz = 0.42 * ts + 0.12;
    tb.add('metal', chamferBox(0.72 * ts, 0.02, 0.17, 0.006), [0, 0.1, bz]);
    tb.add('metal', chamferBox(0.74 * ts, 0.02, 0.02, 0.006), [0, 0.26, bz + 0.08]);
    for (const sd of [-1, 1]) tb.add('metal', chamferBox(0.02, 0.02, 0.17, 0.006), [sd * 0.37 * ts, 0.26, bz]);
    for (const x of [-0.36, 0, 0.36]) tb.add('metal', chamferBox(0.02, 0.16, 0.02, 0.006), [x * ts, 0.18, bz + 0.08]);
    tb.add('canvas', cylX(0.065, 0.56 * ts, 12), [-0.04, 0.17, bz - 0.01]);
    tb.add('paintDark', chamferBox(0.16, 0.1, 0.1, 0.015), [0.26 * ts, 0.16, bz]);
    // 反应装甲块
    if (spec.era) {
      for (const sd of [-1, 1]) {
        for (let k = 0; k < 3; k++) tb.add('paintDark', chamferBox(0.05, 0.12, 0.13, 0.012), [sd * (0.47 * ts + 0.05), 0.17, -0.24 * ts + k * 0.15]);
      }
      for (const sd of [-1, 1]) tb.add('paintDark', chamferBox(0.12, 0.1, 0.05, 0.012), [sd * 0.3 * ts, 0.16, -0.5 * ts - 0.05], [0, sd * -0.35, 0]);
    }
    // 识别标志：敌军红星（侧面或顶部）
    const markStar = GFX.extrude(GFX.starShape(0.09, 0.037), 0.012);
    if (spec.enemy) {
      if (spec.era) {
        tb.add('mark', markStar, [0, top + 0.012, -0.2 * ts], [-Math.PI / 2, 0, 0]);
      } else {
        for (const sd of [-1, 1]) tb.add('mark', markStar, [sd * (0.465 * ts + 0.05), 0.17, -0.04 * ts], [0, sd * Math.PI / 2, 0]);
      }
    } else {
      // 玩家：炮塔两侧白色识别带
      for (const sd of [-1, 1]) tb.add('white', chamferBox(0.01, 0.035, 0.36 * ts, 0.003), [sd * (0.465 * ts + 0.05), 0.2, -0.04 * ts], [0, sd * -0.05, 0]);
    }
    // 玩家等级星章（金色，平放于炮塔顶）
    const gold = GFX.extrude(GFX.starShape(0.06, 0.025), 0.016, 0.004, 1);
    for (let k = 0; k < spec.stars; k++) {
      tb.add('gold', gold, [(k - (spec.stars - 1) / 2) * 0.14, top + 0.014, -0.24 * ts], [-Math.PI / 2, 0, 0]);
    }

    // ---- 火炮（独立分组，用于后坐动画）----
    const L = spec.barrelLen, rb = spec.barrelR;
    gb.add('paintDark', cylZ(rb * 1.5, 0.16, 16), [0, 0, -0.06]);
    gb.add('metal', cylZ(rb, L, 16), [0, 0, -L / 2]);
    gb.add('metal', cylZ(rb * 1.45, 0.12, 16), [0, 0, -L * 0.55]);
    gb.add('metal', cylZ(rb * 1.25, 0.05, 16), [0, 0, -L + 0.02]);
    let tipZ = -L - 0.03;
    if (spec.muzzleBrake) {
      gb.add('metal', chamferBox(rb * 2.8, rb * 1.9, 0.14, 0.012), [0, 0, -L - 0.05]);
      for (const sd of [-1, 1]) {
        for (const z of [-L - 0.08, -L - 0.02]) gb.add('rubber', chamferBox(0.012, rb * 1.3, 0.028, 0.004), [sd * rb * 1.41, 0, z]);
      }
      tipZ = -L - 0.13;
    }

    // ---- 天线（独立网格，随运动摆动）----
    const ant = new PartBuilder();
    ant.add('metal', cylY(0.008, 0.62, 5, 0.004), [0, 0.31, 0]);
    ant.add('metal', new THREE.SphereGeometry(0.016, 8, 6), [0, 0.62, 0]);
    tb.add('metal', cylY(0.025, 0.04, 10), [-0.3 * ts, top + 0.01, 0.3 * ts]);

    // ---- 装配层级：root → yaw → body → turret → gun ----
    const root = new THREE.Group(); root.name = 'root';
    const yaw = new THREE.Group(); yaw.name = 'yaw'; root.add(yaw);
    const body = hb.build(mats, 'body'); yaw.add(body);
    const turret = tb.build(mats, 'turret'); turret.position.set(0, H.deck, 0.12); body.add(turret);
    const gun = gb.build(mats, 'gun'); gun.position.set(0, 0.16, -0.48 * ts - 0.12); turret.add(gun);
    const antenna = ant.build(mats, 'antenna'); antenna.position.set(-0.3 * ts, top + 0.02, 0.3 * ts); turret.add(antenna);
    root.scale.setScalar(0.97);

    return {
      root, mats,
      linkLen: LINK,
      gunTip: new THREE.Vector3(0, 0, tipZ),
      exhausts,
      turretTop: H.deck + top,
    };
  }

  // ---------- 基地（老鹰雕像） ----------
  function eagleShape() {
    const half = [
      [0, 1.0], [0.08, 0.97], [0.12, 0.88], [0.09, 0.8], [0.18, 0.78], [0.35, 0.92], [0.55, 1.0], [0.75, 0.98],
      [0.96, 0.86], [0.84, 0.79], [0.98, 0.68], [0.84, 0.62], [0.94, 0.52], [0.78, 0.48], [0.86, 0.38],
      [0.62, 0.4], [0.4, 0.5], [0.22, 0.5], [0.2, 0.32], [0.3, 0.12], [0.24, 0.06], [0.12, 0.1], [0.06, 0.0], [0, 0.04],
    ];
    const pts = half.concat(half.slice(1, -1).reverse().map(([x, y]) => [-x, y]));
    return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * 0.72, y * 0.95)));
  }

  function buildBase() {
    const group = new THREE.Group();
    // 底座（共用）
    const pb = new PartBuilder();
    pb.add('concrete', chamferBox(1.92, 0.16, 1.92, 0.04), [0, 0.08, 0]);
    pb.add('concrete', chamferBox(1.56, 0.14, 1.56, 0.035), [0, 0.23, 0]);
    pb.add('metal', chamferBox(1.6, 0.025, 1.6, 0.008), [0, 0.162, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pb.add('stoneDark', chamferBox(0.16, 0.3, 0.16, 0.03), [sx * 0.86, 0.15, sz * 0.86]);
      pb.add('lamp', new THREE.SphereGeometry(0.05, 12, 8), [sx * 0.86, 0.33, sz * 0.86]);
    }
    const plinth = pb.build(shared, 'plinth');
    group.add(plinth);

    // 完好：金色老鹰
    const alive = new THREE.Group(); alive.name = 'alive';
    const ab = new PartBuilder();
    ab.add('stoneDark', chamferBox(0.86, 0.22, 0.46, 0.04), [0, 0.41, 0]);
    ab.add('gold', chamferBox(0.9, 0.03, 0.5, 0.01), [0, 0.53, 0]);
    const eagle = GFX.extrude(eagleShape(), 0.1, 0.03, 2, 1);
    ab.add('gold', eagle, [0, 0.55, 0], [0, 0, 0], [1, 1, 1]);
    ab.add('gold', new THREE.ConeGeometry(0.035, 0.1, 10), [0, 1.42, 0.06], [Math.PI / 2 + 0.5, 0, 0]);  // 鹰喙
    ab.add('stoneDark', new THREE.SphereGeometry(0.018, 8, 6), [0.045, 1.46, 0.07]);
    ab.add('stoneDark', new THREE.SphereGeometry(0.018, 8, 6), [-0.045, 1.46, 0.07]);
    // 胸前盾徽
    ab.add('redMark', GFX.extrude(GFX.starShape(0.11, 0.045), 0.03), [0, 0.92, 0.09]);
    alive.add(ab.build(shared, 'eagle'));
    group.add(alive);

    // 被摧毁：倒塌焦黑的残骸
    const dead = new THREE.Group(); dead.name = 'dead'; dead.visible = false;
    const db = new PartBuilder();
    db.add('charred', chamferBox(0.86, 0.16, 0.46, 0.04), [0.05, 0.38, 0.02], [0, 0.2, 0.08]);
    db.add('charred', GFX.extrude(eagleShape(), 0.1, 0.03, 2, 1), [0.05, 0.42, 0.62], [-1.45, 0.25, 0.3]);
    const R = GFX.rng(17);
    for (let i = 0; i < 16; i++) {
      const s = 0.06 + R() * 0.14;
      db.add(R() < 0.5 ? 'charred' : 'stoneDark', chamferBox(s, s * 0.7, s, 0.012), [(R() - 0.5) * 1.6, 0.32 + R() * 0.05, (R() - 0.5) * 1.6], [R() * 3, R() * 3, R() * 3]);
    }
    dead.add(db.build(shared, 'wreck'));
    group.add(dead);
    return group;
  }

  // ---------- 道具模型 ----------
  function buildPowerup(type) {
    const b = new PartBuilder();
    const mats = { ...shared };
    switch (type) {
      case 'star': {
        b.add('gold', GFX.extrude(GFX.starShape(0.42, 0.18), 0.1, 0.05, 2));
        break;
      }
      case 'helmet': {
        mats.shell = MSM({ color: 0x3f87c9, roughness: 0.25, metalness: 0.7 });
        b.add('shell', new THREE.SphereGeometry(0.34, 28, 14, 0, GFX.TAU, 0, Math.PI / 2), [0, -0.1, 0]);
        b.add('shell', cylY(0.42, 0.04, 28), [0, -0.1, 0]);
        b.add('steelBright', new THREE.TorusGeometry(0.42, 0.02, 6, 32), [0, -0.1, 0], [Math.PI / 2, 0, 0]);
        b.add('steelBright', chamferBox(0.06, 0.08, 0.62, 0.02), [0, 0.22, 0], [0.0, 0, 0]);
        b.add('gold', GFX.extrude(GFX.starShape(0.1, 0.04), 0.03), [0, 0.06, 0.3], [-0.3, 0, 0]);
        break;
      }
      case 'grenade': {
        mats.olive = MSM({ color: 0x4d5c2c, roughness: 0.55, metalness: 0.2, map: T.grain });
        b.add('olive', new THREE.SphereGeometry(0.27, 24, 16), [0, -0.05, 0], [0, 0, 0], [1, 1.15, 1]);
        for (const y of [-0.2, -0.05, 0.1]) {
          const r = Math.sqrt(Math.max(0.01, 0.27 * 0.27 - (y + 0.05) * (y + 0.05) / 1.32));
          b.add('olive', new THREE.TorusGeometry(r, 0.022, 6, 28), [0, y, 0], [Math.PI / 2, 0, 0]);
        }
        for (let k = 0; k < 6; k++) b.add('olive', chamferBox(0.035, 0.5, 0.035, 0.01), [Math.cos(k / 6 * GFX.TAU) * 0.255, -0.05, Math.sin(k / 6 * GFX.TAU) * 0.255]);
        b.add('metal', cylY(0.09, 0.12, 16), [0, 0.28, 0]);
        b.add('steelBright', chamferBox(0.05, 0.32, 0.04, 0.012), [0.11, 0.18, 0], [0, 0, -0.25]);
        b.add('gold', new THREE.TorusGeometry(0.07, 0.012, 6, 18), [-0.1, 0.32, 0]);
        break;
      }
      case 'timer': {
        mats.case = MSM({ color: 0x2f9a5c, roughness: 0.3, metalness: 0.6 });
        mats.face = MSM({ color: 0xf2f4ee, roughness: 0.4, emissive: 0x30302a });
        b.add('case', cylZ(0.32, 0.12, 32));
        b.add('steelBright', new THREE.TorusGeometry(0.32, 0.035, 8, 32));
        b.add('face', cylZ(0.28, 0.02, 32), [0, 0, 0.06]);
        for (let k = 0; k < 12; k++) {
          const a = k / 12 * GFX.TAU;
          b.add('rubber', chamferBox(0.015, k % 3 ? 0.03 : 0.06, 0.01, 0.003), [Math.sin(a) * 0.23, Math.cos(a) * 0.23, 0.075], [0, 0, -a]);
        }
        b.add('rubber', chamferBox(0.022, 0.2, 0.012, 0.004), [0.0, 0.09, 0.08]);
        b.add('redMark', chamferBox(0.016, 0.24, 0.012, 0.004), [0.07, -0.06, 0.085], [0, 0, 2.3]);
        b.add('steelBright', cylY(0.045, 0.1, 12), [0, 0.39, 0]);
        b.add('steelBright', cylY(0.07, 0.04, 12), [0, 0.45, 0]);
        break;
      }
      case 'shovel': {
        const blade = new THREE.Shape();
        blade.moveTo(-0.16, 0); blade.lineTo(0.16, 0); blade.lineTo(0.15, -0.22);
        blade.quadraticCurveTo(0.1, -0.36, 0, -0.42); blade.quadraticCurveTo(-0.1, -0.36, -0.15, -0.22); blade.closePath();
        b.add('steelBright', GFX.extrude(blade, 0.03, 0.012, 1), [0, -0.12, 0]);
        b.add('metal', cylY(0.045, 0.14, 12), [0, -0.08, 0]);
        b.add('wood', cylY(0.028, 0.56, 12), [0, 0.26, 0]);
        b.add('wood', new THREE.TorusGeometry(0.08, 0.022, 8, 20), [0, 0.6, 0]);
        b.add('wood', chamferBox(0.16, 0.035, 0.04, 0.01), [0, 0.55, 0]);
        break;
      }
      case 'tank':
      default: {
        mats.heart = MSM({ color: 0xe8336a, roughness: 0.2, metalness: 0.25, emissive: 0x4a0018 });
        b.add('heart', GFX.extrude(GFX.heartShape(0.36), 0.14, 0.05, 3, 16), [0, 0.06, 0]);
        b.add('white', new THREE.SphereGeometry(0.05, 10, 8), [-0.18, 0.2, 0.11]);
        break;
      }
    }
    const g = b.build(mats, 'model');
    if (type === 'shovel') g.rotation.z = 0.5;
    return g;
  }

  return { init, tankSpec, buildTank, buildBase, buildPowerup };
})();
