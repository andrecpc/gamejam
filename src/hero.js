// Character helpers

export function createEnemyFromData(data, multipliers={hp:1, atk:1}){
  return {
    id: data.id,
    name: data.name || data.id,
    kind: 'enemy',
    maxHp: Math.round((data.hp||10) * (multipliers.hp||1)),
    hp: Math.round((data.hp||10) * (multipliers.hp||1)),
    atk: Math.round((data.atk||3) * (multipliers.atk||1)),
    def: data.def||0,
    atkSpeed: data.atkSpeed||900,
    tags: data.tags||[],
    spells: data.spells||[],
    effects: [],
  };
}

