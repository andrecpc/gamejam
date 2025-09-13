// Perimeter path around the board; hero movement and special cells
export function buildPerimeterPath(gridSize, cellPx, offsetX, offsetY) {
  // Build a ring around an N x N grid, path cells aligned to grid cell edges
  const N = gridSize;
  const path = [];
  // Top row
  for (let x=0;x<N;x++) path.push({x, y:-1});
  // Right col
  for (let y=0;y<N;y++) path.push({x:N, y});
  // Bottom row
  for (let x=N-1;x>=0;x--) path.push({x, y:N});
  // Left col
  for (let y=N-1;y>=0;y--) path.push({x:-1, y});

  // Convert to canvas coords (center of path cell adjacent to border)
  const cells = path.map(p => {
    let cx, cy;
    if (p.y === -1) { // top
      cx = offsetX + (p.x+0.5)*cellPx; cy = offsetY + (-0.5)*cellPx;
    } else if (p.x === N) { // right
      cx = offsetX + (N+0.5)*cellPx; cy = offsetY + (p.y+0.5)*cellPx;
    } else if (p.y === N) { // bottom
      cx = offsetX + (p.x+0.5)*cellPx; cy = offsetY + (N+0.5)*cellPx;
    } else if (p.x === -1) { // left
      cx = offsetX + (-0.5)*cellPx; cy = offsetY + (p.y+0.5)*cellPx;
    }
    return { cx, cy };
  });

  return { cells, specials: new Map(), heroIndex: 0, lapCount: 0 };
}

export function updateHeroPathIndex(state, dtMs) {
  // Move one cell per speed interval (ms per cell from difficulty)
  if (state.inCombat || state.levelCompleted) return; // Stop when in combat or finished
  state._pathMoveAcc = (state._pathMoveAcc||0) + dtMs;
  const stepMs = state.diffCfg.heroStep * 1000; // e.g., 0.2s per cell
  while (state._pathMoveAcc >= stepMs) {
    state._pathMoveAcc -= stepMs;
    const prevIndex = state.path.heroIndex;
    state.path.heroIndex = (state.path.heroIndex + 1) % state.path.cells.length;
    if (state.path.heroIndex < prevIndex) {
      // wrapped around -> completed a lap
      state.path.lapCount = (state.path.lapCount||0) + 1;
      if (!state.inCombat && state.path.enemies && state.path.enemies.size===0) {
        state.levelCompleted = true;
      }
    }
    // Check special cell triggers
    const tile = state.path.specials.get(state.path.heroIndex);
    if (tile === 'heal_2') {
      state.hero.hp = Math.min(state.hero.maxHp, state.hero.hp + 2);
    }
  }
}
