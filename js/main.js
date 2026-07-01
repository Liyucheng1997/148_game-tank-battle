function boot() {
  const canvas = document.getElementById('field');
  window.game = new Game(canvas);
  let last = performance.now();

  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    window.game.update(dt);
    window.game.render();
    window.game.input.clearFrame();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
