class Input {
  constructor() {
    this.keys = new Set();
    this.pressedOnce = new Set(); // 本帧新按下的键（用于菜单确认等边沿触发）
    window.addEventListener('keydown', (e) => {
      if (this._blockScroll(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedOnce.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  _blockScroll(code) {
    return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(code);
  }

  isDown(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressedOnce.has(code); }

  clearFrame() { this.pressedOnce.clear(); }

  // 玩家1: 方向键 + Enter/Slash 开火    玩家2: WASD + Space 开火
  get(playerIndex) {
    if (playerIndex === 1) {
      return {
        up: this.isDown('ArrowUp'),
        down: this.isDown('ArrowDown'),
        left: this.isDown('ArrowLeft'),
        right: this.isDown('ArrowRight'),
        shoot: this.isDown('Enter') || this.isDown('Slash') || this.isDown('NumpadEnter'),
      };
    }
    return {
      up: this.isDown('KeyW'),
      down: this.isDown('KeyS'),
      left: this.isDown('KeyA'),
      right: this.isDown('KeyD'),
      shoot: this.isDown('Space'),
    };
  }
}
