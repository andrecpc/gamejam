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
  // 70% from the pool, 30% from neutral pool
  const own = all.filter(u => u.pool === pool);
  const neutral = all.filter(u => u.pool === 'neutral');
  const rarityWeight = (rarity) => ({ common: 0.6, uncommon: 0.3, rare: rareChance })[rarity] || 0.1;

  function pickOne(arr, used){
    const candidates = arr.filter(u => !used.has(u.id));
    if (candidates.length===0) return null;
    return choiceWeighted(prng, candidates, u => rarityWeight(u.rarity));
  }

  const picks = [];
  const used = new Set();
  for (let i=0;i<3;i++){
    const fromOwn = prng() < 0.7;
    let p = fromOwn ? pickOne(own, used) : pickOne(neutral, used);
    if (!p) p = pickOne(own.concat(neutral), used);
    if (p){ picks.push(p); used.add(p.id); }
  }
  return picks;
}

export function applyUpgrade(state, upgrade) {
  for (const eff of upgrade.effects) state.applyUpgradeEffect(eff);
  state.upgradesTaken.push(upgrade.id);
}
