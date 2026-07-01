// ===================== 子弹 =====================
class Bullet {
  constructor(x, y, dir, speed, power, owner) {
    this.w = 6; this.h = 6;
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.dir = dir;
    this.speed = speed;
    this.power = power; // 1=普通 2=强力(可炸铁墙)
    this.owner = owner; // tank 引用
    this.isPlayerBullet = owner.isPlayer;
    this.alive = true;
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update(dt, game) {
    const move = this.speed * dt * 60;
    this.x += this.dir.x * move;
    this.y += this.dir.y * move;

    if (this.x < 0 || this.y < 0 || this.x + this.w > MAP_PX || this.y + this.h > MAP_PX) {
      this.alive = false;
      return;
    }
    game.handleBulletTileCollision(this);
    if (!this.alive) return;
    game.handleBulletTankCollision(this);
  }

  draw(ctx) {
    ctx.fillStyle = this.isPlayerBullet ? '#ffe066' : '#ffffff';
    ctx.fillRect(Math.round(this.x), Math.round(this.y), this.w, this.h);
  }
}

// ===================== 坦克 =====================
class Tank {
  constructor(x, y, dir, opts) {
    this.x = x; this.y = y;
    this.w = TANK_SIZE; this.h = TANK_SIZE;
    this.dir = dir;
    this.alive = true;
    Object.assign(this, opts);

    if (this.isPlayer) {
      this.level = 0;
      this.speed = PLAYER_BASE_SPEED;
      this.maxBullets = 1;
      this.bulletSpeed = BULLET_BASE_SPEED;
      this.bulletPower = 1;
      this.lives = 3;
      this.score = 0;
      this.invulnerableUntil = performance.now() + SPAWN_INVULN_MS;
      this.shieldUntil = 0;
    } else {
      const t = ENEMY_TYPES[this.enemyType];
      this.speed = t.speed;
      this.hp = t.hp; this.maxHp = t.hp;
      this.bulletSpeed = t.bulletSpeed || BULLET_BASE_SPEED;
      this.bulletPower = t.power || 1;
      this.maxBullets = 1;
      this.aiTimer = randInt(300, 900);
      this.shootTimer = randInt(400, t.fireRate);
      this.frozenUntil = 0;
    }
    this.shootCooldownAt = 0;
    this.moving = false;
  }

  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  canMoveTo(nx, ny, game) {
    if (nx < 0 || ny < 0 || nx + this.w > MAP_PX || ny + this.h > MAP_PX) return false;
    if (game.isBlockedByTiles(nx, ny, this.w, this.h, this)) return false;
    const box = { x: nx, y: ny, w: this.w, h: this.h };
    for (const other of game.allTanks()) {
      if (other === this || !other.alive) continue;
      if (rectsOverlap(box, other.rect())) return false;
    }
    return true;
  }

  tryMove(dir, game) {
    const changedAxis = (dir.x !== 0) !== (this.dir.x !== 0) || (dir.y !== 0) !== (this.dir.y !== 0);
    this.dir = dir;
    if (changedAxis) {
      if (dir.x !== 0) this.y = Math.round(this.y / UNIT) * UNIT;
      else this.x = Math.round(this.x / UNIT) * UNIT;
    }
    let move = this.speed * game.dtFrames;
    const nx = this.x + dir.x * move;
    const ny = this.y + dir.y * move;
    if (this.canMoveTo(nx, ny, game)) {
      this.x = nx; this.y = ny;
      this.moving = true;
      return true;
    }
    this.moving = false;
    return false;
  }

  shoot(game) {
    const now = performance.now();
    if (now < this.shootCooldownAt) return false;
    const activeBullets = game.bullets.filter(b => b.owner === this && b.alive).length;
    if (activeBullets >= this.maxBullets) return false;
    const cx = this.x + this.w / 2 + this.dir.x * (this.w / 2);
    const cy = this.y + this.h / 2 + this.dir.y * (this.h / 2);
    const b = new Bullet(cx, cy, this.dir, this.bulletSpeed, this.bulletPower, this);
    game.bullets.push(b);
    this.shootCooldownAt = now + 350;
    game.sfx('shoot');
    return true;
  }

  isInvulnerable() {
    const now = performance.now();
    return now < this.invulnerableUntil || now < (this.shieldUntil || 0);
  }

  hit(game, power) {
    if (this.isInvulnerable()) return false;
    if (this.isPlayer) {
      game.killTank(this);
      return true;
    } else {
      this.hp -= power;
      if (this.hp <= 0) {
        game.killTank(this);
        return true;
      }
      game.sfx('hit');
      return false;
    }
  }

  updatePlayer(dt, game) {
    const c = game.input.get(this.playerIndex);
    let dir = null;
    if (c.up) dir = DIR.UP;
    else if (c.down) dir = DIR.DOWN;
    else if (c.left) dir = DIR.LEFT;
    else if (c.right) dir = DIR.RIGHT;
    if (dir) this.tryMove(dir, game); else this.moving = false;
    if (c.shoot) this.shoot(game);
  }

  updateEnemy(dt, game) {
    const now = performance.now();
    if (now < this.frozenUntil) { this.moving = false; return; }

    this.aiTimer -= dt * 1000;
    if (this.aiTimer <= 0 || !this._lastMoveOk) {
      this.aiTimer = randInt(500, 1600);
      this.dir = this.pickDirection(game);
    }
    this._lastMoveOk = this.tryMove(this.dir, game);

    this.shootTimer -= dt * 1000;
    if (this.shootTimer <= 0) {
      this.shoot(game);
      const t = ENEMY_TYPES[this.enemyType];
      this.shootTimer = randInt(t.fireRate * 0.6, t.fireRate * 1.4);
    }
  }

  pickDirection(game) {
    // 一定概率朝基地或玩家方向移动，增加威胁性
    const roll = Math.random();
    if (roll < 0.35 && game.base) {
      const dx = game.base.x - this.x, dy = game.base.y - this.y;
      if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? DIR.RIGHT : DIR.LEFT;
      return dy > 0 ? DIR.DOWN : DIR.UP;
    }
    if (roll < 0.55) {
      const target = game.nearestPlayer(this);
      if (target) {
        const dx = target.x - this.x, dy = target.y - this.y;
        if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? DIR.RIGHT : DIR.LEFT;
        return dy > 0 ? DIR.DOWN : DIR.UP;
      }
    }
    const opts = DIR_LIST.filter(d => d !== this.oppositeDir());
    return randChoice(opts);
  }

  oppositeDir() {
    if (this.dir === DIR.UP) return DIR.DOWN;
    if (this.dir === DIR.DOWN) return DIR.UP;
    if (this.dir === DIR.LEFT) return DIR.RIGHT;
    if (this.dir === DIR.RIGHT) return DIR.LEFT;
    return null;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate(this.dir.rot * Math.PI / 180);
    const flash = this.isInvulnerable() && Math.floor(performance.now() / 100) % 2 === 0;

    let body, dark;
    if (this.isPlayer) {
      const palette = [
        ['#ffd54a', '#c99a1e'],
        ['#ffd54a', '#c99a1e'],
        ['#ffe98a', '#c9a93a'],
        ['#fff0b0', '#d9b94a'],
      ];
      [body, dark] = palette[Math.min(this.level, 3)];
      if (this.playerIndex === 2) { body = '#8fd0ff'; dark = '#4b7fb0'; }
    } else {
      const t = ENEMY_TYPES[this.enemyType];
      body = t.color; dark = t.dark;
      if (this.hp < this.maxHp) {
        // 装甲车受损变色
        const ratio = this.hp / this.maxHp;
        body = ratio > 0.5 ? t.color : '#ffb347';
      }
    }
    if (flash) { body = '#ffffff'; dark = '#cccccc'; }

    const w = this.w, h = this.h;
    ctx.fillStyle = dark;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = body;
    ctx.fillRect(-w / 2 + 4, -h / 2 + 2, w - 8, h - 4);
    // 履带
    ctx.fillStyle = dark;
    ctx.fillRect(-w / 2, -h / 2, 6, h);
    ctx.fillRect(w / 2 - 6, -h / 2, 6, h);
    const tOff = this.moving ? (Math.floor(performance.now() / 100) % 2) * 4 : 0;
    ctx.fillStyle = '#222';
    for (let i = -h / 2 + 2 + tOff; i < h / 2; i += 8) {
      ctx.fillRect(-w / 2 + 1, i, 4, 3);
      ctx.fillRect(w / 2 - 5, i, 4, 3);
    }
    // 炮塔和炮管
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(0, 0, w / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.fillRect(-2, -h / 2 - 4, 4, h / 2 + 4);

    if (this.isPlayer && this.level > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★'.repeat(this.level), 0, 3);
    }
    ctx.restore();
  }
}

// ===================== 道具 =====================
const POWERUP_LABEL = { star: '★', helmet: '🛡', grenade: '💣', timer: '⏱', shovel: '⛏', tank: '♥' };
const POWERUP_COLOR = { star: '#ffcc00', helmet: '#66ccff', grenade: '#ff5555', timer: '#66ff99', shovel: '#cc9966', tank: '#ff88cc' };

class PowerUp {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.w = TANK_SIZE; this.h = TANK_SIZE;
    this.type = type;
    this.alive = true;
    this.spawnAt = performance.now();
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  update() {
    if (performance.now() - this.spawnAt > ITEM_LIFETIME_MS) this.alive = false;
  }
  draw(ctx) {
    const blinking = (performance.now() - this.spawnAt) > ITEM_LIFETIME_MS - 3000;
    if (blinking && Math.floor(performance.now() / 150) % 2 === 0) return;
    ctx.fillStyle = '#0a0a2a';
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.strokeStyle = POWERUP_COLOR[this.type];
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x + 1, this.y + 1, this.w - 2, this.h - 2);
    ctx.fillStyle = POWERUP_COLOR[this.type];
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(POWERUP_LABEL[this.type], this.x + this.w / 2, this.y + this.h / 2 + 1);
  }
}

// ===================== 爆炸特效 =====================
class Explosion {
  constructor(x, y, size = TANK_SIZE) {
    this.x = x; this.y = y; this.size = size;
    this.startAt = performance.now();
    this.duration = 300;
    this.alive = true;
  }
  update() {
    if (performance.now() - this.startAt > this.duration) this.alive = false;
  }
  draw(ctx) {
    const t = (performance.now() - this.startAt) / this.duration;
    const r = this.size / 2 * (0.4 + t * 0.8);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = t < 0.5 ? '#fff5b0' : '#ff7b1a';
    ctx.beginPath();
    ctx.arc(this.x + this.size / 2, this.y + this.size / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff3b1a';
    ctx.beginPath();
    ctx.arc(this.x + this.size / 2, this.y + this.size / 2, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
