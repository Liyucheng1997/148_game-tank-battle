# 坦克大战 · Battle City

经典坦克大战（Battle City）玩法复刻，纯原生 HTML / CSS / JavaScript 实现，无需构建工具，双击 `index.html` 或用任意静态服务器托管即可运行。

## 玩法特性

- 网格地图：砖墙（可摧毁）、钢墙、水面、树林（遮蔽坦克）、冰面
- 基地（老鹰）保护机制，基地被摧毁即游戏结束
- 单人模式 / 双人本地合作模式
- 4 种敌方坦克：普通、快速、强力、装甲（需 4 发命中）
- 6 种道具：★ 升级火力、🛡 无敌护盾、💣 全屏清敌、⏱ 冻结敌军、⛏ 铁甲基地、♥ 额外生命
- 子弹对撞相消、爆炸特效、坦克死亡/复活、多关卡与通关/失败流程

## 操作

- P1：方向键移动，Enter / `/` 开火
- P2（双人模式）：WASD 移动，空格开火
- P：暂停 / 继续
- M：静音切换

## 运行

直接用浏览器打开 `index.html`，或本地起一个静态服务器：

```bash
python -m http.server 8420
```

然后访问 `http://localhost:8420`。

## 项目结构

```
index.html        页面结构与 UI 覆盖层
style.css         样式
js/constants.js   尺寸、方向、地块类型等常量
js/utils.js       通用工具函数
js/levels.js      关卡地图数据
js/entities.js    坦克 / 子弹 / 道具 / 爆炸实体
js/input.js       键盘输入
js/sound.js       WebAudio 合成音效
js/game.js        游戏主逻辑（状态机、碰撞、渲染）
js/main.js        启动入口
```
