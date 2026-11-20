"use strict";

const $ = (id) => document.getElementById(id);
const ctx = $("track").getContext("2d");
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
    const r = Math.min(Number(radius) || 0, Math.abs(width) / 2, Math.abs(height) / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + width, y, x + width, y + height, r);
    this.arcTo(x + width, y + height, x, y + height, r);
    this.arcTo(x, y + height, x, y, r);
    this.arcTo(x, y, x + width, y, r);
    this.closePath();
    return this;
  };
}
const W = 960, H = 600;
const ROAD = { left: 240, right: 720 };
const phases = ["Fuga do T-Rex", "Trilha do Dragão", "Duelo com o Robô"];
const drivers = {
  Pedro: { primary: "#ff683f", dark: "#aa303e", hair: "#442438", skin: "#f7bb85" },
  Henry: { primary: "#4ac9ff", dark: "#2966aa", hair: "#28203a", skin: "#b7734d" }
};
const weapons = {
  energy: { key: " ", label: "Energia", damage: 1, delay: .16, color: "#66eaff" },
  missile: { key: "m", label: "Míssil", damage: 4, delay: 1.15, color: "#ffbd61" },
  laser: { key: "l", label: "Laser", damage: 7, delay: 2.8, color: "#ff70dc" },
  bomb: { key: "b", label: "Bomba", damage: 10, delay: 5.5, color: "#fff07b" }
};
const keys = new Set();
const held = new Map();
const mobileDevice = matchMedia("(pointer: coarse)").matches;
let mode = "menu", driver = "Pedro", game, sceneTime = 0, scroll = 0;
const STORAGE_KEY = "pedro-henry-progress-v1";
const defaultProgress = { highScores: { Pedro: 0, Henry: 0 }, coins: 0, unlockedCars: ["Pedro", "Henry"], completedPhases: [], sound: true };
let progress = loadProgress();
let audio, muted = !progress.sound, previous = 0;
const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
const rand = (min, max) => min + Math.random() * (max - min);
const pressed = (...names) => names.some((name) => keys.has(name) || [...held.values()].includes(name));

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      ...defaultProgress,
      ...saved,
      highScores: { ...defaultProgress.highScores, ...(saved && saved.highScores) },
      unlockedCars: Array.isArray(saved && saved.unlockedCars) ? saved.unlockedCars : defaultProgress.unlockedCars,
      completedPhases: Array.isArray(saved && saved.completedPhases) ? saved.completedPhases : []
    };
  } catch {
    return JSON.parse(JSON.stringify(defaultProgress));
  }
}

function saveProgress() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* Storage can be unavailable in private mode. */ }
}

function tone(notes) {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (muted || !Audio) return;
  try {
    audio ??= new Audio();
    if (audio.state === "suspended") audio.resume().catch(() => {});
    notes.forEach((frequency, i) => {
      const osc = audio.createOscillator(), gain = audio.createGain();
      const now = audio.currentTime + i * .075;
      osc.type = "triangle";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.07, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + .15);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(now);
      osc.stop(now + .16);
    });
  } catch {
    // Audio is optional if the browser cannot initialize it.
  }
}

function screen(next, tag, title, message, buttons) {
  const moveFocus = $("overlay").contains(document.activeElement) || next !== "race";
  mode = next;
  document.body.classList.toggle("playing", next === "race");
  held.clear();
  $("overlay").hidden = next === "race";
  $("hud").hidden = next !== "race";
  $("touch").hidden = next !== "race";
  if (next === "race") {
    if (moveFocus) document.activeElement.blur();
    updateHud();
    return;
  }
  $("tag").textContent = tag;
  $("title").textContent = title;
  $("message").textContent = message;
  $("actions").replaceChildren(...buttons.map(([label, action, pilot]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (pilot) button.dataset.driver = pilot;
    button.addEventListener("click", () => { tone([460]); action(); });
    return button;
  }));
  if (next !== "menu") $("actions").firstElementChild.focus({ preventScroll: true });
}

function menu() {
  screen("menu", "PEDRO & HENRY", "Corrida da Aventura", "Desvie, pegue moedas e encare três desafios!", [
    ["Jogar", choose]
  ]);
}

function choose() {
  screen("choose", "ESCOLHA SEU PILOTO", "Quem vai dirigir?", "Pedro dirige o carro laranja. Henry dirige o carro azul.", [
    ...Object.keys(drivers).map((pilot) => [pilot, () => start(pilot), pilot]),
    ["Voltar", menu]
  ]);
}

function start(pilot) {
  driver = pilot;
  game = { phase: 1, lives: 3, score: 0, coins: 0, turbo: 80, shield: false };
  startPhase(1);
}

function startPhase(phase) {
  Object.assign(game, {
    phase, elapsed: 0, obstacleTimer: 1, coinTimer: .4, pickupTimer: 4,
    attackTimer: 2, specialTimer: 5, invincible: 1, boosting: false,
    x: 480, y: 473, entities: [], particles: [], bossHealth: 60, bossMaxHealth: 60,
    bossX: 480, enemyStun: 0, weaponFlash: 0, laserBeam: 0, bombWave: 0,
    selectedWeapon: "energy", cooldowns: { energy: 0, missile: 0, laser: 0, bomb: 0 }
  });
  screen("race");
}

function transition() {
  if (!progress.completedPhases.includes(game.phase)) progress.completedPhases.push(game.phase);
  progress.coins += game.coins;
  game.coins = 0;
  saveProgress();
  if (game.phase === 1) {
    screen("brief", "FASE 2", phases[1], "Cuidado com as bolas de fogo laranjas!", [["Continuar", () => startPhase(2)]]);
  } else {
    screen("cutscene", "INTERVALO DO DRAGÃO", "Só mais uma partida!", "O dragão pegou o controle. Aproveite para preparar o duelo com o robô!", [
      ["Enfrentar o robô", () => startPhase(3)]
    ]);
  }
}

function finish(won) {
  if (won) game.score += 500;
  if (won && !progress.completedPhases.includes(3)) progress.completedPhases.push(3);
  progress.coins += game.coins;
  progress.highScores[driver] = Math.max(progress.highScores[driver] || 0, game.score);
  saveProgress();
  tone(won ? [523, 659, 784, 1047] : [330, 220, 147]);
  screen(won ? "win" : "lose", driver.toUpperCase(), won ? "PEDRO E HENRY SALVARAM O MUNDO!" : "Vamos tentar de novo?",
    game.score + " pontos · recorde de " + driver + ": " + progress.highScores[driver] + " · moedas guardadas: " + progress.coins,
    [["Jogar de novo", () => start(driver)], ["Menu", menu]]);
}

function cinematicVictory() {
  if (game.victoryPending) return;
  game.victoryPending = 2.1;
  game.entities = [];
  game.invincible = 99;
  for (let i = 0; i < 7; i++) {
    setTimeout(() => {
      if (!game || !game.victoryPending) return;
      explosion(game.bossX + rand(-90, 90), rand(75, 220), ["#76ffff", "#ff74dc", "#ffd769"][i % 3], 34);
      tone([120 + i * 30, 280 + i * 40]);
    }, i * 190);
  }
}

function pause() {
  keys.clear();
  screen("paused", "PAUSA", "Corrida em pausa", "A pista está te esperando.", [
    ["Continuar", () => screen("race")], ["Menu", menu]
  ]);
}

function updateHud() {
  const labels = [
    "Fase " + game.phase + " · " + phases[game.phase - 1],
    "Vidas " + "♥".repeat(game.lives) + "♡".repeat(3 - game.lives),
    "Pontos " + game.score, "Turbo " + Math.ceil(game.turbo) + "%",
    "Escudo " + (game.shield ? "ativo" : "—")
  ];
  const status = $("status");
  if (!status.childElementCount) {
    status.append(...labels.map(() => document.createElement("span")));
  }
  labels.forEach((label, i) => {
    if (status.children[i].textContent !== label) status.children[i].textContent = label;
  });
  const weaponStatus = $("weapon-status");
  if (!weaponStatus.childElementCount) {
    weaponStatus.append(...Object.keys(weapons).map(() => {
      const chip = document.createElement("span");
      chip.className = "weapon-chip";
      return chip;
    }));
  }
  Object.entries(weapons).forEach(([name, weapon], index) => {
    const remaining = Math.max(0, game.cooldowns[name]);
    const chip = weaponStatus.children[index];
    chip.textContent = weapon.label + " [" + (weapon.key === " " ? "ESPAÇO" : weapon.key.toUpperCase()) + "] " + (remaining ? remaining.toFixed(1) + "s" : "PRONTA");
    chip.className = "weapon-chip" + (game.selectedWeapon === name ? " active" : "") + (remaining ? " reloading" : "");
    chip.style.setProperty("--charge", (100 * (1 - remaining / weapon.delay)) + "%");
  });
  $("progress").style.transform = "scaleX(" + (game.phase === 3 ? game.bossHealth / game.bossMaxHealth : Math.min(1, game.elapsed / 22)) + ")";
  $("progress").style.background = game.phase === 3 ? "#ff71ad" : "#ffd259";
}

function spawn(kind, x = rand(272, 688), y = -32, vx = 0, extra = {}) {
  game.entities.push({ kind, x, y, vx, ...extra });
}

function burst(x, y, color) {
  for (let i = 0; i < 10; i++) {
    game.particles.push({ x, y, vx: rand(-125, 125), vy: rand(-130, 90), life: rand(.2, .6), color });
  }
}

function explosion(x, y, color, size = 22) {
  if (mobileDevice) size = Math.ceil(size * .7);
  for (let i = 0; i < size; i++) {
    const angle = Math.PI * 2 * i / size;
    const speed = rand(90, 270);
    game.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: rand(.35, .9), color, size: rand(3, 9) });
  }
  if (game.particles.length > (mobileDevice ? 180 : 280)) game.particles.splice(0, game.particles.length - (mobileDevice ? 180 : 280));
  game.weaponFlash = .12;
}

function fireWeapon(name) {
  const g = game, weapon = weapons[name];
  if (!weapon || g.cooldowns[name] > 0) return;
  g.selectedWeapon = name;
  g.cooldowns[name] = weapon.delay;
  g.weaponFlash = .11;
  const direction = g.phase === 1 ? 1 : -1;
  if (name === "energy") {
    spawn("energy", g.x, g.y + direction * 49, 0, { damage: weapon.damage, direction });
    tone([620, 880]);
  } else if (name === "missile") {
    for (const side of [-1, 1]) spawn("missile", g.x + side * 25, g.y + direction * 24, side * 18, { damage: weapon.damage, direction });
    tone([170, 230, 330]);
  } else if (name === "laser") {
    g.laserBeam = .22;
    damageEnemy(weapon.damage, g.x, true);
    tone([240, 480, 960]);
  } else {
    g.bombWave = .65;
    damageEnemy(weapon.damage, g.x, true);
    g.entities = g.entities.filter((entity) => !["rock", "fire", "orb", "shockwave"].includes(entity.kind));
    explosion(g.x, g.y, weapon.color, 42);
    tone([110, 165, 220, 440]);
  }
}

function damageEnemy(damage, impactX, area = false) {
  const g = game;
  if (g.phase === 3) {
    g.bossHealth = Math.max(0, g.bossHealth - damage);
    g.score += damage * 15;
    explosion(area ? g.bossX : impactX, 165, weapons[g.selectedWeapon].color, area ? 28 : 14);
  } else {
    g.enemyStun = Math.max(g.enemyStun, 1.2 + damage * .11);
    g.score += damage * 10;
    explosion(g.phase === 1 ? rexX() : g.bossX, g.phase === 1 ? 548 : 130, weapons[g.selectedWeapon].color, area ? 26 : 12);
  }
}

function hit(entity) {
  if (entity.kind === "coin") {
    game.coins++;
    game.score += 25;
    tone([730, 980]);
    burst(entity.x, entity.y, "#ffd453");
  } else if (entity.kind === "shield" || entity.kind === "turbo") {
    if (entity.kind === "shield") game.shield = true;
    else game.turbo = Math.min(100, game.turbo + 48);
    tone([400, 600, 820]);
    burst(entity.x, entity.y, "#75f6ff");
  } else if (game.invincible <= 0) {
    if (game.shield) game.shield = false;
    else game.lives--;
    game.invincible = 1.3;
    tone([200, 125]);
    burst(game.x, game.y, "#ff8fa1");
  }
}

function update(dt) {
  const g = game;
  if (g.victoryPending) {
    g.victoryPending -= dt;
    g.particles = g.particles.filter((p) => {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; return p.life > 0;
    });
    if (g.victoryPending <= 0) finish(true);
    return;
  }
  g.elapsed += dt;
  g.invincible -= dt;
  g.enemyStun -= dt;
  g.weaponFlash -= dt;
  g.laserBeam -= dt;
  g.bombWave -= dt;
  Object.keys(g.cooldowns).forEach((name) => { g.cooldowns[name] -= dt; });
  const dx = Number(pressed("arrowright", "d")) - Number(pressed("arrowleft", "a"));
  const dy = Number(pressed("arrowdown", "s")) - Number(pressed("arrowup", "w"));
  g.boosting = pressed("shift") && g.turbo > 0;
  if (g.boosting) g.turbo = Math.max(0, g.turbo - 34 * dt);
  const speed = (g.boosting ? 545 : 350) * dt / (dx && dy ? Math.SQRT2 : 1);
  g.x = clamp(g.x + dx * speed, ROAD.left + 28, ROAD.right - 28);
  g.y = clamp(g.y + dy * speed, g.phase === 3 ? 280 : 235, 529);
  scroll += (g.boosting ? 480 : 284) * dt;
  if ((g.obstacleTimer -= dt) <= 0) {
    spawn("rock");
    g.obstacleTimer = rand(.75, 1.24);
  }
  if ((g.coinTimer -= dt) <= 0) {
    const x = rand(280, 680);
    for (let i = 0; i < 3; i++) spawn("coin", x, -22 - i * 48);
    g.coinTimer = rand(2, 3);
  }
  if ((g.pickupTimer -= dt) <= 0) {
    spawn(g.shield ? "turbo" : "shield");
    g.pickupTimer = 6;
  }
  if (g.phase === 1 && g.enemyStun <= 0 && g.invincible <= 0 && g.y > 514 && Math.abs(rexX() - g.x) < 50) {
    hit({ kind: "rex" });
  }
  if (g.phase >= 2) {
    g.bossX = 480 + Math.sin(g.elapsed * .93) * 151;
    if (g.enemyStun <= 0 && (g.attackTimer -= dt) <= 0) {
      const y = g.phase === 2 ? 164 : 198;
      const flight = Math.max(.4, (g.y - y) / 280);
      spawn(g.phase === 2 ? "fire" : "orb", g.bossX, y, (g.x - g.bossX) / flight);
      g.attackTimer = g.phase === 2 ? 1.45 : 1.25;
    }
  }
  for (const [name, weapon] of Object.entries(weapons)) {
    const mobileFire = [...held.values()].includes("fire") && g.selectedWeapon === name;
    if (pressed(weapon.key) || mobileFire) fireWeapon(name);
  }
  if (g.phase === 3 && g.enemyStun <= 0 && (g.specialTimer -= dt) <= 0) {
    const attack = Math.floor(g.elapsed / 6) % 2;
    if (attack === 0) {
      for (let i = -2; i <= 2; i++) spawn("orb", g.bossX + i * 32, 190, i * 70);
    } else {
      for (let x = 290; x <= 670; x += 95) spawn("shockwave", x, 190, 0);
    }
    g.specialTimer = 5.5;
    tone([95, 125, 165]);
  }
  g.entities = g.entities.filter((e) => {
    const prevY = e.y;
    const friendly = e.kind === "energy" || e.kind === "missile";
    if (e.kind === "missile") {
      const targetX = g.phase === 1 ? rexX() : g.bossX;
      e.vx += clamp(targetX - e.x, -80, 80) * dt * 3;
    }
    e.y += (friendly ? (e.kind === "missile" ? 450 : 760) * e.direction : e.kind === "fire" || e.kind === "orb" ? 280 : e.kind === "shockwave" ? 360 : g.boosting ? 430 : 246) * dt;
    e.x += e.vx * dt;
    if (e.kind === "missile" && Math.random() < .55) {
      g.particles.push({ x: e.x, y: e.y + 14, vx: rand(-20, 20), vy: rand(35, 80), life: .45, color: "#dfe3ef", size: rand(4, 8) });
    }
    const enemyY = g.phase === 1 ? 548 : g.phase === 2 ? 130 : 165;
    const enemyX = g.phase === 1 ? rexX() : g.bossX;
    const crossedEnemy = e.direction > 0 ? prevY <= enemyY && e.y >= enemyY : prevY >= enemyY && e.y <= enemyY;
    if (friendly && crossedEnemy && Math.abs(e.x - enemyX) < (e.kind === "missile" ? 105 : 76)) {
      game.selectedWeapon = e.kind === "missile" ? "missile" : "energy";
      damageEnemy(e.damage, e.x);
      return false;
    }
    if (!friendly && Math.abs(e.x - g.x) < 32 && Math.abs(e.y - g.y) < 37) {
      hit(e);
      return false;
    }
    return e.y > -600 && e.y < H + 40 && e.x > -40 && e.x < W + 40;
  });
  g.particles = g.particles.filter((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= .98;
    p.vy *= .98;
    return p.life > 0;
  });
  if (g.lives <= 0) finish(false);
  else if (g.phase === 3 && g.bossHealth <= 0) cinematicVictory();
  else if (g.phase < 3 && g.elapsed >= 22) transition();
  else updateHud();
}

function box(x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); }
}

function oval(x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function poly(color, ...points) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function landscape(phase) {
  const palette = [
    ["#9ee277", "#70be68", "#296e63", "#495677", "#ffe591"],
    ["#bd91ef", "#997ad9", "#714b9e", "#514369", "#ffbe87"],
    ["#6b9dc6", "#5883b1", "#345781", "#343d62", "#84ecff"]
  ][phase - 1];
  box(0, 0, W, H, 0, palette[0]);
  for (let i = 0; i < 8; i++) {
    const y = ((i * 104 + scroll * .65) % 832) - 100;
    for (const x of [86 + (i % 3) * 48, 783 + (i % 3) * 53]) {
      oval(x, y + 22, 41, 15, palette[1]);
      if (phase === 3) {
        box(x - 30, y - 18, 60, 43, 9, palette[2]);
        box(x - 20, y - 9, 40, 5, 2, palette[4]);
        for (let j = -1; j <= 1; j++) box(x + j * 14 - 4, y + 4, 8, 12, 2, palette[1]);
      } else if (phase === 2) {
        poly(palette[2], x - 35, y + 21, x - 12, y - 23, x + 10, y - 6, x + 36, y + 21);
        poly(palette[4], x - 12, y - 23, x + 10, y - 6, x - 5, y + 4);
      } else {
        box(x - 6, y - 2, 12, 28, 4, "#99634d");
        oval(x - 12, y - 8, 24, 23, palette[2]);
        oval(x + 11, y - 15, 22, 26, "#3d9866");
        oval(x + 11, y - 22, 11, 10, "#62bb6e");
      }
    }
  }
  box(223, 0, 514, H, 0, "#282e51");
  box(240, 0, 480, H, 0, palette[3]);
  for (const x of [240, 705]) {
    box(x, 0, 15, H, 0, "#f7ead3");
    for (let y = scroll % 64 - 64; y < H; y += 64) box(x, y, 15, 32, 0, "#f78077");
  }
  for (const x of [399, 559]) {
    for (let y = scroll % 102 - 102; y < H; y += 102) box(x, y, 4, 53, 2, "#d4dcf2aa");
  }
}

function car(x, y, who, boosting = false, shield = false) {
  const d = drivers[who];
  const armed = game && mode !== "menu" && mode !== "choose";
  ctx.save();
  ctx.translate(x, y);
  oval(0, 21, 32, 29, "#18223e85");
  if (boosting) {
    const flicker = Math.sin(sceneTime * 35) * 7;
    poly("#ff865d", -17, 29, -9, 63 + flicker, 0, 43, 9, 66 - flicker, 17, 29);
    poly("#ffe673", -10, 31, 0, 56, 10, 31);
  }
  for (const tx of [-28, 16]) {
    for (const ty of [-27, 13]) box(tx, ty, 12, 21, 4, "#20213b");
  }
  box(-24, -37, 48, 73, 13, d.dark, "#24213a");
  box(-20, -36, 40, 62, 12, d.primary);
  // Futuristic hood cannons and side-mounted missile launchers.
  for (const side of [-1, 1]) {
    box(side * 14 - 4, -48, 8, 25, 4, "#9beeff", "#253054");
    box(side * 30 - 7, -20, 14, 28, 4, "#585e86", "#252846");
    oval(side * 30, -17, 4, 5, "#ffdc82");
  }
  oval(0, -25, 9, 9, armed && game.weaponFlash > 0 ? weapons[game.selectedWeapon].color : "#5cffff");
  box(-16, -16, 32, 34, 8, "#263e63");
  oval(0, 0, 12, 13, d.skin);
  oval(-2, -5, 11, 8, d.hair);
  box(-12, -4, 24, 5, 2, d.primary);
  oval(-4, 3, 2, 2, "#292039");
  oval(4, 3, 2, 2, "#292039");
  box(-17, -30, 10, 6, 3, "#fff7ba");
  box(7, -30, 10, 6, 3, "#fff7ba");
  box(-16, 25, 32, 6, 3, "#ffdc93");
  if (armed && game.weaponFlash > 0) {
    oval(0, -53, 18 + game.weaponFlash * 70, 12 + game.weaponFlash * 40, weapons[game.selectedWeapon].color + "99");
  }
  if (shield) {
    oval(0, 0, 36, 47, "#79ecff45");
    ctx.strokeStyle = "#8bffff";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

function rexX() {
  return 480 + Math.sin(game.elapsed * 1.55) * 145;
}

function creature(x, y, dragon = false, gaming = false) {
  ctx.save();
  ctx.translate(x, y);
  const base = dragon ? "#e76eab" : "#54bb74";
  const dark = dragon ? "#98487d" : "#256b58";
  if (!gaming && game && game.enemyStun > 0) {
    for (let i = 0; i < 3; i++) {
      const angle = sceneTime * 5 + i * Math.PI * 2 / 3;
      oval(Math.cos(angle) * 55, -48 + Math.sin(angle) * 10, 8, 8, "#ffe86e");
    }
  }
  oval(0, 52, 76, 21, "#24244155");
  if (dragon) {
    poly(dark, -21, 20, -105, -39, -95, 24, -55, 20, -33, 46);
    poly(dark, 21, 20, 105, -39, 95, 24, 55, 20, 33, 46);
    poly("#ffafba", -31, 13, -90, -28, -82, 13, -53, 10);
    poly("#ffafba", 31, 13, 90, -28, 82, 13, 53, 10);
    poly("#ffd070", -39, -21, -44, -56, -19, -32);
    poly("#ffd070", 39, -21, 44, -56, 19, -32);
  } else {
    poly(dark, -29, 45, -103, 69, -128, 52, -99, 52, -47, 12);
    for (let i = 0; i < 3; i++) poly("#ffd26c", -48 + i * 22, -20, -40 + i * 22, -43, -25 + i * 22, -20);
  }
  oval(0, 37, 52, 36, dark);
  oval(0, 4, 52, 38, base);
  for (const dx of [-22, 22]) {
    oval(dx, -9, 12, 14, "#fff4cf");
    oval(dx + (gaming ? 0 : 2), gaming ? -3 : -8, 5, 7, "#212241");
  }
  box(-34, 11, 68, 25, 12, dark);
  for (const dx of [-19, 4, 19]) poly("#fff6ce", dx - 6, 14, dx + 6, 14, dx, 23);
  if (gaming) {
    const bob = Math.sin(sceneTime * 12) * 3;
    oval(-46, 60 + bob, 17, 12, base);
    oval(46, 60 + bob, 17, 12, base);
    box(-43, 44 + bob, 86, 31, 13, "#28233e", "#9687bb");
    box(-28, 56 + bob, 18, 5, 1, "#f1e5ff");
    box(-22, 50 + bob, 5, 17, 1, "#f1e5ff");
    oval(17, 59 + bob, 4, 4, "#ffcf65");
    oval(29, 54 - bob, 4, 4, "#73ffdb");
  }
  ctx.restore();
}

function robot(x, y) {
  ctx.save();
  ctx.translate(x, y);
  oval(0, 61, 91, 19, "#22234088");
  for (const side of [-1, 1]) {
    box(side * 73 - 18, -1, 36, 66, 13, "#8f8dbd", "#303057");
    oval(side * 73, 52, 10, 9, "#ff97d5");
  }
  box(-59, -8, 118, 69, 16, game.weaponFlash > 0 ? "#e9faff" : "#6771a7", "#323258");
  oval(0, 29, 24, 22, "#22264b");
  oval(0, 29, 15 + Math.sin(sceneTime * 8) * 2, 14, "#ff88ca");
  box(-43, -53, 86, 60, 16, "#b6b9e4", "#323258");
  box(-32, -34, 64, 24, 9, "#363659");
  box(-24, -28, 16, 11, 3, "#75ffed");
  box(8, -28, 16, 11, 3, "#75ffed");
  box(-3, -68, 6, 17, 2, "#c7c8e9");
  oval(0, -69, 8, 8, "#ffd171");
  ctx.restore();
}

function object(e) {
  const { x, y, kind } = e;
  if (kind === "rock") {
    oval(x, y + 14, 28, 10, "#25234275");
    poly("#313351", x - 26, y + 10, x - 18, y - 13, x + 4, y - 23, x + 23, y - 12, x + 28, y + 12, x + 8, y + 19, x - 13, y + 18);
    poly("#777694", x - 19, y + 7, x - 12, y - 9, x + 4, y - 18, x + 15, y - 10, x + 5, y + 6);
  } else if (kind === "coin") {
    const width = 9 + 5 * Math.abs(Math.sin(sceneTime * 9 + y * .025));
    oval(x, y, width + 2, 15, "#a85d26");
    oval(x, y - 2, width, 13, "#ffd955");
    box(x - 2, y - 9, 4, 13, 2, "#fff4a1");
  } else if (kind === "shield" || kind === "turbo") {
    box(x - 16, y - 16, 32, 32, 9, kind === "shield" ? "#50d9ee" : "#ffd36b", "#283357");
    if (kind === "shield") poly("#245987", x - 8, y - 7, x, y - 10, x + 8, y - 7, x + 7, y + 4, x, y + 11, x - 7, y + 4);
    else poly("#843d72", x + 3, y - 12, x - 9, y + 2, x - 1, y + 2, x - 3, y + 12, x + 9, y - 3, x + 2, y - 3);
  } else if (kind === "energy") {
    box(x - 5, y - 12, 10, 27, 5, "#63fcff");
    box(x - 2, y - 10, 4, 18, 2, "#efffff");
  } else if (kind === "missile") {
    poly("#ff6f61", x - 8, y + 12, x - 11, y + 23, x, y + 17, x + 11, y + 23, x + 8, y + 12);
    box(x - 8, y - 14, 16, 31, 7, "#d7e3f3", "#303552");
    poly("#ffcf72", x - 8, y - 8, x, y - 21, x + 8, y - 8);
  } else if (kind === "shockwave") {
    oval(x, y, 27 + Math.sin(sceneTime * 18) * 5, 11, "#fb70ff77");
    ctx.strokeStyle = "#ffe2ff"; ctx.lineWidth = 3; ctx.stroke();
  } else {
    const fire = kind === "fire";
    oval(x, y - 8, 11, 24, fire ? "#fc596a" : "#ad6aff");
    oval(x, y, 16, 17, fire ? "#ff9442" : "#f077d7");
    oval(x, y + 2, 8, 9, fire ? "#fff19a" : "#ffe4fc");
  }
}

function draw() {
  const demo = mode === "menu" || mode === "choose";
  const phase = demo ? 1 : game.phase;
  landscape(phase);
  if (demo) {
    creature(746, 310);
    creature(197, 166, true);
    car(315, 456, "Pedro", true);
    car(655, 487, "Henry", true);
    for (let i = 0; i < 6; i++) object({ x: 315 + i * 63, y: 542 + Math.sin(i) * 16, kind: "coin" });
    return;
  }
  if (mode === "cutscene") {
    box(245, 404, 470, 170, 22, "#29264d", "#d19bea");
    box(275, 427, 142, 111, 12, "#151b35", "#747ab1");
    box(287, 439, 118, 82, 5, "#5260a2");
    poly("#313652", 291, 520, 324, 463, 370, 463, 402, 520);
    const toyY = 475 + Math.sin(sceneTime * 4) * 8;
    box(337, toyY, 18, 27, 4, "#8bf6dc");
    oval(375, 495 - Math.sin(sceneTime * 5) * 12, 5, 5, "#ffd36b");
    creature(554, 467, true, true);
    return;
  }
  if (phase === 1) creature(rexX(), 591);
  if (phase === 2) creature(game.bossX, 123, true);
  if (phase === 3) robot(game.bossX, 135);
  if (phase === 3) {
    box(330, 76, 300, 18, 9, "#272844", "#e5def7");
    box(335, 81, 290 * Math.max(0, game.bossHealth / game.bossMaxHealth), 8, 4, "#ff62b7");
    ctx.fillStyle = "#fff"; ctx.font = "bold 14px system-ui"; ctx.textAlign = "center";
    ctx.fillText("ROBÔ GIGANTE", 480, 68);
  }
  game.entities.forEach(object);
  if (game.invincible <= 0 || Math.floor(sceneTime * 15) % 2 === 0 || mode !== "race") {
    car(game.x, game.y, driver, game.boosting, game.shield);
  }
  if (game.laserBeam > 0) {
    const glow = 12 + Math.sin(sceneTime * 50) * 4;
    ctx.save(); ctx.globalCompositeOperation = "screen";
    box(game.x - glow, 80, glow * 2, game.y - 120, glow, "#ff5bdb66");
    box(game.x - 4, 80, 8, game.y - 120, 4, "#fff5ff"); ctx.restore();
  }
  if (game.bombWave > 0) {
    ctx.beginPath(); ctx.arc(game.x, game.y, (1 - game.bombWave / .65) * 420, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff184"; ctx.lineWidth = 8 * game.bombWave; ctx.stroke();
  }
  for (const p of game.particles) oval(p.x, p.y, p.size || 4, p.size || 4, p.color);
}

const controls = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "shift", " ", "m", "l", "b"]);
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "escape" && !event.repeat) {
    if (mode === "race") pause();
    else if (mode === "paused") screen("race");
  }
  if (mode === "race" && controls.has(key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (key === " " && event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    keys.add(key);
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => { if (mode === "race") pause(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "race") pause(); });
function cycleWeapon() {
  const names = Object.keys(weapons);
  const current = game ? names.indexOf(game.selectedWeapon) : 0;
  if (game) game.selectedWeapon = names[(current + 1) % names.length];
  tone([420, 620]);
  if (game) updateHud();
}

$("touch").querySelectorAll("button").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.classList.add("is-held");
    if (button.dataset.action === "swap") cycleWeapon();
    else if (button.dataset.action === "pause") pause();
    else held.set(event.pointerId, button.dataset.action || button.dataset.key);
    try { button.setPointerCapture(event.pointerId); } catch { /* Synthetic and older touch events may not be capturable. */ }
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(name, (event) => {
      held.delete(event.pointerId);
      button.classList.remove("is-held");
    });
  }
});
document.addEventListener("touchmove", (event) => {
  if (mode === "race") event.preventDefault();
}, { passive: false });
$("sound").textContent = muted ? "Som desligado" : "Som ligado";
$("sound").setAttribute("aria-pressed", String(!muted));
$("sound").addEventListener("click", () => {
  muted = !muted;
  progress.sound = !muted;
  saveProgress();
  $("sound").textContent = muted ? "Som desligado" : "Som ligado";
  $("sound").setAttribute("aria-pressed", String(!muted));
  tone([580]);
  if (mode === "race") $("sound").blur();
});

function frame(timestamp) {
  const dt = previous ? Math.min(.032, (timestamp - previous) / 1000) : 0;
  previous = timestamp;
  if (mode !== "paused") sceneTime += dt;
  if (mode === "race") update(dt);
  else if (mode === "menu" || mode === "choose") scroll += 110 * dt;
  draw();
  requestAnimationFrame(frame);
}

menu();
requestAnimationFrame(frame);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "OFFLINE_READY") $("offline-ready").hidden = false;
  });
  navigator.serviceWorker.register("service-worker.js").then(() => navigator.serviceWorker.ready).then((registration) => {
    (registration.active || registration.waiting).postMessage({ type: "CHECK_OFFLINE" });
    return caches.match(new URL("./index.html", location.href).href);
  }).then((cachedIndex) => {
    if (cachedIndex) $("offline-ready").hidden = false;
  }).catch(() => { /* The game remains playable when service workers are unavailable. */ });
}
