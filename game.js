const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreLabel = document.getElementById("score");
const bestScoreLabel = document.getElementById("best-score");
const characterGrid = document.getElementById("character-grid");
const selectedCharacterCard = document.getElementById("selected-character-card");
const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");
const startOverlay = document.getElementById("start-overlay");
const gameoverOverlay = document.getElementById("gameover-overlay");
const gameoverScore = document.getElementById("gameover-score");
const gameoverTitle = document.getElementById("gameover-title");
const characterModal = document.getElementById("character-modal");
const openCharacterModalButton = document.getElementById("open-character-modal");
const closeCharacterModalButton = document.getElementById("close-character-modal");
const overlayCharacterButton = document.getElementById("overlay-character-button");
const body = document.body;
const touchState = {
  startX: 0,
  startY: 0,
};

const characterOptions = [
  { id: "jthis", label: "저스디스", subtitle: "빠르게 노선을 읽는 래퍼", src: "./assets/Jthis.png" },
  { id: "lilboi", label: "릴보이", subtitle: "가볍게 흐름을 타는 러너", src: "./assets/lilboi.png" },
  { id: "deepflow", label: "딥플로우", subtitle: "묵직하게 레인을 지배", src: "./assets/deepflow.png" },
];

const images = Object.fromEntries(
  characterOptions.map((character) => {
    const img = new Image();
    img.src = character.src;
    return [character.id, img];
  }),
);
const processedImages = {};
const lyricScripts = window.LYRIC_SCRIPTS || {};
const snakePalettes = [
  { body: "#6dde57", belly: "#d8ff9e", tongue: "#ff6678" },
  { body: "#ff5f57", belly: "#ffd3a8", tongue: "#ffe57a" },
  { body: "#4b8cff", belly: "#bdd6ff", tongue: "#ff7bc8" },
];

const bestKey = "switch-lanes-best-score";

const state = {
  selectedCharacterId: characterOptions[0].id,
  status: "idle",
  laneCenters: [canvas.width * 0.25, canvas.width * 0.5, canvas.width * 0.75],
  player: null,
  obstacles: [],
  particles: [],
  score: 0,
  bestScore: Number(localStorage.getItem(bestKey) || 0),
  distance: 0,
  speed: 460,
  spawnTimer: 0,
  flashTimer: 0,
  lyricIndex: 0,
  lyricTimer: 0,
  currentLyric: "",
  lastTime: 0,
};

function resetPlayer() {
  state.player = {
    lane: 1,
    targetLane: 1,
    x: state.laneCenters[1],
    y: canvas.height - 170,
    width: 102,
    height: 120,
    jumping: false,
    jumpVelocity: 0,
    jumpOffset: 0,
    sliding: false,
    slideTimer: 0,
    invulnerable: 0,
  };
}

function buildTransparentCharacterImage(sourceImage) {
  if (!sourceImage.complete || !sourceImage.naturalWidth || !sourceImage.naturalHeight) {
    return sourceImage;
  }

  const offscreen = document.createElement("canvas");
  offscreen.width = sourceImage.naturalWidth;
  offscreen.height = sourceImage.naturalHeight;
  const offscreenCtx = offscreen.getContext("2d", { willReadFrequently: true });
  offscreenCtx.drawImage(sourceImage, 0, 0);

  const imageData = offscreenCtx.getImageData(0, 0, offscreen.width, offscreen.height);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);

    if (brightness > 245 && spread < 18) {
      data[i + 3] = 0;
      continue;
    }

    if (brightness > 228 && spread < 28) {
      data[i + 3] = Math.max(0, Math.round(data[i + 3] * 0.2));
    }
  }

  offscreenCtx.putImageData(imageData, 0, 0);
  return offscreen;
}

function prepareCharacterImages() {
  characterOptions.forEach((character) => {
    const img = images[character.id];

    const finalize = () => {
      processedImages[character.id] = buildTransparentCharacterImage(img);
      if (state.selectedCharacterId === character.id) {
        drawScene();
      }
      renderCharacterCards();
    };

    if (img.complete && img.naturalWidth) {
      finalize();
    } else {
      img.addEventListener("load", finalize, { once: true });
    }
  });
}

function getCharacterPreviewSrc(characterId) {
  const rendered = processedImages[characterId];
  if (rendered && typeof rendered.toDataURL === "function") {
    return rendered.toDataURL();
  }
  const character = characterOptions.find((option) => option.id === characterId);
  return character ? character.src : "";
}

function renderSelectedCharacterCard() {
  const character = currentCharacter();
  selectedCharacterCard.innerHTML = `
    <img src="${getCharacterPreviewSrc(character.id)}" alt="${character.label}" />
    <div class="selected-character-copy">
      <strong>${character.label}</strong>
      <span>${character.subtitle}</span>
    </div>
  `;
}

function resetRun() {
  resetPlayer();
  state.obstacles = [];
  state.particles = [];
  state.score = 0;
  state.distance = 0;
  state.speed = 460;
  state.spawnTimer = 0.65;
  state.flashTimer = 0;
  state.lyricIndex = 0;
  state.lyricTimer = 0.2;
  state.currentLyric = "";
  scoreLabel.textContent = "0";
}

function currentLyrics() {
  const script = lyricScripts[state.selectedCharacterId];
  return Array.isArray(script) ? script.filter((line) => typeof line === "string" && line.trim()) : [];
}

function advanceLyric() {
  const script = currentLyrics();
  if (!script.length) {
    state.currentLyric = "";
    state.lyricTimer = 0;
    return;
  }

  const line = script[state.lyricIndex % script.length].trim();
  state.currentLyric = line;
  state.lyricIndex = (state.lyricIndex + 1) % script.length;

  const baseDuration = 1.6;
  const readingDuration = Math.min(3.8, line.length * 0.065);
  state.lyricTimer = baseDuration + readingDuration;
}

function renderCharacterCards() {
  characterGrid.innerHTML = "";

  characterOptions.forEach((character) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `character-card${state.selectedCharacterId === character.id ? " selected" : ""}`;
    card.dataset.characterId = character.id;
    card.innerHTML = `
      <img src="${processedImages[character.id]?.toDataURL ? processedImages[character.id].toDataURL() : character.src}" alt="${character.label}" />
      <div class="character-info">
        <strong>${character.label}</strong>
        <span>${character.subtitle}</span>
      </div>
    `;

    card.addEventListener("click", () => {
      state.selectedCharacterId = character.id;
      renderCharacterCards();
      renderSelectedCharacterCard();
      closeCharacterModal();
      if (state.status === "idle") {
        startGame();
      } else {
        drawScene();
      }
    });

    characterGrid.appendChild(card);
  });
}

function openCharacterModal() {
  characterModal.classList.remove("hidden");
}

function closeCharacterModal() {
  characterModal.classList.add("hidden");
}

function syncScrollLock() {
  body.classList.toggle("game-running", state.status === "running");
}

function startGame() {
  resetRun();
  state.status = "running";
  startOverlay.classList.add("hidden");
  gameoverOverlay.classList.add("hidden");
  closeCharacterModal();
  syncScrollLock();
}

function endGame() {
  state.status = "gameover";
  state.bestScore = Math.max(state.bestScore, Math.floor(state.score));
  localStorage.setItem(bestKey, String(state.bestScore));
  bestScoreLabel.textContent = String(state.bestScore);
  gameoverTitle.textContent = `${currentCharacter().label}의 러닝 종료`;
  gameoverScore.textContent = `점수 ${Math.floor(state.score)}`;
  gameoverOverlay.classList.remove("hidden");
  syncScrollLock();
}

function currentCharacter() {
  return characterOptions.find((character) => character.id === state.selectedCharacterId) || characterOptions[0];
}

function moveLane(direction) {
  if (state.status !== "running") {
    return;
  }

  const player = state.player;
  player.targetLane = Math.max(0, Math.min(2, player.targetLane + direction));
}

function jump() {
  if (state.status !== "running") {
    return;
  }

  const player = state.player;
  if (!player.jumping && !player.sliding) {
    player.jumping = true;
    player.jumpVelocity = 1050;
  }
}

function slide() {
  if (state.status !== "running") {
    return;
  }

  const player = state.player;
  if (!player.jumping && !player.sliding) {
    player.sliding = true;
    player.slideTimer = 0.72;
  }
}

function spawnObstacle() {
  const lane = Math.floor(Math.random() * 3);
  const typeRoll = Math.random();

  let obstacle;
  if (typeRoll < 0.4) {
    const palette = snakePalettes[Math.floor(Math.random() * snakePalettes.length)];
    obstacle = {
      kind: "ground",
      lane,
      x: state.laneCenters[lane],
      y: -180,
      width: 122,
      height: 82,
      palette,
      requires: "jump",
    };
  } else if (typeRoll < 0.76) {
    const palette = snakePalettes[Math.floor(Math.random() * snakePalettes.length)];
    obstacle = {
      kind: "high",
      lane,
      x: state.laneCenters[lane],
      y: -210,
      width: 124,
      height: 144,
      palette,
      requires: "slide",
    };
  } else {
    const palette = snakePalettes[Math.floor(Math.random() * snakePalettes.length)];
    obstacle = {
      kind: "wide",
      lane,
      x: state.laneCenters[lane],
      y: -240,
      width: 132,
      height: 170,
      palette,
      requires: "either",
    };
  }

  state.obstacles.push(obstacle);
}

function emitCrashParticles(x, y) {
  for (let i = 0; i < 18; i += 1) {
    state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 320,
      vy: (Math.random() - 0.4) * 320,
      size: 6 + Math.random() * 8,
      life: 0.6 + Math.random() * 0.35,
    });
  }
}

function update(dt) {
  if (state.status !== "running") {
    updateParticles(dt);
    return;
  }

  const player = state.player;

  state.distance += dt * state.speed;
  state.score += dt * (state.speed * 0.1);
  state.speed += dt * 16;
  state.spawnTimer -= dt;
  state.flashTimer = Math.max(0, state.flashTimer - dt);
  state.lyricTimer -= dt;
  scoreLabel.textContent = String(Math.floor(state.score));

  if (state.lyricTimer <= 0) {
    advanceLyric();
  }

  if (state.spawnTimer <= 0) {
    spawnObstacle();
    state.spawnTimer = Math.max(0.34, 0.88 - state.speed / 1800 + Math.random() * 0.16);
  }

  const targetX = state.laneCenters[player.targetLane];
  player.x += (targetX - player.x) * Math.min(1, dt * 14);
  player.lane = Math.abs(targetX - player.x) < 1.5 ? player.targetLane : player.lane;

  if (player.jumping) {
    player.jumpOffset += player.jumpVelocity * dt;
    player.jumpVelocity -= 2150 * dt;
    if (player.jumpOffset <= 0) {
      player.jumpOffset = 0;
      player.jumpVelocity = 0;
      player.jumping = false;
    }
  }

  if (player.sliding) {
    player.slideTimer -= dt;
    if (player.slideTimer <= 0) {
      player.sliding = false;
      player.slideTimer = 0;
    }
  }

  player.invulnerable = Math.max(0, player.invulnerable - dt);

  state.obstacles.forEach((obstacle) => {
    obstacle.y += state.speed * dt;
  });
  state.obstacles = state.obstacles.filter((obstacle) => obstacle.y < canvas.height + 220);

  detectCollisions();
  updateParticles(dt);
}

function detectCollisions() {
  const player = state.player;
  const playerBox = getPlayerBounds();

  for (const obstacle of state.obstacles) {
    const obstacleBox = getObstacleBounds(obstacle);

    const overlaps =
      playerBox.x < obstacleBox.x + obstacleBox.width &&
      playerBox.x + playerBox.width > obstacleBox.x &&
      playerBox.y < obstacleBox.y + obstacleBox.height &&
      playerBox.y + playerBox.height > obstacleBox.y;

    if (!overlaps) {
      continue;
    }

    const clearedByJump = obstacle.requires === "jump" && player.jumpOffset > 70;
    const clearedBySlide = obstacle.requires === "slide" && player.sliding;
    const clearedByEither = obstacle.requires === "either" && (player.jumpOffset > 90 || player.sliding);

    if (clearedByJump || clearedBySlide || clearedByEither) {
      continue;
    }

    emitCrashParticles(player.x, player.y - player.jumpOffset);
    state.flashTimer = 0.22;
    endGame();
    break;
  }
}

function getPlayerBounds() {
  const player = state.player;
  const drawWidth = player.sliding ? player.width + 28 : player.width;
  const drawHeight = player.sliding ? player.height * 0.68 : player.height;
  const width = drawWidth * (player.sliding ? 0.44 : 0.52);
  const height = drawHeight * (player.sliding ? 0.42 : 0.56);
  const x = player.x - width * 0.5;
  const y = player.y - player.jumpOffset - drawHeight + drawHeight * (player.sliding ? 0.14 : 0.18);

  return {
    x,
    y,
    width,
    height,
  };
}

function getObstacleBounds(obstacle) {
  let widthScale = 0.44;
  let heightScale = 0.68;
  let yOffset = 0.02;

  if (obstacle.kind === "ground") {
    widthScale = 0.56;
    heightScale = 0.42;
    yOffset = 0.16;
  } else if (obstacle.kind === "high") {
    widthScale = 0.48;
    heightScale = 0.72;
    yOffset = -0.04;
  }

  const width = obstacle.width * widthScale;
  const height = obstacle.height * heightScale;

  return {
    x: obstacle.x - width * 0.5,
    y: obstacle.y - height * 0.5 + obstacle.height * yOffset,
    width,
    height,
  };
}

function updateParticles(dt) {
  state.particles.forEach((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 540 * dt;
    particle.life -= dt;
  });
  state.particles = state.particles.filter((particle) => particle.life > 0);
}

function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBackground();
  drawLanes();
  drawTrackMarks();
  drawObstacles();
  drawPlayer();
  drawLyricBubble();
  drawParticles();
  drawTopCaption();

  if (state.flashTimer > 0) {
    ctx.fillStyle = `rgba(255, 107, 107, ${state.flashTimer * 0.8})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#67c7ff");
  gradient.addColorStop(0.5, "#3d82c5");
  gradient.addColorStop(1, "#183a66");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 16; i += 1) {
    const size = 22 + (i % 4) * 12;
    const x = (i * 87 + state.distance * 0.025) % (canvas.width + 140) - 70;
    const y = ((i * 103) % (canvas.height * 0.45)) - 60;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255, 244, 180, 0.12)" : "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLanes() {
  const laneWidth = canvas.width / 3;

  for (let lane = 0; lane < 3; lane += 1) {
    ctx.fillStyle = lane === 0 ? "#346cad" : lane === 1 ? "#2d639e" : "#2b5c92";
    ctx.fillRect(lane * laneWidth, 0, laneWidth, canvas.height);

    ctx.fillStyle = "rgba(21, 42, 81, 0.38)";
    ctx.fillRect(lane * laneWidth + laneWidth * 0.08, 0, laneWidth * 0.84, canvas.height);
  }

  ctx.strokeStyle = "rgba(255, 245, 208, 0.24)";
  ctx.lineWidth = 4;
  for (let lane = 1; lane < 3; lane += 1) {
    ctx.beginPath();
    ctx.moveTo(lane * laneWidth, 0);
    ctx.lineTo(lane * laneWidth, canvas.height);
    ctx.stroke();
  }
}

function drawTrackMarks() {
  const laneWidth = canvas.width / 3;
  const sleeperHeight = 18;
  const sleeperGap = 42;
  const sleeperOffset = state.distance % (sleeperHeight + sleeperGap);

  for (let lane = 0; lane < 3; lane += 1) {
    const laneX = lane * laneWidth;
    const railLeft = laneX + laneWidth * 0.28;
    const railRight = laneX + laneWidth * 0.72;

    ctx.fillStyle = "#d6dbe6";
    ctx.fillRect(railLeft - 5, 0, 10, canvas.height);
    ctx.fillRect(railRight - 5, 0, 10, canvas.height);

    ctx.fillStyle = "rgba(68, 35, 14, 0.74)";
    for (let y = -sleeperHeight; y < canvas.height + sleeperHeight; y += sleeperHeight + sleeperGap) {
      ctx.fillRect(railLeft - 14, y + sleeperOffset, (railRight - railLeft) + 28, sleeperHeight);
    }

    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(railLeft - 2, 0, 3, canvas.height);
    ctx.fillRect(railRight - 2, 0, 3, canvas.height);
  }

  const sparkleGap = 86;
  const sparkleOffset = state.distance % sparkleGap;
  ctx.fillStyle = "rgba(255, 237, 169, 0.18)";
  for (let lane = 0; lane < 3; lane += 1) {
    const laneX = lane * laneWidth;
    for (let y = -20; y < canvas.height + 20; y += sparkleGap) {
      ctx.fillRect(laneX + laneWidth * 0.46, y + sparkleOffset, laneWidth * 0.08, 20);
    }
  }
}

function drawObstacleSnake(obstacle) {
  const x = obstacle.x;
  const y = obstacle.y;
  const radius = obstacle.width * 0.24;
  const segmentCount = obstacle.kind === "ground" ? 4 : obstacle.kind === "high" ? 5 : 6;
  const bodyTone = obstacle.palette?.body || "#6dde57";
  const bellyTone = obstacle.palette?.belly || "#d8ff9e";
  const tongueTone = obstacle.palette?.tongue || "#ff6678";
  const headWidth = radius * (obstacle.kind === "wide" ? 1.45 : 1.3);
  const headHeight = radius * (obstacle.kind === "ground" ? 1.2 : 1.36);
  const anim = state.distance * 0.02;

  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(3, 12, 7, 0.42)";
  ctx.lineWidth = 3.2;

  for (let i = 0; i < segmentCount; i += 1) {
    const t = i / Math.max(1, segmentCount - 1);
    const wiggle = Math.sin(anim + i * 0.92) * (12 - t * 3);
    const segY = -obstacle.height * 0.22 + t * obstacle.height * 0.92;
    const segX = wiggle;
    const segR = radius * (1 - t * 0.12);

    ctx.fillStyle = bodyTone;
    ctx.beginPath();
    ctx.ellipse(segX, segY, segR, segR * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(6, 20, 8, 0.18)";
    ctx.beginPath();
    ctx.arc(segX - segR * 0.14, segY - segR * 0.08, segR * 0.18, 0, Math.PI * 2);
    ctx.arc(segX + segR * 0.14, segY + segR * 0.02, segR * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(0, -obstacle.height * 0.58);
  ctx.quadraticCurveTo(headWidth, -obstacle.height * 0.5, headWidth * 0.74, -obstacle.height * 0.34);
  ctx.quadraticCurveTo(0, -obstacle.height * 0.34 + headHeight * 0.3, -headWidth * 0.74, -obstacle.height * 0.34);
  ctx.quadraticCurveTo(-headWidth, -obstacle.height * 0.5, 0, -obstacle.height * 0.58);
  ctx.fillStyle = bodyTone;
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#07131c";
  ctx.beginPath();
  ctx.ellipse(-headWidth * 0.34, -obstacle.height * 0.44, 5, 8, -0.18, 0, Math.PI * 2);
  ctx.ellipse(headWidth * 0.34, -obstacle.height * 0.44, 5, 8, 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#d7ff7d";
  ctx.beginPath();
  ctx.moveTo(0, -obstacle.height * 0.5);
  ctx.quadraticCurveTo(headWidth * 0.52, -obstacle.height * 0.42, headWidth * 0.3, -obstacle.height * 0.31);
  ctx.lineTo(-headWidth * 0.3, -obstacle.height * 0.31);
  ctx.quadraticCurveTo(-headWidth * 0.52, -obstacle.height * 0.42, 0, -obstacle.height * 0.5);
  ctx.fillStyle = bellyTone;
  ctx.fill();

  ctx.fillStyle = "#f8f3ed";
  ctx.beginPath();
  ctx.moveTo(-headWidth * 0.18, -obstacle.height * 0.31);
  ctx.lineTo(-headWidth * 0.08, -obstacle.height * 0.22);
  ctx.lineTo(-0.5, -obstacle.height * 0.31);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(headWidth * 0.18, -obstacle.height * 0.31);
  ctx.lineTo(headWidth * 0.08, -obstacle.height * 0.22);
  ctx.lineTo(0.5, -obstacle.height * 0.31);
  ctx.fill();

  ctx.strokeStyle = tongueTone;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, -obstacle.height * 0.28);
  ctx.lineTo(0, -obstacle.height * 0.14);
  ctx.moveTo(0, -obstacle.height * 0.14);
  ctx.lineTo(-11, -obstacle.height * 0.08);
  ctx.moveTo(0, -obstacle.height * 0.14);
  ctx.lineTo(11, -obstacle.height * 0.08);
  ctx.stroke();

  ctx.strokeStyle = "rgba(214, 255, 160, 0.9)";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.44, -obstacle.height * 0.06);
  ctx.quadraticCurveTo(0, obstacle.height * 0.02, radius * 0.44, -obstacle.height * 0.06);
  ctx.moveTo(-radius * 0.34, obstacle.height * 0.16);
  ctx.quadraticCurveTo(0, obstacle.height * 0.24, radius * 0.34, obstacle.height * 0.16);
  ctx.stroke();

  ctx.restore();
}

function drawObstacles() {
  state.obstacles.forEach(drawObstacleSnake);
}

function drawPlayer() {
  const player = state.player;
  const img = processedImages[state.selectedCharacterId] || images[state.selectedCharacterId];
  const drawWidth = player.sliding ? player.width + 28 : player.width;
  const drawHeight = player.sliding ? player.height * 0.68 : player.height;
  const x = player.x - drawWidth * 0.5;
  const y = player.y - player.jumpOffset - drawHeight;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "rgba(7, 18, 28, 0.22)";
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + 6, 56, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const canRender =
    img &&
    ((typeof HTMLCanvasElement !== "undefined" && img instanceof HTMLCanvasElement) ||
      (typeof HTMLImageElement !== "undefined" && img instanceof HTMLImageElement && img.complete));

  if (canRender) {
    ctx.drawImage(img, x, y, drawWidth, drawHeight);
  } else {
    ctx.fillStyle = "#f4fbff";
    ctx.fillRect(x, y, drawWidth, drawHeight);
  }

  if (state.status === "running") {
    ctx.fillStyle = "rgba(4, 10, 18, 0.48)";
    ctx.fillRect(x, y + drawHeight - 24, drawWidth, 24);
  }
}

function drawParticles() {
  state.particles.forEach((particle) => {
    ctx.fillStyle = `rgba(255, 209, 102, ${Math.max(0, particle.life)})`;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  });
}

function wrapTextLines(text, maxWidth) {
  if (!text) {
    return [];
  }

  const words = text.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  if (lines.length === 1 && ctx.measureText(lines[0]).width > maxWidth) {
    const chars = [...text];
    const splitLines = [];
    let charLine = "";
    for (const char of chars) {
      const next = charLine + char;
      if (ctx.measureText(next).width <= maxWidth || !charLine) {
        charLine = next;
      } else {
        splitLines.push(charLine);
        charLine = char;
      }
    }
    if (charLine) {
      splitLines.push(charLine);
    }
    return splitLines;
  }

  return lines;
}

function drawLyricBubble() {
  if (state.status !== "running" || !state.currentLyric) {
    return;
  }

  const player = state.player;
  const bubbleWidth = Math.min(canvas.width - 44, 320);
  const bubbleX = Math.max(22, Math.min(canvas.width - bubbleWidth - 22, player.x - bubbleWidth * 0.5));
  const bubbleTipX = Math.max(bubbleX + 26, Math.min(bubbleX + bubbleWidth - 26, player.x));
  const bubbleY = Math.max(88, player.y - player.jumpOffset - 210);

  ctx.save();
  ctx.font = '700 20px "SUIT", "Pretendard", sans-serif';
  const lines = wrapTextLines(state.currentLyric, bubbleWidth - 34);
  const lineHeight = 28;
  const bubbleHeight = 28 + lines.length * lineHeight;

  ctx.fillStyle = "rgba(6, 18, 29, 0.9)";
  ctx.strokeStyle = "rgba(255, 228, 94, 0.64)";
  ctx.lineWidth = 2;

  const radius = 18;
  ctx.beginPath();
  ctx.moveTo(bubbleX + radius, bubbleY);
  ctx.lineTo(bubbleX + bubbleWidth - radius, bubbleY);
  ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + radius);
  ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - radius);
  ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - radius, bubbleY + bubbleHeight);
  ctx.lineTo(bubbleTipX + 14, bubbleY + bubbleHeight);
  ctx.lineTo(bubbleTipX, bubbleY + bubbleHeight + 18);
  ctx.lineTo(bubbleTipX - 14, bubbleY + bubbleHeight);
  ctx.lineTo(bubbleX + radius, bubbleY + bubbleHeight);
  ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleHeight, bubbleX, bubbleY + bubbleHeight - radius);
  ctx.lineTo(bubbleX, bubbleY + radius);
  ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fff8e5";
  lines.forEach((line, index) => {
    ctx.fillText(line, bubbleX + 17, bubbleY + 29 + index * lineHeight);
  });
  ctx.restore();
}

function drawTopCaption() {
  ctx.fillStyle = "rgba(23, 35, 70, 0.54)";
  ctx.fillRect(18, 16, 208, 64);
  ctx.fillStyle = "#ffe45e";
  ctx.font = '700 20px "Pretendard", sans-serif';
  ctx.fillText(currentCharacter().label, 30, 42);
  ctx.fillStyle = "rgba(255, 249, 235, 0.92)";
  ctx.font = '600 16px "Pretendard", sans-serif';
  ctx.fillText(`속도 ${Math.floor(state.speed)}`, 30, 66);
}

function handleKeydown(event) {
  if (["ArrowLeft", "a", "A"].includes(event.key)) {
    moveLane(-1);
  }
  if (["ArrowRight", "d", "D"].includes(event.key)) {
    moveLane(1);
  }
  if (["ArrowUp", "w", "W", " "].includes(event.key)) {
    event.preventDefault();
    jump();
  }
  if (["ArrowDown", "s", "S"].includes(event.key)) {
    event.preventDefault();
    slide();
  }
  if (event.key === "Enter" && state.status !== "running") {
    startGame();
  }
}

function handleTouchStart(event) {
  const touch = event.changedTouches[0];
  touchState.startX = touch.clientX;
  touchState.startY = touch.clientY;
}

function handleTouchEnd(event) {
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchState.startX;
  const dy = touch.clientY - touchState.startY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (Math.max(absX, absY) < 28) {
    return;
  }

  if (absX > absY) {
    moveLane(dx > 0 ? 1 : -1);
    return;
  }

  if (dy < 0) {
    jump();
  } else {
    slide();
  }
}

function handleTouchMove(event) {
  if (state.status === "running") {
    event.preventDefault();
  }
}

function loop(timestamp) {
  if (!state.lastTime) {
    state.lastTime = timestamp;
  }

  const dt = Math.min(0.032, (timestamp - state.lastTime) / 1000);
  state.lastTime = timestamp;

  update(dt);
  drawScene();
  requestAnimationFrame(loop);
}

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
openCharacterModalButton.addEventListener("click", openCharacterModal);
closeCharacterModalButton.addEventListener("click", closeCharacterModal);
overlayCharacterButton.addEventListener("click", openCharacterModal);
characterModal.addEventListener("click", (event) => {
  if (event.target === characterModal) {
    closeCharacterModal();
  }
});
window.addEventListener("keydown", handleKeydown);
canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
canvas.addEventListener("touchend", handleTouchEnd, { passive: true });
canvas.addEventListener("touchmove", handleTouchMove, { passive: false });

bestScoreLabel.textContent = String(state.bestScore);
prepareCharacterImages();
renderCharacterCards();
renderSelectedCharacterCard();
resetPlayer();
syncScrollLock();
drawScene();
requestAnimationFrame(loop);
