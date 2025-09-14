import { tryFetchJson, nowMs, clamp } from './utils.js';
import { GameState } from './gameState.js';
import { Match3Board } from './match3.js';
import { buildPerimeterPath, updateHeroPathIndex } from './path.js';
import { CombatManager } from './combat.js';
import { loadUpgrades, sampleUpgrades, applyUpgrade } from './upgrades.js';
import { createEnemyFromData } from './hero.js';
import { setupUI } from './ui.js';

const defaultTileset = {
  colors: [
    {id:'red', type:'light'},
    {id:'yellow', type:'light'},
    {id:'blue', type:'dark'},
    {id:'purple', type:'dark'},
    {id:'green', type:'neutral'}
  ],
  boardSize: 8,
};

const defaultEnemies = [
  { id:'slime_basic', name:'Slime', hp:18, atk:4, def:1, atkSpeed:900, tags:['beast'], spells:[{id:'poison_spit', chance:0.15}] }
];

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Responsive layout: compute board rect inside canvas
function computeLayout(boardSize) {
  // Keep some padding for path
  const W = canvas.width, H = canvas.height;
  const pad = 20;
  const cell = Math.floor(Math.min((W - pad*2) / (boardSize+1), (H - pad*2) / (boardSize+1)));
  const boardW = cell * boardSize;
  const boardH = cell * boardSize;
  const offX = Math.floor((W - boardW) / 2);
  const offY = Math.floor((H - boardH) / 2);
  return { cell, offX, offY, boardW, boardH };
}

function fitCanvasToCSS() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.floor(rect.width * dpr);
  const h = Math.floor(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h){
    canvas.width = w; canvas.height = h;
  }
}

async function boot() {
  // Load data (with fallbacks for file://)
  const tileset = await tryFetchJson('data/tileset.json', defaultTileset);
  const enemiesData = await tryFetchJson('data/enemies.json', defaultEnemies);
  const upgradesAll = await loadUpgrades();

  const state = new GameState({ tileset });
  const board = new Match3Board(state.boardSize, state.colors, state.prng);
  const combat = new CombatManager(state);
  const images = createImageCache();

  // Prepare layout & path
  fitCanvasToCSS();
  let layout = computeLayout(state.boardSize);
  state.path = buildPerimeterPath(state.boardSize, layout.cell, layout.offX, layout.offY);

  // Place a few enemies on path
  const enemyEvery = Math.max(6, Math.floor(state.path.cells.length/4));
  state.path.enemies = new Map(); // index -> enemyData
  const pattern = [];
  const choices = enemiesData; // rotate types along the path
  let ci = 0;
  for (let i=enemyEvery; i<state.path.cells.length; i+=enemyEvery){
    const eData = choices[ci % choices.length]; ci++;
    state.path.enemies.set(i, eData);
    images.load(`assets/units/${eData.id}.png`);
    pattern.push({ index: i, enemyId: eData.id, base: eData });
  }
  state.path.spawnPattern = { indices: pattern };
  // Preload hero sprite
  images.load('assets/units/hero.png');
  // Optional effects sprites
  images.load('assets/units/wolf.png');
  images.load('assets/effects/fire_orb.png');

  // Preload tile sprites if provided in tileset
  const tileSprites = {};
  for (const c of state.colors){
    if (c.sprite){ tileSprites[c.id] = c.sprite; images.load(c.sprite); }
  }
  state.tileSprites = tileSprites;

  // UI
  const ui = setupUI(state, {
    onCardClick: (type) => {
      if (!state.consumeCard(type)) return;
      const picks = sampleUpgrades(state.prng, upgradesAll, type, state.diffCfg.rareChance);
      ui.showUpgradeModal(picks);
    },
    onRestart: () => {
      // Hard reset: clear save and reload page to reset everything
      localStorage.removeItem('m3rpg_save');
      location.reload();
    },
    onPickUpgrade: (opt) => {
      applyUpgrade(state, opt);
      ui.updateHUD(); ui.updateCards();
      state.save();
    }
  });

  // Try to load optional card icons without 404 console noise
  tryLoadCardIcon('assets/icons/card_light.png', document.querySelector('#card-light .card-icon'));
  tryLoadCardIcon('assets/icons/card_neutral.png', document.querySelector('#card-neutral .card-icon'));
  tryLoadCardIcon('assets/icons/card_dark.png', document.querySelector('#card-dark .card-icon'));

  // Input: swipe / drag adjacent tiles
  const animator = createBoardAnimator(board, layout);
  const input = makeBoardInput(canvas, () => layout, state, board, ui, animator);

  // Main loop
  let last = nowMs();
  function frame(){
    fitCanvasToCSS();
    const newLayout = computeLayout(state.boardSize);
    const changed = !state._lastLayout || newLayout.cell!==state._lastLayout.cell || newLayout.offX!==state._lastLayout.offX || newLayout.offY!==state._lastLayout.offY || newLayout.boardW!==state._lastLayout.boardW || newLayout.boardH!==state._lastLayout.boardH;
    layout = newLayout;
    if (changed && state.path){
      // Rebuild path coords preserving specials/enemies/heroIndex
      const prev = state.path;
      const rebuilt = buildPerimeterPath(state.boardSize, layout.cell, layout.offX, layout.offY);
      rebuilt.heroIndex = prev.heroIndex;
      rebuilt.specials = new Map(prev.specials);
      rebuilt.enemies = new Map(prev.enemies||[]);
      rebuilt.spawnPattern = prev.spawnPattern; // preserve respawn pattern
      rebuilt.lapCount = prev.lapCount||0;
      state.path = rebuilt;
      state._lastLayout = layout;
    }
    if (changed) animator.refreshLayout(layout);
    // Forward: movement / combat
    const t = nowMs();
    const dt = Math.min(50, t - last); // clamp dt
    last = t;
    // If hero at enemy cell and not in combat -> start combat
    if (!state.inCombat && !state.levelCompleted && state.path.enemies && state.path.enemies.has(state.path.heroIndex)){
      const eData = state.path.enemies.get(state.path.heroIndex);
      const enemy = createEnemyFromData(eData, { hp: state.diffCfg.enemyHp, atk: state.diffCfg.enemyAtk });
      combat.start(enemy);
      // Once fight starts, remove enemy from path
      state.path.enemies.delete(state.path.heroIndex);
    }
    // Update combat or movement
    if (state.inCombat) combat.update(dt); else updateHeroPathIndex(state, dt);

    // Update board animations
    animator.update(dt, layout);

    // Render
    render(ctx, layout, state, board, animator, images);
    ui.updateHUD(); ui.updateCards();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

  function makeBoardInput(canvas, getLayout, state, board, ui, animator){
  let touchId = null;
  let start = null; // {x,y, gx,gy}
  const threshold = 12; // px in canvas space

  function canvasToGrid(px,py){
    const { offX, offY, cell } = getLayout();
    const gx = Math.floor((px - offX) / cell);
    const gy = Math.floor((py - offY) / cell);
    return { gx, gy };
  }

  function onStart(x,y, id){
    if (animator.busy || state.levelCompleted) return;
    const {gx, gy} = canvasToGrid(x,y);
    if (gx<0||gy<0||gx>=board.size||gy>=board.size) return;
    start = { x, y, gx, gy };
    touchId = id||'mouse';
  }
  function onMove(x,y){ /* not needed */ }
  function onEnd(x,y, id){
    if (touchId!==id&&id!=='mouse') return;
    if (!start) return;
    const dx = x - start.x, dy = y - start.y;
    if (Math.hypot(dx,dy) < threshold){ start=null; return; }
    let dirX=0, dirY=0;
    if (Math.abs(dx) > Math.abs(dy)) dirX = dx>0? 1:-1; else dirY = dy>0? 1:-1;
    const ax = start.gx, ay = start.gy;
    const bx = clamp(ax+dirX,0,board.size-1), by = clamp(ay+dirY,0,board.size-1);
    const plan = board.planSwap(ax,ay,bx,by);
    animator.enqueuePlan(plan, () => {
      if (plan.valid) {
        // Commit logical grid after animations
        board.grid = plan.finalGrid.slice();
        const gains = plan.scoreByType || {};
        state.addCardProgress('light', gains.light||0);
        state.addCardProgress('dark', gains.dark||0);
        state.addCardProgress('neutral', gains.neutral||0);
        state.save();
        ui.updateCards(); ui.updateHUD();
      }
    });
    start = null; touchId=null;
  }

  // Touch
  canvas.addEventListener('touchstart', e=>{
    const t = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (t.clientX - rect.left) * (canvas.width/rect.width);
    const y = (t.clientY - rect.top) * (canvas.height/rect.height);
    onStart(x,y, t.identifier);
    e.preventDefault();
  }, {passive:false});
  canvas.addEventListener('touchend', e=>{
    const t = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (t.clientX - rect.left) * (canvas.width/rect.width);
    const y = (t.clientY - rect.top) * (canvas.height/rect.height);
    onEnd(x,y, t.identifier);
    e.preventDefault();
  }, {passive:false});

  // Mouse
  let down=false;
  canvas.addEventListener('mousedown', e=>{
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width/rect.width);
    const y = (e.clientY - rect.top) * (canvas.height/rect.height);
    down=true; onStart(x,y,'mouse');
  });
  canvas.addEventListener('mouseup', e=>{
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width/rect.width);
    const y = (e.clientY - rect.top) * (canvas.height/rect.height);
    if (down) onEnd(x,y,'mouse');
    down=false;
  });

  return {};
}

function render(ctx, layout, state, board, animator, images){
  const { offX, offY, cell, boardW, boardH } = layout;
  // Clear
  ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);

  // Board cells
  ctx.lineWidth = Math.max(1, cell*0.03);
  for (let y=0;y<board.size;y++){
    for (let x=0;x<board.size;x++){
      const rx = offX + x*cell, ry = offY + y*cell;
      ctx.fillStyle = '#0f1720';
      roundRect(ctx, rx+1, ry+1, cell-2, cell-2, Math.min(10, cell*0.18));
      ctx.fill();
    }
  }

  // Draw animated tiles (with sprites if available)
  animator.draw(ctx, layout, images, state.tileSprites||{});

  // Path background (lighter to improve sprite contrast)
  ctx.strokeStyle = '#5c7ea3';
  ctx.lineWidth = Math.max(1, cell*0.1);
  ctx.strokeRect(offX-0.5*cell, offY-0.5*cell, boardW+cell, boardH+cell);

  // Path cells (dots)
  if (state.path){
    for (let i=0;i<state.path.cells.length;i++){
      const p = state.path.cells[i];
      const r = Math.max(2, cell*0.16);
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, r, 0, Math.PI*2);
      const special = state.path.specials.get(i);
      if (special === 'heal_2') ctx.fillStyle = '#48e08a';
      else ctx.fillStyle = '#6d93b8';
      ctx.fill();

      // Enemy marker (sprite if available)
      if (state.path.enemies && state.path.enemies.has(i)){
        const e = state.path.enemies.get(i);
        const img = images.get(`assets/units/${e.id}.png`);
        const size = cell*0.72;
        if (img){ ctx.drawImage(img, p.cx - size/2, p.cy - size/2, size, size); }
        else { ctx.fillStyle = '#c94d4d'; ctx.beginPath(); ctx.arc(p.cx, p.cy, r*1.6, 0, Math.PI*2); ctx.fill(); }
      }
    }
  }

  // Hero icon
  if (state.path){
    const p = state.path.cells[state.path.heroIndex];
    // Draw hero sprite if available
    const heroImg = images.get('assets/units/hero.png');
    if (heroImg){
      const size = cell*0.8;
      ctx.drawImage(heroImg, p.cx - size/2, p.cy - size/2, size, size);
    } else {
      ctx.fillStyle = state.inCombat ? '#ffd166' : '#4db6ff';
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, Math.max(3, cell*0.22), 0, Math.PI*2);
      ctx.fill();
    }
    // Companion wolf visual — runs alongside the hero (no orbit)
    if (state.hero.companions && state.hero.companions.wolf>0){
      const img = images.get('assets/units/wolf.png');
      const size = cell*0.6;
      const nextIdx = (state.path.heroIndex + 1) % state.path.cells.length;
      const pn = state.path.cells[nextIdx];
      // Tangent vector hero->next, then perpendicular normal to place wolf at the side
      let vx = pn.cx - p.cx; let vy = pn.cy - p.cy; const len = Math.hypot(vx,vy)||1; vx/=len; vy/=len;
      const nx = -vy, ny = vx; // left normal
      const offset = cell*0.7;
      const wobble = Math.sin(performance.now()/300)*cell*0.06; // slight breathing
      const wx = p.cx + nx*offset;
      const wy = p.cy + ny*offset + wobble;
      if (img) ctx.drawImage(img, wx - size/2, wy - size/2, size, size);
      else { ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.arc(wx, wy, Math.max(3, cell*0.18), 0, Math.PI*2); ctx.fill(); }
    }
    // Fire orb visual
    if (state.hero.auras && state.hero.auras.fire_orb){
      const img = images.get('assets/effects/fire_orb.png');
      const size = cell*0.4;
      const angle = (performance.now()/800)%1 * Math.PI*2;
      const r = cell*0.7;
      const ox = p.cx + Math.cos(angle) * r;
      const oy = p.cy + Math.sin(angle) * r;
      if (img) ctx.drawImage(img, ox - size/2, oy - size/2, size, size);
      else { ctx.fillStyle = '#ff7b39'; ctx.beginPath(); ctx.arc(ox, oy, Math.max(3, cell*0.14), 0, Math.PI*2); ctx.fill(); }
    }
  }

  // If in combat, draw overlay HP bars
  if (state.inCombat && state.currentEnemy){
    const barW = Math.max(80, cell*3);
    drawBar(ctx, ctx.canvas.width/2 - barW/2, offY + boardH + cell*0.8, barW, 10, state.hero.hp/state.hero.maxHp, '#4caf50');
    drawBar(ctx, ctx.canvas.width/2 - barW/2, offY - cell*1.2, barW, 10, state.currentEnemy.hp/state.currentEnemy.maxHp, '#e57373');
  }

  // Level complete overlay
  if (state.levelCompleted){
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0,0,ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#e6e6e6';
    ctx.font = `bold ${Math.max(18, cell*0.9)}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Уровень пройден', ctx.canvas.width/2, ctx.canvas.height/2);
    ctx.restore();
  }

  // out-of-moves overlay removed
}

function roundRect(ctx, x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function drawBar(ctx, x,y,w,h, p, color){
  ctx.fillStyle = '#10202e'; ctx.fillRect(x,y,w,h);
  ctx.fillStyle = color; ctx.fillRect(x,y,w*clamp(p,0,1),h);
  ctx.strokeStyle = '#2a3a4d'; ctx.strokeRect(x+0.5,y+0.5,w-1,h-1);
}

function colorForId(id){
  switch(id){
    case 'red': return '#d9534f';
    case 'yellow': return '#f0ad4e';
    case 'blue': return '#5bc0de';
    case 'purple': return '#b065ff';
    case 'green': return '#5cb85c';
    default: return '#3a3f44';
  }
}

// Adjust canvas resolution on resize/orientation
window.addEventListener('resize', ()=>{
  // nothing, fitted each frame
});

boot();

// --- Board Animator ---
function createBoardAnimator(board, layout){
  const tiles = new Map(); // key "x,y" -> {id,x,y,px,py,alpha,scale}
  for (let y=0;y<board.size;y++){
    for (let x=0;x<board.size;x++){
      const id = board.grid[y*board.size + x];
      const {cx,cy} = centerOf(layout, x,y);
      tiles.set(key(x,y), {id,x,y,px:cx,py:cy,alpha:1,scale:1});
    }
  }
  let busy = false;
  let step = null; // current action runner
  const queue = [];
  let onDone = null;
  let lastSwapPair = null;
  const floating = new Set(); // tiles currently animating and not in the grid map

  function enqueuePlan(plan, done){
    if (!plan) return;
    busy = true; onDone = done;
    queue.length = 0;
    for (const a of plan.actions) queue.push(a);
    advance();
  }

  function advance(){
    step = null;
    if (queue.length===0){ busy=false; if (onDone) onDone(); onDone=null; return; }
    const action = queue.shift();
    if (action.type==='swap') step = runSwap(action);
    else if (action.type==='swapBack') step = runSwapBack();
    else if (action.type==='clear') step = runClear(action);
    else if (action.type==='fall') step = runFall(action);
    else if (action.type==='spawn') step = runSpawn(action);
    else { advance(); }
  }

  function runSwap(a){
    const dur = 140;
    const A = tiles.get(key(a.a.x,a.a.y));
    const B = tiles.get(key(a.b.x,a.b.y));
    if (!A||!B) return simpleDelay(0);
    const Ato = centerOf(layout, a.b.x,a.b.y);
    const Bto = centerOf(layout, a.a.x,a.a.y);
    lastSwapPair = { a:{x:a.a.x,y:a.a.y}, b:{x:a.b.x,y:a.b.y} };
    let t=0; return {
      update(dt){ t+=dt; const p=Math.min(1,t/dur); A.px = lerp(A.px, Ato.cx, p); A.py = lerp(A.py, Ato.cy, p); B.px = lerp(B.px, Bto.cx, p); B.py = lerp(B.py, Bto.cy, p); },
      done(){ if (t>=dur){
        // Swap logical positions in visual map
        tiles.delete(key(a.a.x,a.a.y)); tiles.delete(key(a.b.x,a.b.y));
        A.x=a.b.x; A.y=a.b.y; B.x=a.a.x; B.y=a.a.y; tiles.set(key(A.x,A.y),A); tiles.set(key(B.x,B.y),B); return true; } return false; }
    };
  }
  function runSwapBack(){
    if (!lastSwapPair) return simpleDelay(0);
    const a = lastSwapPair.a, b = lastSwapPair.b;
    const action = { a:{x:a.x,y:a.y}, b:{x:b.x,y:b.y} };
    // After the first swap, tiles currently reside at opposite positions, so swapping again returns them.
    return runSwap(action);
  }
  function runClear(a){
    const dur = 180;
    const cells = a.cells.map(c=> ({ c, tile: tiles.get(key(c.x,c.y)) })).filter(o=>o.tile);
    let t=0; return {
      update(dt){ t+=dt; const p=Math.min(1,t/dur); for (const o of cells){ o.tile.alpha = 1-p; o.tile.scale = 1 - 0.4*p; } },
      done(){ if (t>=dur){ for (const o of cells){ tiles.delete(key(o.c.x,o.c.y)); } return true; } return false; }
    };
  }
  function runFall(a){
    // Multiple moves with different distances; finish when all settled
    const moves = a.moves.map(m => {
      const tile = tiles.get(key(m.x,m.fromY));
      if (!tile) return null;
      tiles.delete(key(tile.x,tile.y));
      floating.add(tile);
      const to = centerOf(layout, m.x, m.toY);
      const from = {cx: tile.px, cy: tile.py};
      const cellsDist = Math.abs(m.toY - m.fromY);
      const dur = Math.max(100, cellsDist*120);
      return {tile, to, from, x:m.x, y:m.toY, t:0, dur};
    }).filter(Boolean);
    return {
      update(dt){ for (const mv of moves){ mv.t += dt; const p=Math.min(1,mv.t/mv.dur); mv.tile.px = lerp(mv.from.cx, mv.to.cx, p); mv.tile.py = lerp(mv.from.cy, mv.to.cy, p); } },
      done(){
        const all = moves.every(mv=> mv.t>=mv.dur);
        if (all){ for (const mv of moves){ mv.tile.x = mv.x; mv.tile.y = mv.y; tiles.set(key(mv.x,mv.y), mv.tile); floating.delete(mv.tile); } }
        return all;
      }
    };
  }
  function runSpawn(a){
    const spawns = a.spawns.map(s => {
      const to = centerOf(layout, s.x, s.toY);
      const from = centerOf(layout, s.x, s.fromY);
      const tile = { id:s.id, x:s.x, y:s.toY, px:from.cx, py:from.cy, alpha:1, scale:1 };
      const cellsDist = Math.abs(s.toY - s.fromY);
      const dur = Math.max(100, cellsDist*120);
      floating.add(tile);
      return {tile, to, t:0, dur};
    });
    return {
      update(dt){ for (const sp of spawns){ sp.t += dt; const p=Math.min(1,sp.t/sp.dur); sp.tile.px = lerp(sp.tile.px, sp.to.cx, p); sp.tile.py = lerp(sp.tile.py, sp.to.cy, p); } },
      done(){
        const all = spawns.every(sp=> sp.t>=sp.dur);
        if (all){ for (const sp of spawns){ tiles.set(key(sp.tile.x, sp.tile.y), sp.tile); floating.delete(sp.tile); } }
        return all;
      }
    };
  }

  function simpleDelay(ms){ let t=0; return { update(dt){ t+=dt; }, done(){ return t>=ms; } }; }

  function update(dt){ if (!busy) return; if (!step) advance(); if (!step) return; step.update(dt); if (step.done()) advance(); }
  function draw(ctx, layout, images, tileSprites){
    for (const t of tiles.values()){
      const {cx, cy} = {cx:t.px, cy:t.py};
      const s = Math.max(0.6, t.scale||1);
      const size = (layout.cell - 2) * s;
      drawTile(ctx, cx, cy, size, t.id, images, tileSprites);
    }
    // Draw floating tiles (moving/spawning)
    for (const t of floating){
      const {cx, cy} = {cx:t.px, cy:t.py};
      const s = Math.max(0.6, t.scale||1);
      const size = (layout.cell - 2) * s;
      drawTile(ctx, cx, cy, size, t.id, images, tileSprites, t.alpha);
    }
  }

  function refreshLayout(newLayout){
    for (const t of tiles.values()){
      const {cx,cy} = centerOf(newLayout, t.x, t.y);
      t.px = cx; t.py = cy;
    }
  }

  return { enqueuePlan, update, draw, refreshLayout, get busy(){ return busy; } };
}

function key(x,y){ return `${x},${y}`; }
function centerOf(layout, x,y){ return { cx: layout.offX + (x+0.5)*layout.cell, cy: layout.offY + (y+0.5)*layout.cell } }
function lerp(a,b,p){ return a + (b-a)*p; }

// --- Image cache (auto-scaled on draw) ---
function createImageCache(){
  const cache = new Map();
  return {
    load(url){ if (cache.has(url)) return; const img = new Image(); img.src = url; cache.set(url, null); img.onload=()=>cache.set(url,img); img.onerror=()=>cache.delete(url); },
    get(url){ return cache.get(url)||null; }
  };
}

function drawTile(ctx, cx, cy, size, id, images, tileSprites, alpha=1){
  ctx.save();
  ctx.globalAlpha = alpha;
  const sprite = tileSprites && tileSprites[id];
  const img = sprite ? images.get(sprite) : null;
  if (img){
    ctx.drawImage(img, cx - size/2, cy - size/2, size, size);
  } else {
    ctx.fillStyle = colorForId(id);
    roundRect(ctx, cx - size/2, cy - size/2, size, size, Math.min(10, size*0.18));
    ctx.fill();
  }
  ctx.restore();
}

function tryLoadCardIcon(url, imgEl){
  if (!imgEl) return;
  fetch(url, { method: 'GET' }).then(r=>{
    if (r.ok){
      imgEl.src = url; imgEl.style.display = 'inline-block';
    }
  }).catch(()=>{});
}
