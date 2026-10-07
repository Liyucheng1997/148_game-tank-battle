// three.js 以 ES Module 形式从 CDN 动态加载（file:// 直接打开也可用），加载完成后再启动游戏
const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js',
  'https://unpkg.com/three@0.170.0/build/three.module.min.js',
];

async function loadThree() {
  for (const url of THREE_URLS) {
    try {
      return await import(url);
    } catch (e) {
      console.warn('three.js 加载失败，尝试下一个源：', url, e);
    }
  }
  throw new Error('无法加载 three.js，请检查网络连接');
}

function showFatal(msg) {
  const el = document.getElementById('loading');
  el.textContent = msg;
  el.classList.add('error');
}

function boot() {
  const canvas = document.getElementById('field');
  window.game = new Game(canvas);
  document.getElementById('loading').remove();
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

loadThree()
  .then((mod) => {
    window.THREE = mod;
    try {
      boot();
    } catch (e) {
      console.error(e);
      showFatal('3D 渲染初始化失败：' + e.message);
    }
  })
  .catch((e) => showFatal(e.message));
