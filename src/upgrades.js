// Upgrades: loading, sampling, and applying
import { tryFetchJson, choiceWeighted } from './utils.js';

const defaultUpgrades = [
  { id:'hp_plus_5', rarity:'common', pool:'light', text:'Герой: +5 HP', effects:[{target:'hero', stat:'maxHp', op:'+', value:5}] },
  { id:'atk_plus_2', rarity:'common', pool:'dark', text:'Герой: +2 Atk', effects:[{target:'hero', stat:'atk', op:'+', value:2}] },
  { id:'road_heal', rarity:'uncommon', pool:'neutral', text:'На дорожке появляется клетка лечения (+2 HP).', effects:[{target:'path', type:'add_tile', tile:'heal_2'}] },
  { id:'glass_cannon', rarity:'rare', pool:'dark', text:'+7 Atk, но −5 HP', effects:[{target:'hero', stat:'atk', op:'+', value:7}, {target:'hero', stat:'maxHp', op:'+', value:-5}] },
];

export async function loadUpgrades() {
  return tryFetchJson('data/upgrades.json', defaultUpgrades);
}

export function sampleUpgrades(prng, all, pool, rareChance=0.1) {
  // Mix 70% own pool and 30% neutral/common pool
  const poolItems = all.filter(u => u.pool === pool);
  const misc = all.filter(u => u.pool === 'neutral');
  const candidates = [...poolItems, ...misc];
  const rarityWeight = (rarity) => ({
    common: 0.6,
    uncommon: 0.3,
    rare: rareChance,
  })[rarity] || 0.1;

  const picks = [];
  const used = new Set();
  const tries = 30;
  for (let n=0;n<3;n++){
    let best = null;
    for (let t=0;t<tries;t++){
      const cand = candidates[Math.floor(prng()*candidates.length)];
      if (!cand || used.has(cand.id)) continue;
      const weight = rarityWeight(cand.rarity);
      if (best==null || prng() < weight) best = cand;
    }
    if (best) { picks.push(best); used.add(best.id); }
  }
  return picks;
}

export function applyUpgrade(state, upgrade) {
  for (const eff of upgrade.effects) state.applyUpgradeEffect(eff);
  state.upgradesTaken.push(upgrade.id);
}

