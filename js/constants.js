// ===== 基础尺寸常量 =====
const UNIT = 24;          // 最小砖块单位（像素），墙体以此粒度被摧毁
const BIG = 13;           // 关卡数据的“大格”边长（经典 13x13 布局）
const GRID = BIG * 2;     // 26 —— 以 UNIT 为单位的实际网格边长
const MAP_PX = GRID * UNIT; // 624 —— 战场像素尺寸（正方形）
const TANK_SIZE = UNIT * 2; // 48 —— 坦克占 2x2 个 UNIT

// ===== 方向 =====
const DIR = {
  UP:    { x: 0, y: -1, rot: 0 },
  DOWN:  { x: 0, y: 1,  rot: 180 },
  LEFT:  { x: -1, y: 0, rot: 270 },
  RIGHT: { x: 1,  y: 0, rot: 90 },
};
const DIR_LIST = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];

// ===== 地块类型 =====
const TILE = {
  EMPTY: 0,
  BRICK: 1,
  STEEL: 2,
  WATER: 3,
  FOREST: 4,
  ICE: 5,
  BASE: 6,
  BASE_DEAD: 7,
};

// ===== 游戏状态 =====
const STATE = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  LEVEL_CLEAR: 'level_clear',
  GAME_OVER: 'game_over',
  VICTORY: 'victory',
};

// ===== 敌方坦克类型 =====
const ENEMY_TYPES = {
  BASIC: { color: '#c9c9c9', dark: '#8a8a8a', speed: 1.4, hp: 1, score: 100, fireRate: 1600 },
  FAST:  { color: '#7fd0ff', dark: '#4a93bf', speed: 2.6, hp: 1, score: 200, fireRate: 1400 },
  POWER: { color: '#ff8fd6', dark: '#c357a0', speed: 1.5, hp: 1, score: 300, fireRate: 900, bulletSpeed: 8, power: 2 },
  ARMOR: { color: '#8fffa0', dark: '#4fae5f', speed: 1.1, hp: 4, score: 400, fireRate: 1500 },
};
const ENEMY_TYPE_LIST = Object.keys(ENEMY_TYPES);

// ===== 道具类型 =====
const POWERUP_TYPES = ['star', 'helmet', 'grenade', 'timer', 'shovel', 'tank'];

// ===== 其它 =====
const PLAYER_BASE_SPEED = 2.2;
const BULLET_BASE_SPEED = 6;
const SPAWN_INVULN_MS = 2000;
const HELMET_DURATION_MS = 10000;
const TIMER_FREEZE_MS = 9000;
const SHOVEL_DURATION_MS = 15000;
const ITEM_LIFETIME_MS = 12000;
