class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new Input();
    this.audio = new SoundFx();
    this.state = STATE.MENU;
    this.players = [];
    this.enemies = [];
    this.bullets = [];
    this.powerups = [];
    this.explosions = [];
    this.level = 0;
    this.dtFrames = 1;
    this._shovelRevertTimer = null;

    this.dom = {
      level: document.getElementById('hud-level'),
      score1: document.getElementById('hud-score1'),
      score2: document.getElementById('hud-score2'),
      p2row: document.getElementById('hud-p2-row'),
      lives1: document.getElementById('hud-lives1'),
      lives2: document.getElementById('hud-lives2'),
      enemiesLeft: document.getElementById('hud-enemies-left'),
      overlays: {
        menu: document.getElementById('overlay-menu'),
        pause: document.getElementById('overlay-pause'),
        gameover: document.getElementById('overlay-gameover'),
        levelclear: document.getElementById('overlay-levelclear'),
        victory: document.getElementById('overlay-victory'),
      },
      finalScore: document.getElementById('final-score'),
      clearedLevel: document.getElementById('cleared-level'),
      victoryScore: document.getElementById('victory-score'),
      muteBtn: document.getElementById('btn-mute'),
    };
    this.bindDom();
    this.view = new Renderer3D(canvas, this);
  }

  bindDom() {
    document.getElementById('btn-1p').addEventListener('click', () => this.startGame(false));
    document.getElementById('btn-2p').addEventListener('click', () => this.startGame(true));
    document.getElementById('btn-resume').addEventListener('click', () => { this.state = STATE.PLAYING; });
    document.getElementById('btn-restart').addEventListener('click', () => { this.state = STATE.MENU; });
    document.getElementById('btn-next-level').addEventListener('click', () => this.loadLevel(this.level + 1));
    document.getElementById('btn-victory-restart').addEventListener('click', () => { this.state = STATE.MENU; });
    this.dom.muteBtn.addEventListener('click', () => {
      this.audio.muted = !this.audio.muted;
      this.dom.muteBtn.textContent = this.audio.muted ? '🔇 静音' : '🔊 声音';
    });
  }

  sfx(name) { this.audio.play(name); }

  // ================= 生命周期 =================
  startGame(twoPlayer) {
    this.twoPlayer = twoPlayer;
    this.players = [new Tank(0, 0, DIR.UP, { isPlayer: true, playerIndex: 1 })];
    if (twoPlayer) this.players.push(new Tank(0, 0, DIR.UP, { isPlayer: true, playerIndex: 2 }));
    this.level = 0;
    this.loadLevel(0);
    this.sfx('start');
  }

  loadLevel(idx) {
    clearTimeout(this._shovelRevertTimer);
    this.level = idx;
    this.grid = getLevelGrid(idx);
    const b = findBase(this.grid);
    this.base = { r: b.r, c: b.c, x: b.c * UNIT, y: b.r * UNIT, alive: true };

    this.enemies = [];
    this.bullets = [];
    this.powerups = [];
    this.explosions = [];
    this.enemiesAliveOnField = 0;
    this.enemyQueue = this.buildEnemyQueue(idx);
    this.nextSpawnAt = performance.now() + 800;
    this.maxEnemiesOnField = Math.min(6, 4 + Math.floor(idx / 2));

    this.enemySpawnPoints = [
      { x: 0, y: 0 },
      { x: 6 * 2 * UNIT, y: 0 },
      { x: 12 * 2 * UNIT, y: 0 },
    ];
    this.playerSpawns = [
      { x: 4 * 2 * UNIT, y: 12 * 2 * UNIT },
      { x: 8 * 2 * UNIT, y: 12 * 2 * UNIT },
    ];
    const now = performance.now();
    this.players.forEach((p, i) => {
      const sp = this.playerSpawns[i] || this.playerSpawns[0];
      p.x = sp.x; p.y = sp.y; p.dir = DIR.UP; p.alive = true;
      p.invulnerableUntil = now + SPAWN_INVULN_MS;
      p.respawnAt = null;
    });
    this.dom.p2row.style.display = this.twoPlayer ? '' : 'none';
    this.state = STATE.PLAYING;
  }

  buildEnemyQueue(levelIdx) {
    const count = 10 + levelIdx * 4;
    const queue = [];
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      let type;
      if (levelIdx === 0) type = r < 0.6 ? 'BASIC' : r < 0.85 ? 'FAST' : 'POWER';
      else if (levelIdx === 1) type = r < 0.4 ? 'BASIC' : r < 0.7 ? 'FAST' : r < 0.9 ? 'POWER' : 'ARMOR';
      else type = r < 0.25 ? 'BASIC' : r < 0.55 ? 'FAST' : r < 0.8 ? 'POWER' : 'ARMOR';
      queue.push({ type, dropsItem: i > 0 && i % 4 === 3 });
    }
    return queue;
  }

  respawnPlayer(p) {
    const sp = this.playerSpawns[p.playerIndex - 1] || this.playerSpawns[0];
    p.x = sp.x; p.y = sp.y; p.dir = DIR.UP; p.alive = true;
    p.invulnerableUntil = performance.now() + SPAWN_INVULN_MS;
    p.respawnAt = null;
  }

  // ================= 主更新 =================
  update(dt) {
    this.dtFrames = Math.min(dt, 0.05) * 60;
    const now = performance.now();

    switch (this.state) {
      case STATE.MENU:
        if (this.input.wasPressed('Digit1')) this.startGame(false);
        else if (this.input.wasPressed('Digit2')) this.startGame(true);
        break;
      case STATE.PLAYING:
        if (this.input.wasPressed('KeyP')) this.state = STATE.PAUSED;
        else this.updatePlaying(dt, now);
        break;
      case STATE.PAUSED:
        if (this.input.wasPressed('KeyP')) this.state = STATE.PLAYING;
        break;
      case STATE.LEVEL_CLEAR:
        if (this.input.wasPressed('Enter')) this.loadLevel(this.level + 1);
        break;
      case STATE.GAME_OVER:
      case STATE.VICTORY:
        if (this.input.wasPressed('Enter')) this.state = STATE.MENU;
        break;
    }
    if (this.input.wasPressed('KeyM')) {
      this.audio.muted = !this.audio.muted;
      this.dom.muteBtn.textContent = this.audio.muted ? '🔇 静音' : '🔊 声音';
    }
    this.syncOverlays();
    this.updateHud();
  }

  updatePlaying(dt, now) {
    this.trySpawnEnemy(now);

    for (const p of this.players) {
      if (p.alive) p.updatePlayer(dt, this);
      else if (p.lives > 0 && p.respawnAt && now >= p.respawnAt) this.respawnPlayer(p);
    }
    for (const e of this.enemies) if (e.alive) e.updateEnemy(dt, this);

    for (const b of this.bullets) if (b.alive) b.update(dt, this);
    this.bullets = this.bullets.filter(b => b.alive);

    for (const pu of this.powerups) pu.update();
    for (const p of this.players) {
      if (!p.alive) continue;
      for (const pu of this.powerups) {
        if (pu.alive && rectsOverlap(p.rect(), pu.rect())) {
          pu.alive = false;
          this.applyPowerup(p, pu.type);
          this.sfx('powerup');
        }
      }
    }
    this.powerups = this.powerups.filter(p => p.alive);

    for (const ex of this.explosions) ex.update();
    this.explosions = this.explosions.filter(e => e.alive);

    this.checkLevelClear();
    this.checkGameOver();
  }

  trySpawnEnemy(now) {
    if (this.enemyQueue.length === 0) return;
    if (this.enemiesAliveOnField >= this.maxEnemiesOnField) return;
    if (now < this.nextSpawnAt) return;
    const spawnPoint = randChoice(this.enemySpawnPoints);
    const testBox = { x: spawnPoint.x, y: spawnPoint.y, w: TANK_SIZE, h: TANK_SIZE };
    for (const t of this.allTanks()) {
      if (t.alive && rectsOverlap(testBox, t.rect())) return;
    }
    const def = this.enemyQueue.shift();
    const tank = new Tank(spawnPoint.x, spawnPoint.y, DIR.DOWN, {
      isPlayer: false, enemyType: def.type, dropsItem: def.dropsItem,
    });
    this.enemies.push(tank);
    this.enemiesAliveOnField++;
    this.nextSpawnAt = now + randInt(1500, 2600);
  }

  allTanks() { return this.players.concat(this.enemies); }

  nearestPlayer(fromTank) {
    let best = null, bestD = Infinity;
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = (p.x - fromTank.x) ** 2 + (p.y - fromTank.y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  isBlockedByTiles(x, y, w, h) {
    const c0 = Math.floor(x / UNIT), c1 = Math.floor((x + w - 1) / UNIT);
    const r0 = Math.floor(y / UNIT), r1 = Math.floor((y + h - 1) / UNIT);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = this.grid[r][c];
        if (t === TILE.BRICK || t === TILE.STEEL || t === TILE.WATER || t === TILE.BASE) return true;
      }
    }
    return false;
  }

  handleBulletTileCollision(bullet) {
    const c0 = Math.floor(bullet.x / UNIT), c1 = Math.floor((bullet.x + bullet.w - 1) / UNIT);
    const r0 = Math.floor(bullet.y / UNIT), r1 = Math.floor((bullet.y + bullet.h - 1) / UNIT);
    // 特效以子弹中心为准，而不是整个格子中心
    const bx = bullet.x + bullet.w / 2 - UNIT / 2, by = bullet.y + bullet.h / 2 - UNIT / 2;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r < 0 || c < 0 || r >= GRID || c >= GRID) continue;
        const t = this.grid[r][c];
        if (t === TILE.BRICK) {
          this.grid[r][c] = TILE.EMPTY;
          bullet.alive = false;
          this.explosions.push(new Explosion(bx, by, UNIT, 'brick'));
          this.sfx('hit');
          return;
        } else if (t === TILE.STEEL) {
          const breaks = bullet.power >= 2;
          if (breaks) this.grid[r][c] = TILE.EMPTY;
          bullet.alive = false;
          this.explosions.push(new Explosion(bx, by, UNIT, breaks ? 'steel_break' : 'steel'));
          this.sfx('hit');
          return;
        } else if (t === TILE.BASE) {
          this.grid[r][c] = TILE.BASE_DEAD;
          bullet.alive = false;
          this.destroyBase();
          return;
        }
      }
    }
  }

  destroyBase() {
    this.base.alive = false;
    this.explosions.push(new Explosion(this.base.x, this.base.y, TANK_SIZE, 'base'));
    this.state = STATE.GAME_OVER;
    this.sfx('explosion');
  }

  handleBulletTankCollision(bullet) {
    for (const tank of this.allTanks()) {
      if (!tank.alive || tank === bullet.owner) continue;
      if (!bullet.isPlayerBullet && !tank.isPlayer) continue;
      if (rectsOverlap(bullet.rect(), tank.rect())) {
        bullet.alive = false;
        const killed = tank.hit(this, bullet.power, bullet.owner);
        if (killed) this.onTankKilled(tank, bullet.owner);
        else this.explosions.push(new Explosion(bullet.x - 6, bullet.y - 6, 18, 'armor'));
        return;
      }
    }
    for (const other of this.bullets) {
      if (other === bullet || !other.alive) continue;
      if (other.isPlayerBullet !== bullet.isPlayerBullet && rectsOverlap(other.rect(), bullet.rect())) {
        other.alive = false;
        bullet.alive = false;
        this.explosions.push(new Explosion(bullet.x - 6, bullet.y - 6, 18, 'bullet'));
        return;
      }
    }
  }

  killTank(tank) {
    tank.alive = false;
    this.explosions.push(new Explosion(tank.x, tank.y));
    this.sfx('explosion');
    if (tank.isPlayer) {
      tank.lives--;
      if (tank.lives > 0) tank.respawnAt = performance.now() + 1200;
    } else {
      this.enemiesAliveOnField--;
    }
  }

  onTankKilled(tank, killer) {
    if (!tank.isPlayer) {
      if (killer && killer.isPlayer) killer.score += ENEMY_TYPES[tank.enemyType].score;
      if (tank.dropsItem) this.spawnPowerup(tank.x, tank.y);
    }
  }

  spawnPowerup(x, y) {
    const type = randChoice(POWERUP_TYPES);
    this.powerups.push(new PowerUp(x, y, type));
  }

  applyPowerup(tank, type) {
    switch (type) {
      case 'star':
        tank.level = Math.min(3, tank.level + 1);
        this.applyPlayerLevel(tank);
        break;
      case 'helmet':
        tank.shieldUntil = performance.now() + HELMET_DURATION_MS;
        break;
      case 'grenade':
        for (const e of this.enemies) {
          if (e.alive) {
            e.alive = false;
            this.enemiesAliveOnField--;
            this.explosions.push(new Explosion(e.x, e.y));
            tank.score += ENEMY_TYPES[e.enemyType].score;
          }
        }
        break;
      case 'timer': {
        const until = performance.now() + TIMER_FREEZE_MS;
        for (const e of this.enemies) e.frozenUntil = until;
        break;
      }
      case 'shovel':
        this.reinforceBase();
        break;
      case 'tank':
        tank.lives++;
        break;
    }
  }

  applyPlayerLevel(tank) {
    const lvl = tank.level;
    tank.speed = PLAYER_BASE_SPEED + lvl * 0.4;
    tank.bulletSpeed = BULLET_BASE_SPEED + lvl * 1.5;
    tank.maxBullets = lvl >= 2 ? 2 : 1;
    tank.bulletPower = lvl >= 3 ? 2 : 1;
  }

  reinforceBase() {
    if (!this.base) return;
    const { r, c } = this.base;
    const cells = [];
    const addRange = (r0, r1, c0, c1) => {
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) cells.push([rr, cc]);
    };
    addRange(r - 2, r - 1, c - 2, c + 3);
    addRange(r, r + 1, c - 2, c - 1);
    addRange(r, r + 1, c + 2, c + 3);
    const changed = [];
    for (const [rr, cc] of cells) {
      if (rr < 0 || cc < 0 || rr >= GRID || cc >= GRID) continue;
      if (this.grid[rr][cc] === TILE.BRICK) {
        this.grid[rr][cc] = TILE.STEEL;
        changed.push([rr, cc]);
      }
    }
    clearTimeout(this._shovelRevertTimer);
    this._shovelRevertTimer = setTimeout(() => {
      for (const [rr, cc] of changed) {
        if (this.grid[rr][cc] === TILE.STEEL) this.grid[rr][cc] = TILE.BRICK;
      }
    }, SHOVEL_DURATION_MS);
  }

  checkLevelClear() {
    if (this.state !== STATE.PLAYING) return;
    if (this.enemyQueue.length === 0 && this.enemiesAliveOnField === 0) {
      if (this.level + 1 >= getLevelCount()) this.state = STATE.VICTORY;
      else this.state = STATE.LEVEL_CLEAR;
    }
  }

  checkGameOver() {
    if (this.state !== STATE.PLAYING) return;
    if (!this.base.alive) { this.state = STATE.GAME_OVER; return; }
    const anyoneLeft = this.players.some(p => p.alive || p.lives > 0);
    if (!anyoneLeft) this.state = STATE.GAME_OVER;
  }

  // ================= UI =================
  syncOverlays() {
    const o = this.dom.overlays;
    o.menu.style.display = this.state === STATE.MENU ? 'flex' : 'none';
    o.pause.style.display = this.state === STATE.PAUSED ? 'flex' : 'none';
    o.gameover.style.display = this.state === STATE.GAME_OVER ? 'flex' : 'none';
    o.levelclear.style.display = this.state === STATE.LEVEL_CLEAR ? 'flex' : 'none';
    o.victory.style.display = this.state === STATE.VICTORY ? 'flex' : 'none';

    if (this.state === STATE.GAME_OVER) {
      const total = this.players.reduce((s, p) => s + p.score, 0);
      this.dom.finalScore.textContent = total;
    }
    if (this.state === STATE.LEVEL_CLEAR) {
      this.dom.clearedLevel.textContent = this.level + 1;
    }
    if (this.state === STATE.VICTORY) {
      const total = this.players.reduce((s, p) => s + p.score, 0);
      this.dom.victoryScore.textContent = total;
    }
  }

  updateHud() {
    if (!this.players.length) return;
    this.dom.level.textContent = this.level + 1;
    this.dom.score1.textContent = this.players[0].score;
    this.dom.lives1.textContent = Math.max(0, this.players[0].lives);
    if (this.players[1]) {
      this.dom.score2.textContent = this.players[1].score;
      this.dom.lives2.textContent = Math.max(0, this.players[1].lives);
    }
    const remaining = (this.enemyQueue ? this.enemyQueue.length : 0) + (this.enemiesAliveOnField || 0);
    this.dom.enemiesLeft.textContent = remaining;
  }

  // ================= 渲染 =================
  render() {
    this.view.render();
  }
}
