// Simple auto-combat loop between hero and an enemy
import { clamp } from './utils.js';

export class CombatManager {
  constructor(state) {
    this.state = state;
    this.acc = 0;
    this.tickMs = 100; // combat sub-tick
    this._heroCd = 0;
    this._enemyCd = 0;
  }

  start(enemy) {
    this.state.inCombat = true;
    this.state.currentEnemy = JSON.parse(JSON.stringify(enemy));
    this._heroCd = 0;
    this._enemyCd = 0;
  }

  update(dtMs) {
    if (!this.state.inCombat) return;
    this.acc += dtMs;
    while (this.acc >= this.tickMs) {
      this.acc -= this.tickMs;
      this._tick(this.tickMs);
    }
  }

  _tick(ms) {
    const s = this.state;
    const hero = s.hero;
    const enemy = s.currentEnemy;
    if (!enemy) return;

    this._heroCd -= ms;
    this._enemyCd -= ms;

    if (this._heroCd <= 0) {
      const dmg = Math.max(1, Math.floor(hero.atk - (enemy.def||0)));
      enemy.hp -= dmg;
      this._heroCd += (hero.atkSpeed||800);
    }
    if (enemy.hp <= 0) {
      // Victory
      s.inCombat = false;
      s.currentEnemy = null;
      return;
    }

    if (this._enemyCd <= 0) {
      const dmg = Math.max(1, Math.floor((enemy.atk||3) - (hero.def||0)));
      hero.hp -= dmg;
      this._enemyCd += (enemy.atkSpeed||900);
    }
    if (hero.hp <= 0) {
      // Defeat -> respawn hero at start with full hp, keep upgrades
      hero.hp = hero.maxHp;
      s.inCombat = false;
      s.currentEnemy = null;
      s.path.heroIndex = 0;
      s.levelCompleted = false;
      // Respawn all enemies on the path using saved spawn pattern
      if (s.path && s.path.spawnPattern) {
        const { every, base } = s.path.spawnPattern;
        s.path.enemies = new Map();
        for (let i=every; i<s.path.cells.length; i+=every){
          s.path.enemies.set(i, base);
        }
      }
    }
  }
}
