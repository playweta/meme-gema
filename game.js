const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  level: document.getElementById("level"),
  score: document.getElementById("score"),
  shield: document.getElementById("shield"),
  power: document.getElementById("power"),
  overlay: document.getElementById("overlay"),
  start: document.getElementById("start"),
  pause: document.getElementById("pause"),
  sound: document.getElementById("sound"),
  story: document.querySelector(".story"),
  lifeFill: document.getElementById("lifeFill"),
};

const sprites = {
  playerShip: new Image(),
  pepe: new Image(),
  cat: new Image(),
  penguin: new Image(),
  duck: new Image(),
  musk: new Image(),
  mouse: new Image(),
  troll: new Image(),
  boss: new Image(),
};
sprites.playerShip.src = "assets/player-ship.png";
sprites.pepe.src = "assets/pepe-cutout.png";
sprites.cat.src = "assets/cat-cutout.png";
sprites.penguin.src = "assets/penguin-cutout.png";
sprites.duck.src = "assets/duck-cutout.png";
sprites.musk.src = "assets/musk-rocket-cutout.png";
sprites.mouse.src = "assets/mouse-cutout.png";
sprites.troll.src = "assets/troll-cutout.png";
sprites.boss.src = "assets/boss-pump01.png";

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const touch = { up: false, down: false, left: false, right: false, fire: false };
const pointer = { active: false, x: 116, y: H / 2 };

let state;
let lastTime = 0;
let shake = 0;
const music = {
  ctx: null,
  filter: null,
  master: null,
  timer: null,
  step: 0,
  muted: false,
  starting: false,
  tempoMs: 106,
};

const missions = [
  { name: "Dog Planet Ashes", quota: 16, spawn: 0.94, speed: 126 },
  { name: "Fake Meme Orbit", quota: 24, spawn: 0.72, speed: 158 },
  { name: "Pump Planet Core", quota: 34, spawn: 0.56, speed: 188 },
];

const minionStats = {
  pepe: { role: "gunner", hp: 9, speed: 0.9, radius: 28, score: 210 },
  cat: { role: "gunner", hp: 9, speed: 1.02, radius: 26, score: 190 },
  penguin: { role: "basic", hp: 12, speed: 0.78, radius: 29, score: 180 },
  duck: { role: "speeder", hp: 3, speed: 1.36, radius: 22, score: 150 },
  musk: { role: "brute", hp: 21, speed: 0.62, radius: 38, score: 380 },
  mouse: { role: "speeder", hp: 3, speed: 1.52, radius: 20, score: 160 },
  troll: { role: "gunner", hp: 12, speed: 0.96, radius: 28, score: 230 },
};

function resetGame() {
  state = {
    mode: "playing",
    level: 1,
    score: 0,
    message: "THE LAST SHIBA AWAKENS",
    messageTimer: 2.2,
    player: {
      x: 116,
      y: H / 2,
      r: 24,
      shield: 100,
      maxShield: 100,
      power: 1,
      maxPower: 5,
      cooldown: 0,
      invuln: 0,
    },
    bullets: [],
    enemyBullets: [],
    enemies: [],
    pickups: [],
    particles: [],
    stars: makeStars(),
    spawned: 0,
    defeated: 0,
    spawnTimer: 0.3,
    dropCooldown: 0,
    boss: null,
  };
  updateHud();
}

function makeStars() {
  return Array.from({ length: 130 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    z: Math.random() * 1.8 + 0.2,
    twinkle: Math.random() * Math.PI * 2,
  }));
}

function startGame() {
  resetGame();
  pointer.active = false;
  pointer.x = state.player.x;
  pointer.y = state.player.y;
  ui.overlay.classList.add("hidden");
  updatePauseButton();
  startMusic();
  lastTime = performance.now();
}

function endGame(title, text) {
  state.mode = title === "Mission Clear" ? "won" : "lost";
  ui.overlay.querySelector("h1").textContent = title;
  ui.overlay.querySelector("p").textContent = text;
  ui.story.classList.add("hidden");
  ui.start.textContent = "Restart";
  ui.overlay.classList.remove("hidden");
  updatePauseButton();
  stopMusic();
}

function updatePauseButton() {
  const paused = state?.mode === "paused";
  ui.pause.textContent = paused ? ">" : "II";
  ui.pause.setAttribute("aria-label", paused ? "Resume game" : "Pause game");
  ui.pause.setAttribute("aria-pressed", paused ? "true" : "false");
}

function togglePause() {
  if (!state || state.mode === "idle" || state.mode === "won" || state.mode === "lost") return;
  state.mode = state.mode === "paused" ? "playing" : "paused";
  updatePauseButton();
  if (state.mode === "paused") {
    stopMusic();
  } else {
    startMusic();
  }
  lastTime = performance.now();
}

function ensureMusic() {
  if (music.ctx) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  music.ctx = new AudioCtor();
  const master = music.ctx.createGain();
  const filter = music.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 4200;
  filter.Q.value = 0.8;
  master.gain.value = 0.18;
  filter.connect(master);
  master.connect(music.ctx.destination);
  music.filter = filter;
  music.master = master;
}

function playTone(freq, time, duration, type, gainValue, detune = 0) {
  if (!music.ctx || !music.filter || music.muted) return;
  const osc = music.ctx.createOscillator();
  const gain = music.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  osc.detune.setValueAtTime(detune, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(gainValue, time + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(gain);
  gain.connect(music.filter);
  osc.start(time);
  osc.stop(time + duration + 0.03);
}

function playSfxTone(freq, time, duration, type, gainValue, endFreq = freq) {
  if (!music.ctx || !music.master || music.muted) return;
  const osc = music.ctx.createOscillator();
  const gain = music.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  osc.frequency.exponentialRampToValueAtTime(Math.max(24, endFreq), time + duration);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(gainValue, time + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(gain);
  gain.connect(music.master);
  osc.start(time);
  osc.stop(time + duration + 0.03);
}

function playNoiseBurst(time, duration, gainValue) {
  if (!music.ctx || !music.master || music.muted) return;
  const length = Math.max(1, Math.floor(music.ctx.sampleRate * duration));
  const buffer = music.ctx.createBuffer(1, length, music.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const source = music.ctx.createBufferSource();
  const filter = music.ctx.createBiquadFilter();
  const gain = music.ctx.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(620, time);
  filter.frequency.exponentialRampToValueAtTime(140, time + duration);
  filter.Q.value = 0.9;
  gain.gain.setValueAtTime(gainValue, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(music.master);
  source.start(time);
  source.stop(time + duration);
}

function playHiHat(time, gainValue = 0.028) {
  if (!music.ctx || !music.master || music.muted) return;
  const duration = 0.035;
  const length = Math.max(1, Math.floor(music.ctx.sampleRate * duration));
  const buffer = music.ctx.createBuffer(1, length, music.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const source = music.ctx.createBufferSource();
  const filter = music.ctx.createBiquadFilter();
  const gain = music.ctx.createGain();
  source.buffer = buffer;
  filter.type = "highpass";
  filter.frequency.value = 5200;
  gain.gain.setValueAtTime(gainValue, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(music.master);
  source.start(time);
  source.stop(time + duration);
}

function playKillSound(type) {
  if (music.muted) return;
  ensureMusic();
  if (!music.ctx) return;
  music.ctx.resume();
  const now = music.ctx.currentTime + 0.01;
  if (type === "boss") {
    playSfxTone(180, now, 0.34, "sawtooth", 0.13, 42);
    playSfxTone(96, now + 0.08, 0.42, "square", 0.12, 30);
    playNoiseBurst(now, 0.46, 0.12);
    return;
  }
  if (type === "brute") {
    playSfxTone(150, now, 0.26, "sawtooth", 0.11, 38);
    playNoiseBurst(now, 0.28, 0.1);
    return;
  }
  if (type === "speeder") {
    playSfxTone(820, now, 0.12, "triangle", 0.08, 260);
    playSfxTone(1220, now + 0.035, 0.08, "square", 0.045, 520);
    return;
  }
  if (type === "gunner") {
    playSfxTone(360, now, 0.16, "square", 0.09, 80);
    playNoiseBurst(now, 0.16, 0.055);
    return;
  }
  playSfxTone(460, now, 0.12, "square", 0.075, 120);
  playNoiseBurst(now, 0.11, 0.045);
}

function tickMusic() {
  if (!music.ctx || music.muted || state?.mode !== "playing") return;
  const now = music.ctx.currentTime + 0.02;
  const bass = [82.41, 98, 123.47, 98, 73.42, 98, 146.83, 123.47];
  const lead = [659.25, 783.99, 987.77, 1174.66, 987.77, 783.99, 659.25, 0, 587.33, 739.99, 880, 987.77, 880, 739.99, 587.33, 0];
  const bassNote = bass[Math.floor(music.step / 2) % bass.length];
  const leadNote = lead[music.step % lead.length];
  if (music.step % 4 === 0) playSfxTone(118, now, 0.09, "sine", 0.12, 44);
  if (music.step % 2 === 0) playTone(bassNote, now + 0.01, 0.15, "square", 0.085, -6);
  if (leadNote) playTone(leadNote, now + 0.018, 0.095, "sawtooth", 0.038, 8);
  if (music.step % 4 === 2) playTone(1318.51, now, 0.05, "triangle", 0.03, -10);
  playHiHat(now, music.step % 4 === 0 ? 0.035 : 0.02);
  music.step = (music.step + 1) % 32;
}

function startMusic() {
  if (music.muted || music.starting) return;
  ensureMusic();
  if (!music.ctx) return;
  music.starting = true;
  music.ctx
    .resume()
    .then(() => {
      music.starting = false;
      if (music.muted || state?.mode !== "playing") return;
      if (!music.timer) {
        tickMusic();
        music.timer = window.setInterval(tickMusic, music.tempoMs);
      }
    })
    .catch(() => {
      music.starting = false;
    });
}

function stopMusic() {
  music.starting = false;
  if (music.timer) {
    window.clearInterval(music.timer);
    music.timer = null;
  }
}

function unlockAudio() {
  if (music.muted) return;
  ensureMusic();
  if (music.ctx?.state === "suspended") music.ctx.resume();
}

function updateSoundButton() {
  ui.sound.textContent = music.muted ? "OFF" : "SND";
  ui.sound.setAttribute("aria-label", music.muted ? "Music muted" : "Music on");
  ui.sound.setAttribute("aria-pressed", music.muted ? "true" : "false");
}

function toggleSound() {
  music.muted = !music.muted;
  if (music.muted) {
    stopMusic();
  } else if (state?.mode === "playing") {
    startMusic();
  }
  updateSoundButton();
}

function updateHud() {
  ui.level.textContent = String(state.level);
  ui.score.textContent = String(state.score);
  ui.shield.textContent = String(Math.max(0, Math.ceil(state.player.shield)));
  ui.power.textContent = `MK${state.player.power}`;
  const lifePct = clamp((state.player.shield / state.player.maxShield) * 100, 0, 100);
  if (ui.lifeFill) ui.lifeFill.style.width = `${lifePct}%`;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function bossRageHp(boss) {
  return boss.rageHp || boss.maxHp / 2;
}

function bossPhaseOneHp(boss) {
  return boss.phaseOneHp || boss.maxHp - bossRageHp(boss);
}

function collide(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const rr = (a.r || 12) + (b.r || 12);
  return dx * dx + dy * dy < rr * rr;
}

function difficultyScale() {
  const scorePressure = Math.min(0.4, state.score / 15000);
  const levelPressure = (state.level - 1) * 0.18;
  return {
    speed: 1 + levelPressure + scorePressure,
    fire: Math.max(0.52, 1 - levelPressure * 0.55 - scorePressure),
    hpBonus: state.level === 1 ? 0 : state.level - 1,
  };
}

function spawnEnemy() {
  const mission = missions[state.level - 1];
  const difficulty = difficultyScale();
  const pool = state.level === 1
    ? ["pepe", "cat", "duck", "mouse", "troll"]
    : state.level === 2
      ? ["pepe", "cat", "penguin", "duck", "mouse", "musk", "troll"]
      : ["pepe", "cat", "penguin", "duck", "mouse", "musk", "musk", "troll", "troll"];
  const type = pool[Math.floor(Math.random() * pool.length)];
  const stats = minionStats[type];
  const enemy = {
    type,
    role: stats.role,
    x: W + 72,
    y: rand(74, H - 74),
    r: stats.radius,
    hp: stats.hp + (stats.role === "speeder" ? 0 : difficulty.hpBonus),
    speed: mission.speed * stats.speed * difficulty.speed,
    wobble: rand(0, Math.PI * 2),
    fire: rand(0.92, 2.05) * difficulty.fire,
    scoreValue: stats.score,
  };
  state.enemies.push(enemy);
  state.spawned += 1;
}

function spawnBoss() {
  state.boss = {
    type: "boss",
    x: W + 120,
    y: H / 2,
    r: 58,
    hp: 550,
    maxHp: 550,
    phaseOneHp: 500,
    rageHp: 50,
    speed: 66,
    wobble: 0,
    fire: 0.42,
    phase: 1,
    scoreValue: 2200,
  };
  state.enemies.push(state.boss);
  state.message = "CORE CAPSULE INBOUND";
  state.messageTimer = 2.2;
}

function shootPlayer() {
  const p = state.player;
  if (p.cooldown > 0) return;
  const addShot = (yOffset, vy, damage = 1, heavy = false) => {
    state.bullets.push({
      x: p.x + 30,
      y: p.y + yOffset,
      vx: heavy ? 600 : 540,
      vy,
      r: heavy ? 7 : 5,
      damage,
      heavy,
      life: heavy ? 1.65 : 1.45,
    });
  };

  addShot(-8, -18);
  addShot(10, 18);
  if (p.power >= 2) addShot(1, 0);
  if (p.power >= 3) {
    addShot(-15, -76);
    addShot(17, 76);
  }
  if (p.power >= 4) addShot(1, 0, 2, true);
  if (p.power >= 5) {
    addShot(-26, -118, 2, true);
    addShot(28, 118, 2, true);
  }

  addParticles(p.x + 24, p.y, p.power >= 4 ? "#ffbb4d" : "#52ff9c", 4 + p.power, 90);
  p.cooldown = Math.max(0.085, 0.18 - p.power * 0.018);
}

function shootEnemy(e) {
  const angle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
  const difficulty = difficultyScale();
  const spread = e.type === "boss"
    ? e.phase === 2
      ? [-0.52, -0.28, 0, 0.28, 0.52]
      : [-0.34, -0.12, 0.12, 0.34]
    : e.role === "brute"
      ? [-0.16, 0.16]
      : [0];
  spread.forEach((offset) => {
    const rageSpeed = e.type === "boss" && e.phase === 2 ? 64 : 0;
    state.enemyBullets.push({
      x: e.x - e.r,
      y: e.y,
      vx: Math.cos(angle + offset) * (225 + state.level * 24 + difficulty.speed * 18 + rageSpeed),
      vy: Math.sin(angle + offset) * (225 + state.level * 24 + difficulty.speed * 18 + rageSpeed),
      r: e.role === "brute" ? 7 : 6,
      damage: e.type === "boss" ? (e.phase === 2 ? 18 : 15) : e.role === "brute" ? 16 : 12,
      life: 4,
    });
  });
}

function addParticles(x, y, color, count, speed = 120) {
  for (let i = 0; i < count; i += 1) {
    const a = rand(0, Math.PI * 2);
    const v = rand(speed * 0.2, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      r: rand(1.8, 5.5),
      color,
      life: rand(0.3, 0.8),
      max: 0.8,
    });
  }
}

function damagePlayer(amount) {
  const p = state.player;
  if (p.invuln > 0) return;
  p.shield -= amount;
  p.invuln = 0.68;
  shake = 14;
  addParticles(p.x, p.y, "#ff5d62", 18, 220);
  updateHud();
  if (p.shield <= 0) {
    endGame("Mame Fell", `Score ${state.score}. The fake hype capsules kept the meme universe asleep.`);
  }
}

function spawnPickup(enemy) {
  const p = state.player;
  if (enemy.type !== "boss" && (state.dropCooldown > 0 || p.power >= p.maxPower)) return;
  const dropChance = {
    pepe: 0.16,
    cat: 0.14,
    penguin: 0.12,
    duck: 0.08,
    mouse: 0.08,
    musk: 0.34,
    troll: 0.14,
    boss: 1,
  }[enemy.type] || 0.18;
  if (Math.random() > dropChance) return;
  if (enemy.type !== "boss") state.dropCooldown = 2.4;
  state.pickups.push({
    type: "upgrade",
    x: enemy.x,
    y: enemy.y,
    r: 15,
    vx: -86,
    wobble: rand(0, Math.PI * 2),
    life: 8,
  });
}

function collectPickup(pickup) {
  const p = state.player;
  pickup.life = 0;
  if (p.power < p.maxPower) {
    p.power += 1;
    p.maxShield += 14;
    p.shield = Math.min(p.maxShield, p.shield + 30);
    state.message = `MAME WING MK${p.power}`;
  } else {
    p.shield = Math.min(p.maxShield, p.shield + 24);
    state.score += 100;
    state.message = "CORE ABSORBED";
  }
  state.messageTimer = 1.7;
  addParticles(p.x, p.y, "#ffbb4d", 34, 230);
  addParticles(pickup.x, pickup.y, "#52ff9c", 18, 180);
  shake = 10;
  updateHud();
}

function maybeDropUpgrade(enemy) {
  if (enemy.dropped) return;
  enemy.dropped = true;
  spawnPickup(enemy);
}

function checkPickupCollection() {
  const p = state.player;
  state.pickups.forEach((pickup) => {
    if (pickup.life > 0 && collide(pickup, p)) {
      collectPickup(pickup);
    }
  });
}

function updatePickups(dt) {
  state.pickups.forEach((pickup) => {
    pickup.x += pickup.vx * dt;
    pickup.y += Math.sin(pickup.wobble) * 18 * dt;
    pickup.wobble += dt * 5;
    pickup.life -= dt;
  });
  state.pickups = state.pickups.filter((pickup) => pickup.life > 0 && pickup.x > -40);
}

function completeEnemy(e) {
  state.score += e.scoreValue || (e.type === "boss" ? 2200 : 130);
  state.defeated += e.type === "boss" ? 4 : 1;
  playKillSound(e.role || e.type);
  addParticles(e.x, e.y, e.type === "boss" ? "#ffbb4d" : "#52ff9c", e.type === "boss" ? 80 : 24, 260);
  shake = e.type === "boss" ? 22 : 8;
  maybeDropUpgrade(e);
  updateHud();
}

function advanceLevel() {
  if (state.level >= missions.length) {
    endGame("Culture Restored", `Score ${state.score}. Mame remembered Dog Planet and brought real meme culture back.`);
    return;
  }
  state.level += 1;
  state.spawned = 0;
  state.defeated = 0;
  state.spawnTimer = 1.2;
  state.message = missions[state.level - 1].name.toUpperCase();
  state.messageTimer = 2.0;
  state.player.shield = Math.min(state.player.maxShield, state.player.shield + 18);
  updateHud();
}

function update(dt) {
  if (!state || state.mode !== "playing") return;
  const p = state.player;
  const mission = missions[state.level - 1];
  const left = keys.has("arrowleft") || keys.has("a") || touch.left;
  const right = keys.has("arrowright") || keys.has("d") || touch.right;
  const up = keys.has("arrowup") || keys.has("w") || touch.up;
  const down = keys.has("arrowdown") || keys.has("s") || touch.down;

  state.dropCooldown = Math.max(0, state.dropCooldown - dt);

  const dx = (right ? 1 : 0) - (left ? 1 : 0);
  const dy = (down ? 1 : 0) - (up ? 1 : 0);
  const hasManualMove = dx !== 0 || dy !== 0;
  if (pointer.active && !hasManualMove) {
    const targetX = clamp(pointer.x, 42, W * 0.62);
    const targetY = clamp(pointer.y, 54, H - 46);
    const moveX = targetX - p.x;
    const moveY = targetY - p.y;
    const dist = Math.hypot(moveX, moveY);
    const step = Math.min(dist, 420 * dt);
    if (dist > 0.5) {
      p.x += (moveX / dist) * step;
      p.y += (moveY / dist) * step;
    }
  } else {
    const len = Math.hypot(dx, dy) || 1;
    p.x = clamp(p.x + (dx / len) * 270 * dt, 42, W * 0.62);
    p.y = clamp(p.y + (dy / len) * 270 * dt, 54, H - 46);
  }
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  shootPlayer();

  state.spawnTimer -= dt;
  if (state.spawned < mission.quota && state.spawnTimer <= 0) {
    spawnEnemy();
    state.spawnTimer = mission.spawn * rand(0.72, 1.18);
  }
  if (state.level === missions.length && state.spawned >= mission.quota && !state.boss && state.enemies.length < 2) {
    spawnBoss();
  }

  state.stars.forEach((s) => {
    s.x -= (38 + s.z * 46) * dt;
    s.twinkle += dt * (1.8 + s.z);
    if (s.x < -4) {
      s.x = W + rand(0, 60);
      s.y = Math.random() * H;
    }
  });

  state.bullets.forEach((b) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
  });
  state.enemyBullets.forEach((b) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
  });
  updatePickups(dt);

  state.enemies.forEach((e) => {
    e.wobble += dt * (e.type === "boss" ? 1.8 : 3.1);
    if (e.type === "boss") {
      if (e.phase === 1 && e.hp <= bossRageHp(e)) {
        e.phase = 2;
        e.fire = 0.08;
        state.message = "PUMP-01 RAGE MODE";
        state.messageTimer = 2.2;
        shake = 18;
        addParticles(e.x, e.y, "#ff5d62", 48, 260);
      }
      e.x = Math.max(W - 150, e.x - e.speed * dt);
      e.y = H / 2 + Math.sin(e.wobble * (e.phase === 2 ? 1.35 : 1)) * (e.phase === 2 ? 152 : 124);
    } else {
      e.x -= e.speed * dt;
      e.y += Math.sin(e.wobble) * (e.role === "speeder" ? 90 : 46) * dt;
    }
    e.fire -= dt;
    const canFire = e.type === "boss" || e.role === "gunner" || e.role === "brute" || (state.level >= 2 && e.type === "penguin");
    if (canFire && e.fire <= 0) {
      shootEnemy(e);
      e.fire = (e.type === "boss" ? e.phase === 2 ? rand(0.2, 0.42) : rand(0.36, 0.7) : rand(1.0, 2.0)) * difficultyScale().fire;
    }
  });

  state.bullets.forEach((b) => {
    state.enemies.forEach((e) => {
      if (b.life > 0 && e.hp > 0 && collide(b, e)) {
        b.life = 0;
        e.hp -= b.damage || 1;
        addParticles(b.x, b.y, "#f8f4df", 7, 150);
        if (e.hp <= 0) completeEnemy(e);
      }
    });
  });

  state.enemyBullets.forEach((b) => {
    if (b.life > 0 && collide(b, p)) {
      b.life = 0;
      damagePlayer(b.damage || 12);
    }
  });
  checkPickupCollection();

  state.enemies.forEach((e) => {
    if (e.hp > 0 && collide(e, p)) {
      e.hp = 0;
      completeEnemy(e);
      damagePlayer(e.type === "boss" ? 34 : 22);
    }
    if (e.x < -90 && e.hp > 0) {
      e.hp = 0;
      damagePlayer(14);
    }
  });

  state.bullets = state.bullets.filter((b) => b.life > 0 && b.x < W + 40);
  state.enemyBullets = state.enemyBullets.filter((b) => b.life > 0 && b.x > -40 && b.y > -40 && b.y < H + 40);
  state.enemies = state.enemies.filter((e) => e.hp > 0 && e.x > -120);
  if (state.boss && state.boss.hp <= 0) state.boss = null;

  state.particles.forEach((pt) => {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
    pt.life -= dt;
  });
  state.particles = state.particles.filter((pt) => pt.life > 0);

  state.messageTimer = Math.max(0, state.messageTimer - dt);
  shake = Math.max(0, shake - dt * 42);

  const quotaMet = state.spawned >= mission.quota && state.enemies.length === 0 && state.enemyBullets.length === 0;
  const bossDefeated = state.level === missions.length && state.spawned >= mission.quota && !state.boss && state.enemies.length === 0;
  if (quotaMet && state.level < missions.length) advanceLevel();
  if (bossDefeated && state.level === missions.length) advanceLevel();
}

function draw() {
  if (!state) {
    resetGame();
    state.mode = "idle";
  }
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawBackdrop();
  drawStars();
  drawSkyline();
  state.bullets.forEach(drawPlayerBullet);
  state.enemyBullets.forEach(drawEnemyBullet);
  state.pickups.forEach(drawPickup);
  state.enemies.forEach(drawEnemy);
  drawPlayer(state.player);
  state.particles.forEach(drawParticle);
  drawMessage();
  drawBossBar();
  drawPauseOverlay();
  ctx.restore();
}

function drawBackdrop() {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#1c1027");
  g.addColorStop(0.42, "#101b33");
  g.addColorStop(1, "#070914");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const sun = ctx.createRadialGradient(78, 150, 0, 78, 150, 180);
  sun.addColorStop(0, "rgba(255, 198, 87, .78)");
  sun.addColorStop(0.42, "rgba(255, 117, 75, .24)");
  sun.addColorStop(1, "rgba(255, 117, 75, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
}

function drawStars() {
  state.stars.forEach((s) => {
    const alpha = 0.32 + Math.sin(s.twinkle) * 0.22 + s.z * 0.2;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.z, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawSkyline() {
  ctx.save();
  ctx.globalAlpha = 0.44;
  for (let x = 0; x < W; x += 34) {
    const h = 40 + ((x * 17) % 130);
    ctx.fillStyle = x % 3 === 0 ? "#1a2740" : "#132035";
    ctx.fillRect(x, H - h, 24, h);
    ctx.fillStyle = "rgba(255,187,77,.42)";
    for (let y = H - h + 12; y < H - 8; y += 22) ctx.fillRect(x + 5, y, 4, 8);
  }
  ctx.restore();
}

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  const flash = p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0;
  ctx.globalAlpha = flash ? 0.48 : 1;

  if (sprites.playerShip.complete && sprites.playerShip.naturalWidth) {
    const shipW = 82;
    const shipH = 110;
    ctx.shadowColor = p.power >= 4 ? "rgba(255,187,77,.58)" : "rgba(82,255,156,.42)";
    ctx.shadowBlur = p.power >= 4 ? 22 : 16;
    ctx.drawImage(sprites.playerShip, -shipW / 2, -shipH / 2, shipW, shipH);

    ctx.globalAlpha = flash ? 0.38 : 0.72;
    ctx.fillStyle = p.power >= 4 ? "rgba(255,187,77,.58)" : "rgba(82,255,156,.46)";
    ctx.beginPath();
    ctx.moveTo(-shipW / 2 + 3, -18);
    ctx.quadraticCurveTo(-shipW / 2 - 22 - p.power * 3, 0, -shipW / 2 + 3, 18);
    ctx.quadraticCurveTo(-shipW / 2 - 10, 0, -shipW / 2 + 3, -18);
    ctx.fill();

    if (p.power >= 3) {
      ctx.fillStyle = p.power >= 4 ? "#ffbb4d" : "#52ff9c";
      [-34, 34].forEach((y) => {
        ctx.beginPath();
        roundCapsule(14, y - 3, 24, 6, 3);
        ctx.fill();
      });
    }

    ctx.restore();
    return;
  }

  ctx.fillStyle = p.power >= 4 ? "rgba(255,187,77,.42)" : "rgba(82,255,156,.34)";
  ctx.beginPath();
  ctx.moveTo(-32, 0);
  ctx.quadraticCurveTo(-58 - p.power * 4, -18, -78 - p.power * 4, 0);
  ctx.quadraticCurveTo(-56 - p.power * 4, 18, -32, 0);
  ctx.fill();

  if (p.power >= 3) {
    ctx.fillStyle = "rgba(82,255,156,.72)";
    ctx.beginPath();
    ctx.moveTo(-6, -27);
    ctx.lineTo(-42, -48);
    ctx.lineTo(-26, -14);
    ctx.closePath();
    ctx.moveTo(-6, 31);
    ctx.lineTo(-42, 52);
    ctx.lineTo(-26, 17);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "#141821";
  ctx.strokeStyle = "#05060a";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, 3, 31, 25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f6f2e0";
  ctx.beginPath();
  ctx.ellipse(4, 12, 20, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#141821";
  ctx.beginPath();
  ctx.moveTo(-23, -13);
  ctx.lineTo(-16, -38);
  ctx.lineTo(0, -17);
  ctx.closePath();
  ctx.moveTo(16, -14);
  ctx.lineTo(28, -37);
  ctx.lineTo(29, -10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#e7d5c4";
  ctx.beginPath();
  ctx.moveTo(-17, -18);
  ctx.lineTo(-15, -30);
  ctx.lineTo(-7, -17);
  ctx.closePath();
  ctx.moveTo(20, -17);
  ctx.lineTo(26, -28);
  ctx.lineTo(25, -13);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffcf75";
  ctx.strokeStyle = "#09090c";
  ctx.lineWidth = 2;
  [-10, 14].forEach((x) => {
    ctx.beginPath();
    ctx.arc(x, -3, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#101218";
    ctx.beginPath();
    ctx.arc(x + 1, -2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffcf75";
  });

  ctx.fillStyle = "#05060a";
  ctx.beginPath();
  ctx.ellipse(2, 5, 5.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f6f2e0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(2, 9);
  ctx.lineTo(2, 15);
  ctx.stroke();

  ctx.strokeStyle = "#11141c";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-24, 22);
  ctx.quadraticCurveTo(-48, 38, -30, 55);
  ctx.stroke();
  ctx.strokeStyle = "#f6f2e0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-35, 46);
  ctx.quadraticCurveTo(-25, 56, -16, 46);
  ctx.stroke();

  ctx.strokeStyle = "#05060a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-12, 29);
  ctx.lineTo(-4, 45);
  ctx.lineTo(12, 45);
  ctx.lineTo(20, 30);
  ctx.stroke();

  if (p.power >= 2) {
    ctx.fillStyle = p.power >= 4 ? "#ffbb4d" : "#52ff9c";
    [-22, 26].forEach((y) => {
      ctx.beginPath();
      roundCapsule(13, y - 3, 26, 6, 3);
      ctx.fill();
    });
  }

  ctx.restore();
}

function drawMinion(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(Math.sin(e.wobble) * 0.08);
  const scale = e.role === "brute" ? 1.18 : e.role === "speeder" ? 0.82 : 1;
  ctx.scale(scale, scale);

  ctx.strokeStyle = "#081018";
  ctx.lineWidth = 4;

  if (e.type === "pepe") {
    if (sprites.pepe.complete && sprites.pepe.naturalWidth) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(sprites.pepe, -36, -42, 72, 80);
      ctx.restore();
    } else {
      ctx.fillStyle = "#63c96b";
      ctx.beginPath();
      ctx.ellipse(-4, 2, 32, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f4f5e8";
      [-16, 10].forEach((x) => {
        ctx.beginPath();
        ctx.arc(x, -11, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#101218";
        ctx.beginPath();
        ctx.arc(x + 1, -9, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f4f5e8";
      });
      ctx.strokeStyle = "#a53446";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-20, 12);
      ctx.quadraticCurveTo(-2, 23, 20, 10);
      ctx.stroke();
    }
  } else if (e.type === "cat") {
    if (sprites.cat.complete && sprites.cat.naturalWidth) {
      ctx.drawImage(sprites.cat, -33, -39, 66, 72);
    } else {
      ctx.fillStyle = "#f2a24a";
      ctx.beginPath();
      ctx.moveTo(-26, -7);
      ctx.lineTo(-18, -32);
      ctx.lineTo(-4, -12);
      ctx.moveTo(8, -12);
      ctx.lineTo(24, -32);
      ctx.lineTo(24, -5);
      ctx.ellipse(0, 4, 29, 25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#101218";
      [-10, 12].forEach((x) => {
        ctx.beginPath();
        ctx.arc(x, -2, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.strokeStyle = "#101218";
      ctx.lineWidth = 2;
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.moveTo(side * 3, 9);
        ctx.lineTo(side * 26, 4);
        ctx.moveTo(side * 3, 13);
        ctx.lineTo(side * 26, 16);
        ctx.stroke();
      });
    }
  } else if (e.type === "penguin") {
    if (sprites.penguin.complete && sprites.penguin.naturalWidth) {
      ctx.drawImage(sprites.penguin, -34, -39, 68, 67);
    } else {
      ctx.fillStyle = "#111820";
      ctx.beginPath();
      ctx.ellipse(0, 2, 27, 32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f6f2e0";
      ctx.beginPath();
      ctx.ellipse(0, 9, 17, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffb347";
      ctx.beginPath();
      ctx.moveTo(-2, -5);
      ctx.lineTo(-20, 2);
      ctx.lineTo(-2, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#101218";
      [-8, 8].forEach((x) => {
        ctx.beginPath();
        ctx.arc(x, -11, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  } else if (e.type === "duck") {
    if (sprites.duck.complete && sprites.duck.naturalWidth) {
      ctx.drawImage(sprites.duck, -42, -29, 84, 48);
    } else {
      ctx.fillStyle = "#ffd85c";
      ctx.beginPath();
      ctx.ellipse(0, 7, 30, 20, 0, 0, Math.PI * 2);
      ctx.ellipse(-15, -10, 18, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f07b2f";
      ctx.beginPath();
      ctx.moveTo(-32, -10);
      ctx.lineTo(-52, -4);
      ctx.lineTo(-31, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#101218";
      ctx.beginPath();
      ctx.arc(-18, -14, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (e.type === "musk") {
    if (sprites.musk.complete && sprites.musk.naturalWidth) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(sprites.musk, -54, -50, 108, 113);
      ctx.restore();
    } else {
      ctx.fillStyle = "#25324f";
      roundCapsule(-25, 2, 50, 34, 13);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f1c9a6";
      ctx.beginPath();
      ctx.ellipse(0, -14, 23, 25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1a1518";
      ctx.beginPath();
      ctx.moveTo(-22, -21);
      ctx.quadraticCurveTo(-4, -42, 23, -20);
      ctx.lineTo(18, -33);
      ctx.quadraticCurveTo(-2, -28, -22, -21);
      ctx.fill();
    }
  } else if (e.type === "mouse") {
    if (sprites.mouse.complete && sprites.mouse.naturalWidth) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(sprites.mouse, -34, -45, 68, 80);
      ctx.restore();
    } else {
      ctx.fillStyle = "#aeb6bd";
      ctx.beginPath();
      ctx.ellipse(0, 4, 24, 19, 0, 0, Math.PI * 2);
      ctx.arc(-18, -12, 10, 0, Math.PI * 2);
      ctx.arc(14, -13, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#101218";
      [-8, 10].forEach((x) => {
        ctx.beginPath();
        ctx.arc(x, 1, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  } else if (e.type === "troll") {
    if (sprites.troll.complete && sprites.troll.naturalWidth) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(sprites.troll, -34, -29, 68, 57);
      ctx.restore();
    } else {
      ctx.fillStyle = "#f6f2e0";
      ctx.beginPath();
      ctx.ellipse(0, 0, 30, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#101218";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-19, 6);
      ctx.quadraticCurveTo(0, 20, 22, 6);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = "#aeb6bd";
    ctx.beginPath();
    ctx.ellipse(0, 4, 24, 19, 0, 0, Math.PI * 2);
    ctx.arc(-18, -12, 10, 0, Math.PI * 2);
    ctx.arc(14, -13, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#101218";
    [-8, 10].forEach((x) => {
      ctx.beginPath();
      ctx.arc(x, 1, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#f0a0a8";
    ctx.beginPath();
    ctx.arc(-22, 7, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEnemy(e) {
  if (e.type !== "boss") {
    drawMinion(e);
    return;
  }

  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(Math.sin(e.wobble) * 0.04);

  const rageHp = bossRageHp(e);
  const phaseOneHp = bossPhaseOneHp(e);
  const phaseOnePct = clamp((e.hp - rageHp) / phaseOneHp, 0, 1);
  const phaseTwoPct = clamp(Math.min(e.hp, rageHp) / rageHp, 0, 1);
  if (sprites.boss.complete && sprites.boss.naturalWidth) {
    const bossW = 260;
    const bossH = 170;
    ctx.shadowColor = e.phase === 2 ? "rgba(255,93,98,.72)" : "rgba(82,255,156,.45)";
    ctx.shadowBlur = e.phase === 2 ? 28 : 18;
    ctx.drawImage(sprites.boss, -bossW / 2, -bossH / 2, bossW, bossH);
    if (e.phase === 2) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(255,57,72,.16)";
      ctx.fillRect(-bossW / 2, -bossH / 2, bossW, bossH);
      ctx.globalCompositeOperation = "source-over";
    }
  } else {
    ctx.scale(1.55, 1.55);
    ctx.fillStyle = "#eef3ee";
    ctx.strokeStyle = "#081018";
    ctx.lineWidth = 4;
    roundCapsule(-48, -24, 96, 48, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#10b872";
    roundCapsule(0, -24, 58, 48, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#202934";
    roundCapsule(23, -19, 26, 20, 9);
    ctx.fill();

    ctx.fillStyle = "#101720";
    ctx.font = "700 15px Trebuchet MS";
    ctx.fillText("PUMP-01", -26, 5);
    ctx.scale(1 / 1.55, 1 / 1.55);
  }

  ctx.fillStyle = "rgba(7,12,28,.82)";
  ctx.fillRect(-70, -98, 140, 6);
  ctx.fillRect(-70, -89, 140, 6);
  ctx.fillStyle = "#ff5d62";
  ctx.fillRect(-70, -98, 140 * phaseOnePct, 6);
  ctx.fillStyle = "#ff9a3d";
  ctx.fillRect(-70, -89, 140 * phaseTwoPct, 6);
  ctx.strokeStyle = "rgba(255,255,255,.34)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-70, -98, 140, 6);
  ctx.strokeRect(-70, -89, 140, 6);
  ctx.restore();
}

function roundCapsule(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawPlayerBullet(b) {
  ctx.save();
  ctx.fillStyle = b.heavy ? "#ffbb4d" : "#f8f4df";
  ctx.shadowColor = b.heavy ? "#ffbb4d" : "#52ff9c";
  ctx.shadowBlur = b.heavy ? 22 : 16;
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, b.heavy ? 17 : 13, b.heavy ? 6 : 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemyBullet(b) {
  ctx.save();
  ctx.fillStyle = "#ff5d62";
  ctx.shadowColor = "#ff5d62";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPickup(pickup) {
  ctx.save();
  ctx.translate(pickup.x, pickup.y);
  ctx.rotate(pickup.wobble);
  ctx.shadowColor = "#ffbb4d";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "rgba(255,187,77,.24)";
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffbb4d";
  ctx.strokeStyle = "#061008";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI * 2 * i) / 6;
    const radius = i % 2 === 0 ? 16 : 8;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#061008";
  ctx.font = "900 12px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("UP", 0, 1);
  ctx.restore();
}

function drawParticle(pt) {
  ctx.save();
  ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
  ctx.fillStyle = pt.color;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMessage() {
  if (state.messageTimer <= 0 || !state.message) return;
  ctx.save();
  ctx.globalAlpha = clamp(state.messageTimer, 0, 1);
  ctx.fillStyle = "#f8f4df";
  ctx.font = "900 34px Impact, sans-serif";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(82,255,156,.7)";
  ctx.shadowBlur = 20;
  ctx.fillText(state.message, W / 2, 86);
  ctx.restore();
}

function drawBossBar() {
  if (!state.boss) return;
  const rageHp = bossRageHp(state.boss);
  const phaseOneHp = bossPhaseOneHp(state.boss);
  const totalPerRow = 50;
  const phaseOneFilled = Math.ceil(clamp((state.boss.hp - rageHp) / phaseOneHp, 0, 1) * totalPerRow);
  const phaseTwoFilled = Math.ceil(clamp(Math.min(state.boss.hp, rageHp) / rageHp, 0, 1) * totalPerRow);
  const cellW = 9;
  const cellH = 8;
  const gap = 2;
  const barW = totalPerRow * cellW + (totalPerRow - 1) * gap;
  const x = W / 2 - barW / 2;
  const y = 68;
  ctx.save();
  ctx.fillStyle = "#f8f4df";
  ctx.font = "800 12px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.boss.phase === 2 ? "PUMP-01 BOSS / RAGE MODE / 50 HP" : "PUMP-01 BOSS / PHASE 1 / 550 HP", W / 2, y - 11);

  const drawRow = (rowY, filled, color) => {
    for (let i = 0; i < totalPerRow; i += 1) {
      const cellX = x + i * (cellW + gap);
      ctx.fillStyle = "rgba(7,12,28,.74)";
      ctx.fillRect(cellX, rowY, cellW, cellH);
      if (i < filled) {
        ctx.fillStyle = color;
        ctx.fillRect(cellX, rowY, cellW, cellH);
      }
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.strokeRect(cellX, rowY, cellW, cellH);
    }
  };

  drawRow(y, phaseOneFilled, "#ff5d62");
  drawRow(y + 13, phaseTwoFilled, state.boss.phase === 2 ? "#ffbb4d" : "#ff9a3d");
  ctx.restore();
}

function drawPauseOverlay() {
  if (state.mode !== "paused") return;
  ctx.save();
  ctx.fillStyle = "rgba(3, 7, 21, .48)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f8f4df";
  ctx.font = "900 62px Impact, sans-serif";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(82,255,156,.72)";
  ctx.shadowBlur = 24;
  ctx.fillText("PAUSED", W / 2, H / 2 - 4);
  ctx.font = "700 16px Trebuchet MS, sans-serif";
  ctx.shadowBlur = 8;
  ctx.fillText("Press P or Esc to resume", W / 2, H / 2 + 34);
  ctx.restore();
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const k = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "spacebar", "escape"].includes(k)) {
    event.preventDefault();
  }
  if (k === "p" || k === "escape") {
    togglePause();
    return;
  }
  if (k === "m") {
    toggleSound();
    return;
  }
  keys.add(k);
  if ((state?.mode === "idle" || !state) && (k === " " || k === "enter")) startGame();
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

function updatePointerTarget(event) {
  if (!state || state.mode !== "playing") return;
  const rect = canvas.getBoundingClientRect();
  pointer.active = true;
  pointer.x = ((event.clientX - rect.left) / rect.width) * W;
  pointer.y = ((event.clientY - rect.top) / rect.height) * H;
}

canvas.addEventListener("pointerdown", (event) => {
  updatePointerTarget(event);
  canvas.setPointerCapture?.(event.pointerId);
});
canvas.addEventListener("pointermove", updatePointerTarget);

window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio);

document.querySelectorAll("[data-dir]").forEach((button) => {
  const dir = button.dataset.dir;
  const set = (value) => {
    touch[dir] = value;
  };
  button.addEventListener("pointerdown", () => set(true));
  button.addEventListener("pointerup", () => set(false));
  button.addEventListener("pointerleave", () => set(false));
});

document.querySelector("[data-fire]").addEventListener("pointerdown", () => {
  touch.fire = true;
});
document.querySelector("[data-fire]").addEventListener("pointerup", () => {
  touch.fire = false;
});
document.querySelector("[data-fire]").addEventListener("pointerleave", () => {
  touch.fire = false;
});

ui.start.addEventListener("click", startGame);
ui.pause.addEventListener("click", togglePause);
ui.sound.addEventListener("click", toggleSound);
resetGame();
state.mode = "idle";
updatePauseButton();
updateSoundButton();
requestAnimationFrame(loop);
