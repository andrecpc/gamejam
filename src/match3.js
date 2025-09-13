// Match-3 board logic: grid, swapping, matching, gravity, cascades
import { randInt } from './utils.js';

export class Match3Board {
  constructor(size, colors, prng) {
    this.size = size; // N x N
    this.colors = colors; // [{id,type}]
    this.prng = prng;
    this.grid = new Array(size*size).fill(null);
    this.populateInitial();
  }

  index(x,y){ return y*this.size + x; }
  inBounds(x,y){ return x>=0 && y>=0 && x<this.size && y<this.size; }

  randomColorId() { return this.colors[randInt(this.prng, 0, this.colors.length-1)].id; }
  getTypeById(id){ return (this.colors.find(c=>c.id===id)||{}).type || 'neutral'; }

  populateInitial(){
    for(let y=0;y<this.size;y++){
      for(let x=0;x<this.size;x++){
        let id;
        do {
          id = this.randomColorId();
        } while(this.causesImmediateMatch(x,y,id));
        this.grid[this.index(x,y)] = id;
      }
    }
  }

  causesImmediateMatch(x,y,id){
    // Simple check to avoid 3-in-a-row on init
    // Horizontal
    if (x>=2) {
      const a = this.grid[this.index(x-1,y)];
      const b = this.grid[this.index(x-2,y)];
      if (a===id && b===id) return true;
    }
    // Vertical
    if (y>=2) {
      const a = this.grid[this.index(x,y-1)];
      const b = this.grid[this.index(x,y-2)];
      if (a===id && b===id) return true;
    }
    return false;
  }

  swapIfValid(ax,ay,bx,by){
    if (!this.inBounds(ax,ay) || !this.inBounds(bx,by)) return {moved:false};
    const dx = Math.abs(ax-bx), dy = Math.abs(ay-by);
    if ((dx+dy)!==1) return {moved:false};
    const ai = this.index(ax,ay), bi = this.index(bx,by);
    [this.grid[ai], this.grid[bi]] = [this.grid[bi], this.grid[ai]];
    const matches = this.findMatches();
    if (matches.length===0){
      // revert
      [this.grid[ai], this.grid[bi]] = [this.grid[bi], this.grid[ai]];
      return {moved:false};
    }
    // resolve cascades
    const result = this.resolveMatches(matches);
    return {moved:true, result};
  }

  findMatches(){
    const N = this.size; const matches = [];
    // Horizontal
    for (let y=0;y<N;y++){
      let x=0;
      while(x<N){
        const id = this.grid[this.index(x,y)];
        let len=1;
        while(x+len<N && this.grid[this.index(x+len,y)]===id) len++;
        if (id!=null && len>=3) matches.push({dir:'h', x, y, len, id});
        x += len || 1;
      }
    }
    // Vertical
    for (let x=0;x<N;x++){
      let y=0;
      while(y<N){
        const id = this.grid[this.index(x,y)];
        let len=1;
        while(y+len<N && this.grid[this.index(x,y+len)]===id) len++;
        if (id!=null && len>=3) matches.push({dir:'v', x, y, len, id});
        y += len || 1;
      }
    }
    return matches;
  }

  resolveMatches(initial){
    // Returns accumulated score per type and per color
    const scoreByType = { light:0, dark:0, neutral:0 };
    const scoreByColor = {};

    const N = this.size;
    let iterations = 0;
    let totalCleared = 0;
    let matches = initial;
    while(matches.length>0 && iterations<20){
      // Clear
      const toClear = new Set();
      for (const m of matches){
        const {dir, x, y, len, id} = m;
        const type = this.getTypeById(id);
        // Match 3/4/5 gives 3/4/5 points (one per group, not per tile)
        scoreByType[type] = (scoreByType[type]||0) + Math.min(5, Math.max(3, len));
        scoreByColor[id] = (scoreByColor[id]||0) + len;
        for(let k=0;k<len;k++){
          const cx = dir==='h'? x+k : x;
          const cy = dir==='v'? y+k : y;
          toClear.add(this.index(cx,cy));
        }
      }
      totalCleared += toClear.size;
      for (const i of toClear){ this.grid[i] = null; }

      // Gravity per column
      for (let x=0;x<N;x++){
        let write = N-1;
        for (let y=N-1;y>=0;y--){
          const i = this.index(x,y);
          const id = this.grid[i];
          if (id!=null){
            if (write!==y){
              this.grid[this.index(x,write)] = id;
              this.grid[i] = null;
            }
            write--;
          }
        }
        // spawn on top
        for (let y=write;y>=0;y--){
          this.grid[this.index(x,y)] = this.randomColorId();
        }
      }

      matches = this.findMatches();
      iterations++;
    }

    return { scoreByType, scoreByColor, totalCleared };
  }

  // New: Plan animated steps for a swap without mutating the live grid until committed
  planSwap(ax,ay,bx,by){
    if (!this.inBounds(ax,ay) || !this.inBounds(bx,by)) return {valid:false, actions:[{type:'swapInvalid'}]};
    const dx = Math.abs(ax-bx), dy = Math.abs(ay-by);
    if ((dx+dy)!==1) return {valid:false, actions:[{type:'swapInvalid'}]};

    const N = this.size;
    const idx = (x,y)=> y*N + x;

    // Work on a copy
    const work = this.grid.slice();
    const swapIds = { a: work[idx(ax,ay)], b: work[idx(bx,by)] };

    const actions = [{ type:'swap', a:{x:ax,y:ay,id:swapIds.a}, b:{x:bx,y:by,id:swapIds.b} }];

    // Perform swap in the working grid
    [work[idx(ax,ay)], work[idx(bx,by)]] = [work[idx(bx,by)], work[idx(ax,ay)]];

    let matches = this.findMatchesOnGrid(work);
    if (matches.length===0){
      actions.push({ type:'swapBack' });
      return { valid:false, actions };
    }

    const scoreByType = { light:0, dark:0, neutral:0 };
    let iterations = 0;

    while(matches.length>0 && iterations<20){
      // Clear step
      const toClear = new Set();
      const clearedList = [];
      for (const m of matches){
        const {dir, x, y, len, id} = m;
        const type = this.getTypeById(id);
        scoreByType[type] = (scoreByType[type]||0) + Math.min(5, Math.max(3, len));
        for (let k=0;k<len;k++){
          const cx = dir==='h'? x+k : x;
          const cy = dir==='v'? y+k : y;
          const i = idx(cx,cy);
          if (!toClear.has(i)) {
            toClear.add(i);
            clearedList.push({x:cx,y:cy,id:work[i]});
          }
        }
      }
      actions.push({ type:'clear', cells: clearedList });
      for (const i of toClear){ work[i] = null; }

      // Gravity moves per column
      const fallMoves = [];
      const spawns = [];
      for (let x=0;x<N;x++){
        let write = N-1;
        for (let y=N-1;y>=0;y--){
          const i = idx(x,y);
          const id = work[i];
          if (id!=null){
            if (write!==y){
              work[idx(x,write)] = id;
              work[i] = null;
              fallMoves.push({x, fromY:y, toY:write, id});
            }
            write--;
          }
        }
        // spawn on top
        for (let y=write;y>=0;y--){
          const id = this.randomColorId();
          work[idx(x,y)] = id;
          // spawn from y = -(write-y+1)
          const fromY = y - (write+1);
          spawns.push({x, fromY, toY:y, id});
        }
      }
      if (fallMoves.length>0) actions.push({ type:'fall', moves: fallMoves });
      if (spawns.length>0) actions.push({ type:'spawn', spawns });

      matches = this.findMatchesOnGrid(work);
      iterations++;
    }

    // Commit grid state at the end by returning it
    return { valid:true, actions, scoreByType, finalGrid: work };
  }

  findMatchesOnGrid(grid){
    const N = this.size; const matches = [];
    // Horizontal
    for (let y=0;y<N;y++){
      let x=0;
      while(x<N){
        const id = grid[y*N + x];
        let len=1;
        while(x+len<N && grid[y*N + (x+len)]===id) len++;
        if (id!=null && len>=3) matches.push({dir:'h', x, y, len, id});
        x += len || 1;
      }
    }
    // Vertical
    for (let x=0;x<N;x++){
      let y=0;
      while(y<N){
        const id = grid[y*N + x];
        let len=1;
        while(y+len<N && grid[(y+len)*N + x]===id) len++;
        if (id!=null && len>=3) matches.push({dir:'v', x, y, len, id});
        y += len || 1;
      }
    }
    return matches;
  }
}
