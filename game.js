//game.js - Optionally loads an external level object (e.g. level1)
//expected: level object has {width, height, tiles, playerStart, zombies}

(()=>{
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const infoEl = document.getElementById('info');
  const toggleTestBtn = document.getElementById('toggleTest');

  //Constants
  const TILE = 48;
  const VERTICAL_FOCUS = 0.75;

  //Variables are initialized at level load
  let MAP_W = 160;
  let MAP_H = 12;
  let map = [];
  let player = {x: 2*TILE, y: (MAP_H-3)*TILE, w:34, h:46, vx:0, vy:0, onGround:false};
  let zombies = [];
  const camera = {x:0,y:0};

  //Physics/Control
  const GRAV = 1400;
  const MOVE_SPEED = 220;
  const JUMP_SPEED = 520;
  const input = {left:false,right:false,jump:false};
  let testMode = true;
  
  // Game loop timing (declare them early so that start() can use them)
  let last = 0;
  let fpsCounter = { t: 0, frames: 0, fps: 0, lastT: 0 };


  //UI elements for touch
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  const jumpBtn = document.getElementById('jumpBtn');

  function findLevelObject(){
      //1) If a name is set in window.currentLevelName (e.g. 'level1'), try window[name]
      if(window.currentLevelName && window[window.currentLevelName]) return window[window.currentLevelName];

      //2) Try window.level1/window.level
      if(window.level1) return window.level1;
      if(window.level) return window.level;

      //3) Fallback: check if a variable level1 exists (not as a window property) (use typeof for certain)
      if(typeof level1 !== 'undefined') return level1;
      if(typeof level !== 'undefined') return level;

      //Nothing found
      return null;
  }

  function applyLevel(levelObj){
    //Set MAP-W/H
    MAP_W = levelObj.width || (levelObj.tiles[0] ? levelObj.tiles[0].length : 160);
    MAP_H = levelObj.height || levelObj.tiles.length;

    //Create map and copy tiles (if tiles are smaller, we fill them with 0)
    map = new Array(MAP_H).fill(0).map(()=>new Array(MAP_W).fill(0));
    for(let y=0;y<MAP_H;y++){
      for(let x=0;x<MAP_W;x++){
        if(levelObj.tiles[y] && levelObj.tiles[y][x] !== undefined) map[y][x] = levelObj.tiles[y][x];
        else map[y][x] = 0;
      }
    }

    //Player start (if available, tile coordinates -> pixels)
    const ps = levelObj.playerStart || {x:2, y: MAP_H-3};
    player.x = (ps.x || 2) * TILE;
    player.y = (ps.y || (MAP_H-3)) * TILE;
    player.w = player.w || 34; player.h = player.h || 46;
    player.vx = 0; player.vy = 0; player.onGround = false;

    // Zombies (convert tile -> px)
    zombies = [];
    if(Array.isArray(levelObj.zombies)){
      for(const z of levelObj.zombies){
        zombies.push({
          x: (z.x || 0) * TILE,
          y: (z.y || (MAP_H-2)) * TILE,
          w: 36,
          h: 42
        });
      }
    }
  }

  //Initial level loading (synchronous — level object must be defined by <script src="level1.js">)
  const external = findLevelObject();

  if (external) {
    applyLevel(external);
    console.log('External level loaded.');
    //Start safely now
    start();
  } else {
    const msg = 'No external level found. Please create an external level file (e.g. level1.js).';
    console.error(msg);

    //Optional: Show overlay or disable buttons.
    //If you want to block the UI, you can return here so that the rest is not executed.
    //We end the IIFE early so that nothing else happens.
    return;
  }

  //--- Resizing/Camera ---
  function resize(){
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);

    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;

    camera.x = player.x + player.w/2 - cw/2;
    camera.x = Math.max(0, Math.min(camera.x, MAP_W*TILE - cw));

    let desiredY = (player.y + player.h) - (ch * VERTICAL_FOCUS);
    const maxCamY = Math.max(0, MAP_H * TILE - ch);
    camera.y = Math.max(0, Math.min(desiredY, maxCamY));
  }
  window.addEventListener('resize', resize);
  //Slight delay for OrientationChange (helps mobile browsers)
  window.addEventListener('orientationchange', ()=> setTimeout(resize, 120));

  //--- Input Bindings ---
  function bindTouch(btn, key){
    if(!btn) return;
    const start = (e)=>{ e.preventDefault(); input[key]=true; };
    const end = (e)=>{ e.preventDefault(); input[key]=false; };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('pointerleave', end);
  }
  bindTouch(leftBtn,'left'); bindTouch(rightBtn,'right'); bindTouch(jumpBtn,'jump');

  window.addEventListener('keydown', (e)=>{
    if(e.key === 'ArrowLeft' || e.key==='a' || e.key==='A') input.left=true;
    if(e.key === 'ArrowRight' || e.key==='d' || e.key==='D') input.right=true;
    if(e.key === ' ' || e.key==='Spacebar') input.jump=true;
  });
  window.addEventListener('keyup', (e)=>{
    if(e.key === 'ArrowLeft' || e.key==='a' || e.key==='A') input.left=false;
    if(e.key === 'ArrowRight' || e.key==='d' || e.key==='D') input.right=false;
    if(e.key === ' ' || e.key==='Spacebar') input.jump=false;
  });

  //--- Collision avoidance systems ---
  function rectTileCollision(rx,ry,rw,rh){
    const left = Math.floor(rx / TILE), right = Math.floor((rx+rw-1)/TILE);
    const top = Math.floor(ry / TILE), bottom = Math.floor((ry+rh-1)/TILE);
    const hits = [];
    for(let ty=top;ty<=bottom;ty++){
      for(let tx=left;tx<=right;tx++){
        if(tx<0||tx>=MAP_W||ty<0||ty>=MAP_H) continue;
        const t = map[ty][tx];
        if(t !== 0) hits.push({tx,ty,t});
      }
    }
    return hits;
  }

  //--- Game Loop & Draw ---
  function update(dt){
    if(!testMode) return;

    let ax = 0;
    if(input.left) ax -= 1;
    if(input.right) ax += 1;
    player.vx = ax * MOVE_SPEED;

    if(input.jump && player.onGround){ player.vy = -JUMP_SPEED; player.onGround=false; }

    player.vy += GRAV * dt;

    //X
    let nx = player.x + player.vx * dt;
    let ny = player.y;
    const hitsX = rectTileCollision(nx, ny, player.w, player.h);
    if(hitsX.length){
      if(player.vx > 0){
        const minTx = Math.min(...hitsX.map(h=>h.tx));
        nx = minTx * TILE - player.w - 0.01;
        player.vx = 0;
      } else if(player.vx < 0){
        const maxTx = Math.max(...hitsX.map(h=>h.tx));
        nx = (maxTx+1) * TILE + 0.01;
        player.vx = 0;
      }
    }

    //Y
    ny = player.y + player.vy * dt;
    const hitsY = rectTileCollision(nx, ny, player.w, player.h);
    player.onGround = false;
    if(hitsY.length){
      if(player.vy > 0){
        const minTy = Math.min(...hitsY.map(h=>h.ty));
        ny = minTy * TILE - player.h - 0.01;
        player.vy = 0;
        player.onGround = true;
      } else if(player.vy < 0){
        const maxTy = Math.max(...hitsY.map(h=>h.ty));
        ny = (maxTy+1) * TILE + 0.01;
        player.vy = 0;
      }
    }

    player.x = nx; player.y = ny;

    //Camera
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    camera.x = player.x + player.w/2 - cw/2;
    camera.x = Math.max(0, Math.min(camera.x, MAP_W*TILE - cw));

    let desiredY = (player.y + player.h) - (ch * VERTICAL_FOCUS);
    const maxCamY = Math.max(0, MAP_H * TILE - ch);
    camera.y = Math.max(0, Math.min(desiredY, maxCamY));
  }

  function draw(){
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    ctx.clearRect(0,0,cw,ch);

    //Background (slight parallax)
    ctx.save();
    ctx.fillStyle = '#6b9bd6';
    ctx.fillRect(0,0,cw,ch*0.55);
    ctx.fillRect(0,ch*0.55,cw,ch*0.45);
    ctx.restore();

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    const leftTile = Math.floor(camera.x / TILE);
    const rightTile = Math.ceil((camera.x + cw) / TILE);
    for(let ty=0; ty<MAP_H; ty++){
      for(let tx=Math.max(0,leftTile-1); tx<Math.min(MAP_W,rightTile+1); tx++){
        const t = map[ty][tx];
        const px = tx * TILE, py = ty * TILE;
        if(t===0) continue;
        if(t===1){
          ctx.fillStyle = '#3b8b3b';
          ctx.fillRect(px,py, TILE, TILE/3);
          ctx.fillStyle = '#7a4f2b';
          ctx.fillRect(px,py+TILE/3, TILE, TILE*2/3);
          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          ctx.fillRect(px+4,py+TILE/3+6, TILE-8, 2);
        } else if(t===2){
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(px,py+TILE*0.5, TILE, TILE*0.2);
          ctx.fillStyle = '#6b4a2a';
          ctx.fillRect(px+4,py+TILE*0.5+4, TILE-8, 4);
        } else if(t===3){
          ctx.fillStyle = '#666';
          ctx.fillRect(px,py, TILE, TILE);
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(px+6,py+6, TILE-12, TILE-12);
        }
      }
    }

    //Zombies
    for(const z of zombies){
      ctx.fillStyle = '#2f6e2f';
      ctx.fillRect(z.x, z.y - z.h + TILE, z.w, z.h);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(z.x+6, z.y - z.h + TILE + 8, 8, 8);
    }

    //Player
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(0,0,player.w,player.h);
    ctx.fillStyle = '#111';
    ctx.fillRect(6,10,6,6);
    ctx.fillRect(player.w-12,10,6,6);
    ctx.restore();

    //Map-limit
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(MAP_W*TILE-2,0,2,MAP_H*TILE);

    ctx.restore();
  }

  function loop(now){
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();

    //Fps simple
    fpsCounter.frames++;
    fpsCounter.t += (now - (fpsCounter.lastT || now));
    fpsCounter.lastT = now;
    if(performance.now() - fpsCounter.t > 500){
      fpsCounter.fps = Math.round((fpsCounter.frames / ((performance.now() - fpsCounter.t)/1000)) || 0);
      fpsCounter.frames = 0; fpsCounter.t = performance.now();
    }

    requestAnimationFrame(loop);
  }

  function start(){
    resize();
    last = performance.now();
    requestAnimationFrame(loop);
  }

  document.addEventListener('touchmove', function(e){ if(e.target === canvas) e.preventDefault(); }, {passive:false});

  //Debug
  window.__ZTM = {player,map,camera,TILE,MOVE_SPEED,JUMP_SPEED,zombies,MAP_W,MAP_H};
})();