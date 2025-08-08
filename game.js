/* Mini FPS (raycaster) with inline image textures (SVG data-URIs).
   - Save as game.js in same folder as index.html
   - Uses pointer lock, WASD, mouse look, left-click to shoot
   - No external assets; textures are generated as SVG data URIs
*/

(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  let W = canvas.width = innerWidth;
  let H = canvas.height = innerHeight;

  window.addEventListener('resize', () => {
    W = canvas.width = innerWidth;
    H = canvas.height = innerHeight;
  });

  // ---------------------------
  // Embedded SVG texture helpers
  // ---------------------------
  function svgDataURI(svg) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // simple brick texture SVG
  const texBrick = svgDataURI(`
    <svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
      <rect width='100%' height='100%' fill='#8b3a3a'/>
      <g stroke='#6f2d2d' stroke-width='6'>
        <!-- horizontal mortar -->
        <path d='M0 64 H256 M0 128 H256 M0 192 H256'/>
        <!-- staggered vertical -->
        <path d='M0 0 V64 M48 64 V128 M96 0 V64 M144 64 V128 M192 0 V64 M240 64 V128'/>
      </g>
    </svg>`);

  // wood texture
  const texWood = svgDataURI(`
    <svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
      <rect width='100%' height='100%' fill='#8b5a2b'/>
      <g stroke='#6a4323' stroke-width='3'>
        <path d='M0 40 Q60 60 120 40 T240 40' stroke-opacity='0.6' fill='none'/>
        <path d='M0 120 Q60 140 120 120 T240 120' stroke-opacity='0.6' fill='none'/>
        <path d='M0 200 Q40 180 80 200 T240 200' stroke-opacity='0.6' fill='none'/>
      </g>
    </svg>`);

  // sky texture
  const texSky = svgDataURI(`
    <svg xmlns='http://www.w3.org/2000/svg' width='512' height='256'>
      <defs>
        <linearGradient id='g' x1='0' x2='0' y1='0' y2='1'>
          <stop offset='0' stop-color='#88c' />
          <stop offset='1' stop-color='#4a7' />
        </linearGradient>
      </defs>
      <rect width='100%' height='100%' fill='url(#g)'/>
      <g fill='white' opacity='0.9'>
        <circle cx='420' cy='55' r='12'/>
        <circle cx='340' cy='80' r='6' opacity='0.5'/>
        <circle cx='460' cy='95' r='9' opacity='0.6'/>
      </g>
    </svg>`);

  // floor texture
  const texFloor = svgDataURI(`
    <svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'>
      <rect width='100%' height='100%' fill='#444'/>
      <g stroke='#2f2f2f' stroke-width='2'>
        <path d='M0 16 H128 M0 32 H128 M0 48 H128 M0 64 H128 M0 80 H128 M0 96 H128 M0 112 H128'/>
      </g>
    </svg>`);

  // create Image objects
  const images = {};
  function loadImages(callback) {
    const keys = {brick:texBrick, wood:texWood, sky:texSky, floor:texFloor};
    const names = Object.keys(keys);
    let loaded = 0;
    names.forEach(n => {
      const img = new Image();
      img.src = keys[n];
      img.onload = () => { images[n]=img; loaded++; if(loaded===names.length) callback(); };
      img.onerror = () => { console.error('texture failed', n); loaded++; if(loaded===names.length) callback(); };
    });
  }

  // ---------------------------
  // Simple map (grid)
  // 0 = empty, 1 = brick wall, 2 = wood wall
  // ---------------------------
  const MAP = {
    grid: [
      [1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,2,0,0,0,1],
      [1,0,0,1,0,0,0,1,0,1],
      [1,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,2,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,1],
      [1,0,1,0,0,0,1,0,0,1],
      [1,0,0,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1,1,1],
    ],
    cell: 64,
    w: 10,
    h: 10
  };

  // ---------------------------
  // Player state
  // ---------------------------
  const player = {
    x: 3.5 * MAP.cell,
    y: 3.5 * MAP.cell,
    dir: 0, // radians, 0 = to right
    fov: Math.PI/3, // 60deg
    speed: 160, // units/sec
    height: 24,
    hp: 100,
  };

  // simple enemies
  const enemies = [
    {x: 6.5*MAP.cell, y: 2.7*MAP.cell, hp: 30, alive:true, size:16},
    {x: 4.2*MAP.cell, y: 5.5*MAP.cell, hp: 30, alive:true, size:16},
  ];

  // gameplay
  let keys = {};
  let pointerLocked = false;
  let kills = 0;
  let ammo = 20;
  let reloading = false;

  // pointerlock
  const pointerBtn = document.getElementById('pointerBtn');
  pointerBtn.onclick = () => { canvas.requestPointerLock(); };
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = (document.pointerLockElement === canvas);
    pointerBtn.style.display = pointerLocked ? 'none' : '';
  });

  // mouse look
  document.addEventListener('mousemove', e => {
    if(!pointerLocked) return;
    player.dir += e.movementX * 0.002;
    // clamp vertical look is not implemented (2.5D)
  });

  // keyboard
  document.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if(e.key.toLowerCase() === 'r') reload();
  });
  document.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });

  // shooting
  canvas.addEventListener('mousedown', e => {
    if(e.button === 0) shoot();
  });

  function reload() {
    if(reloading) return;
    reloading = true;
    setTimeout(()=>{ ammo = 20; reloading=false; updateUI(); }, 900);
  }

  function shoot() {
    if(ammo<=0 || reloading) return;
    ammo--; updateUI();
    // shoot a ray forward slightly jittered
    const dir = player.dir;
    const sx = player.x, sy = player.y;
    // check enemy hits first (distance along direction)
    let hit = null;
    for(const en of enemies){
      if(!en.alive) continue;
      const vx = en.x - sx, vy = en.y - sy;
      const proj = vx*Math.cos(dir) + vy*Math.sin(dir); // forward distance
      if(proj <= 0) continue;
      const perp = Math.abs(-vx*Math.sin(dir) + vy*Math.cos(dir)); // perpendicular distance
      if(perp < en.size*1.2 && proj < 800){ // hit
        if(!hit || proj < hit.dist) hit = {enemy:en, dist:proj};
      }
    }
    if(hit) {
      hit.enemy.hp -= 18;
      if(hit.enemy.hp <= 0){ hit.enemy.alive=false; kills++; document.getElementById('kills').innerText = kills; }
    } else {
      // else maybe hit wall (we don't spawn bullets)
    }
  }

  // UI
  function updateUI(){
    const w = Math.max(0, Math.min(100, player.hp));
    document.getElementById('hpFill').style.width = (w)+'%';
    document.getElementById('ammo').innerText = ammo;
    document.getElementById('kills').innerText = kills;
  }

  // collision
  function canMove(x,y) {
    const cx = Math.floor(x / MAP.cell);
    const cy = Math.floor(y / MAP.cell);
    if(cx<0||cy<0||cx>=MAP.w||cy>=MAP.h) return false;
    return MAP.grid[cy][cx] === 0;
  }

  // simple raycasting renderer
  function renderScene() {
    ctx.clearRect(0,0,W,H);

    // sky
    const skyImg = images.sky;
    if(skyImg) {
      // pan sky based on dir
      const sx = Math.floor(((player.dir % (Math.PI*2)) / (Math.PI*2)) * skyImg.width);
      // draw twice for wrap
      ctx.drawImage(skyImg, sx, 0, skyImg.width - sx, skyImg.height, 0, 0, W*(skyImg.width - sx)/skyImg.width, H/2);
      ctx.drawImage(skyImg, 0, 0, sx, skyImg.height, W*(skyImg.width - sx)/skyImg.width, 0, W*sx/skyImg.width, H/2);
    } else {
      ctx.fillStyle = '#66a'; ctx.fillRect(0,0,W,H/2);
    }

    // floor (flat color + texture)
    ctx.fillStyle = '#333';
    ctx.fillRect(0,H/2,W,H/2);

    // vertical slice raycasting
    const numRays = Math.min(W, 400); // cap resolution
    const step = W / numRays;
    const rayAngleStep = player.fov / numRays;
    let rayAngle = player.dir - player.fov/2;

    for(let i=0;i<numRays;i++, rayAngle += rayAngleStep) {
      // cast
      const cos = Math.cos(rayAngle), sin = Math.sin(rayAngle);
      let dist = 0;
      let hit = false, hitType = 0, hitX=0, hitY=0;
      while(!hit && dist < 1000) {
        dist += 4;
        const rx = player.x + cos * dist;
        const ry = player.y + sin * dist;
        const gx = Math.floor(rx / MAP.cell);
        const gy = Math.floor(ry / MAP.cell);
        if(gx<0||gy<0||gx>=MAP.w||gy>=MAP.h){ hit=true; hitType=1; break; }
        const cell = MAP.grid[gy][gx];
        if(cell !== 0) { hit=true; hitType=cell; hitX = rx; hitY = ry; break; }
      }
      if(!hit) continue;

      // fish-eye correction
      const correctedDist = dist * Math.cos(rayAngle - player.dir);
      // projection
      const wallHeight = (MAP.cell * 320) / Math.max(1, correctedDist);
      const x = Math.floor(i*step);
      const y1 = Math.floor(H/2 - wallHeight/2);
      const y2 = Math.floor(H/2 + wallHeight/2);

      // choose texture
      let tex = images.brick;
      if(hitType === 2) tex = images.wood;

      // shading based on distance
      const shade = Math.max(0.25, 1 - correctedDist/900);

      if(tex) {
        // texture mapping: compute texture x coordinate from hit position
        const tx = ((hitX % MAP.cell) / MAP.cell) * tex.width;
        // draw stripe
        // drawImage with narrow source slice
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y1, Math.ceil(step)+1, y2-y1);
        ctx.clip();
        // scale the texture to the wall slice
        ctx.drawImage(tex, tx, 0, 1, tex.height, x, y1, Math.ceil(step)+1, y2-y1);
        ctx.restore();

        // apply distance shading
        ctx.fillStyle = `rgba(0,0,0,${1 - shade})`;
        ctx.fillRect(x, y1, Math.ceil(step)+1, y2-y1);
      } else {
        ctx.fillStyle = `rgba(200,100,100,${shade})`;
        ctx.fillRect(x,y1,Math.ceil(step)+1, y2-y1);
      }

      // simple floor texture projection per-column (cheap)
      if(images.floor) {
        const floorImg = images.floor;
        const floorYStart = y2;
        for(let fy=floorYStart; fy < H; fy+=4) {
          const perspective = (H / (2*(fy - H/2))) || 1;
          const sampleX = (player.x + cos * correctedDist * perspective) % floorImg.width;
          // draw pixel as tiny rect - cheap approximation
          ctx.fillStyle = '#222';
          ctx.fillRect(x, fy, Math.ceil(step)+1, 4);
        }
      }
    }

    // draw simple enemies as sprites (billboard)
    for(const en of enemies){
      if(!en.alive) continue;
      const dx = en.x - player.x, dy = en.y - player.y;
      const dist = Math.sqrt(dx*dx+dy*dy);
      const angTo = Math.atan2(dy,dx) - player.dir;
      // normalize
      let ang = angTo;
      while(ang < -Math.PI) ang += Math.PI*2;
      while(ang > Math.PI) ang -= Math.PI*2;
      const halfFOV = player.fov/2;
      if(Math.abs(ang) < halfFOV + 0.2 && dist < 900) {
        const screenX = (0.5 + (ang/ player.fov)) * W;
        const sizeOnScreen = (MAP.cell * 240) / Math.max(10, dist);
        const sy = H/2 - sizeOnScreen/2;
        // draw a simple circle enemy
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = 'rgba(180,50,50,0.95)';
        ctx.arc(screenX, sy + sizeOnScreen*0.45, Math.max(6, sizeOnScreen*0.25), 0, Math.PI*2);
        ctx.fill();
        // body
        ctx.fillStyle = 'rgba(200,80,80,0.95)';
        ctx.fillRect(screenX - sizeOnScreen*0.25, sy + sizeOnScreen*0.2, sizeOnScreen*0.5, sizeOnScreen*0.6);
        ctx.restore();
      }
    }

    // crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W/2 - 10, H/2);
    ctx.lineTo(W/2 + 10, H/2);
    ctx.moveTo(W/2, H/2 - 10);
    ctx.lineTo(W/2, H/2 + 10);
    ctx.stroke();
  }

  // main loop
  let last = performance.now();
  function loop(t) {
    const dt = Math.min(0.05, (t - last)/1000);
    last = t;
    update(dt);
    renderScene();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    // movement
    let mvx = 0, mvy = 0;
    if(keys['w']) { mvx += Math.cos(player.dir); mvy += Math.sin(player.dir); }
    if(keys['s']) { mvx -= Math.cos(player.dir); mvy -= Math.sin(player.dir); }
    if(keys['a']) { mvx += Math.cos(player.dir - Math.PI/2); mvy += Math.sin(player.dir - Math.PI/2); }
    if(keys['d']) { mvx += Math.cos(player.dir + Math.PI/2); mvy += Math.sin(player.dir + Math.PI/2); }
    // normalize
    const mag = Math.hypot(mvx, mvy);
    if(mag>0) { mvx /= mag; mvy /= mag; }
    const nx = player.x + mvx * player.speed * dt;
    const ny = player.y + mvy * player.speed * dt;
    // simple collision radius
    const r = 12;
    if(canMove(nx - r, player.y - r) && canMove(nx + r, player.y + r)) player.x = nx;
    if(canMove(player.x - r, ny - r) && canMove(player.x + r, ny + r)) player.y = ny;

    // enemies simple AI: walk toward player if within range
    for(const en of enemies){
      if(!en.alive) continue;
      const dx = player.x - en.x, dy = player.y - en.y;
      const d = Math.hypot(dx,dy);
      if(d < 200) {
        const vx = (dx/d) * 40 * dt;
        const vy = (dy/d) * 40 * dt;
        if(canMove(en.x + vx, en.y + vy)) { en.x += vx; en.y += vy; }
        // enemy attack
        if(d < 28) { player.hp -= 18 * dt; if(player.hp < 0) player.hp = 0; updateUI(); }
      }
    }

    updateUI();
  }

  // initial load
  loadImages(()=> {
    updateUI();
    requestAnimationFrame(loop);
  });

  // friendly tip if pointerlock fails (for some browsers)
  window.addEventListener('click', () => {
    if(!pointerLocked) {
      // hint
    }
  });

})();
