// Central game state: seed, data, hero, enemies, progress, thresholds, save/load
import { mulberry32, randInt, clamp } from './utils.js';

export class GameState {
  constructor(config) {
    this.config = config;
    // Seed from localStorage or random
    const saved = JSON.parse(localStorage.getItem('m3rpg_save')||'{}');
    this.seed = saved.seed ?? (Math.floor(Math.random()*1e9));
    this.prng = mulberry32(this.seed);

    // Difficulty config (basic multipliers)
    const diff = saved.difficulty ?? 'normal';
    this.difficulty = diff;
    this.diffCfg = {
      // Tougher enemies so first fight is lethal without upgrades
      easy:   { enemyHp:1.2,  enemyAtk:1.6,  heroStep:0.22, rareChance:0.12 },
      normal: { enemyHp:1.6,  enemyAtk:2.2,  heroStep:0.20, rareChance:0.10 },
      hard:   { enemyHp:2.0,  enemyAtk:2.8,  heroStep:0.18, rareChance:0.08 },
    }[diff];

    // Cards progress and thresholds
    this.cards = {
      light:   { cur: 0, cap: 20 },
      dark:    { cur: 0, cap: 20 },
      neutral: { cur: 0, cap: 20 },
    };

    const savedCards = saved.cards;
    if (savedCards) {
      for (const k of Object.keys(this.cards)) {
        if (savedCards[k]) this.cards[k] = savedCards[k];
      }
    }

    // Board & data (filled in main after data load)
    this.tileset = config.tileset;
    this.colors = this.tileset.colors; // [{id,type}]
    this.boardSize = clamp(this.tileset.boardSize||12, 6, 12);

    // Hero base stats
    const savedHero = saved.hero;
    this.hero = savedHero ?? {
      id: 'hero_1', kind: 'hero',
      maxHp: 30, hp: 30, atk: 6, def: 2, atkSpeed: 800,
      crit: { chance: 0.1, mult: 1.5 },
      spells: [], effects: [],
    };

    this.wave = saved.wave ?? 1;
    this.upgradesTaken = saved.upgradesTaken ?? [];

    // Path state (set in path module)
    this.path = null; // { cells: [...], specials: Map, heroIndex }
    this.inCombat = false;
    this.currentEnemy = null;
    this.levelCompleted = false;
  }

  addCardProgress(type, amount) {
    const c = this.cards[type];
    if (!c) return;
    c.cur = clamp(c.cur + amount, 0, c.cap);
  }

  isCardReady(type) {
    const c = this.cards[type];
    return c && c.cur >= c.cap;
  }

  consumeCard(type) {
    const c = this.cards[type];
    if (!c || c.cur < c.cap) return false;
    c.cur = 0;
    c.cap = Math.ceil(c.cap * 1.2);
    return true;
  }

  applyUpgradeEffect(effect) {
    // Minimal effect application
    if (effect.target === 'hero') {
      const stat = effect.stat;
      const op = effect.op;
      const val = effect.value;
      if (op === '+') {
        if (stat === 'maxHp') {
          this.hero.maxHp = Math.max(1, (this.hero.maxHp + val));
          this.hero.hp = Math.min(this.hero.hp, this.hero.maxHp);
        } else if (stat in this.hero) {
          this.hero[stat] = Math.max(0, (this.hero[stat] + val));
        }
      }
    } else if (effect.target === 'path') {
      if (effect.type === 'add_tile' && this.path) {
        // Place a special tile on a random empty path cell
        const indices = this.path.cells.map((_,i)=>i).filter(i => !this.path.specials.has(i));
        if (indices.length > 0) {
          const idx = indices[randInt(this.prng, 0, indices.length-1)];
          this.path.specials.set(idx, effect.tile);
        }
      }
    }
  }

  save() {
    const data = {
      seed: this.seed,
      difficulty: this.difficulty,
      hero: this.hero,
      cards: this.cards,
      wave: this.wave,
      upgradesTaken: this.upgradesTaken,
    };
    localStorage.setItem('m3rpg_save', JSON.stringify(data));
  }
}
