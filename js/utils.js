function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function randChoice(arr) { return arr[randInt(0, arr.length - 1)]; }

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// 将 13x13 的大格关卡字符串数组展开成 26x26 的小格 tile 矩阵
function expandLevel(rows) {
  const grid = [];
  for (let r = 0; r < GRID; r++) grid.push(new Array(GRID).fill(TILE.EMPTY));
  for (let br = 0; br < BIG; br++) {
    const row = rows[br];
    for (let bc = 0; bc < BIG; bc++) {
      const ch = row[bc];
      let t = TILE.EMPTY;
      switch (ch) {
        case '#': t = TILE.BRICK; break;
        case '%': t = TILE.STEEL; break;
        case '~': t = TILE.WATER; break;
        case '*': t = TILE.FOREST; break;
        case '-': t = TILE.ICE; break;
        case 'E': t = TILE.BASE; break;
        default: t = TILE.EMPTY;
      }
      const sr = br * 2, sc = bc * 2;
      grid[sr][sc] = t;
      grid[sr][sc + 1] = t;
      grid[sr + 1][sc] = t;
      grid[sr + 1][sc + 1] = t;
    }
  }
  return grid;
}

function findBase(grid) {
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      if (grid[r][c] === TILE.BASE) return { r, c };
  return null;
}
