(() => {
  "use strict";

  // ============================================================
  // ANCESTORS - 神に導かれし部族 -
  // HTML Canvas + JavaScript only. No image assets, no engine.
  // ============================================================

  const SAVE_KEY = "ancestors_milestone_1_save";
  const PORTRAIT_W = 640;
  const PORTRAIT_H = 940;
  const LANDSCAPE_W = 960;
  const LANDSCAPE_H = 672;
  const TITLE_W = 256;
  const TITLE_H = 240;
  const TILE_SIZE = 32;
  const UI_TOP_H = 32;
  const HUD_BOTTOM_H = 36;
  const PLAY_TARGET_H = 512;
  const PORTRAIT_CONTROL_H = PORTRAIT_H - UI_TOP_H - PLAY_TARGET_H - HUD_BOTTOM_H;
  const SIDE_CONTROL_W = 160;
  let layoutMode = "portrait";
  let INTERNAL_W = PORTRAIT_W;
  let INTERNAL_H = PORTRAIT_H;
  let UI_BOTTOM_H = PORTRAIT_CONTROL_H;
  let PLAY_W = PORTRAIT_W;
  let PLAY_H = PORTRAIT_H - UI_TOP_H - HUD_BOTTOM_H - UI_BOTTOM_H;
  let GAME_X = 0;
  let GAME_Y = UI_TOP_H;
  let HUD_Y = UI_TOP_H + PLAY_H;
  let CONTROL_Y = HUD_Y + HUD_BOTTOM_H;
  const TURNS_PER_YEAR = 5;
  const DEBUG_LIFE_TURNS = 0; // Set to a positive number for short life-span testing.
  const START_AGE = 10;
  const DEATH_AGE = 50;
  const FOOD_TURN_INTERVAL = 18;
  const POPULATION_CHECK_INTERVAL = 32;
  const LABOR_TURN_INTERVAL = 10;
  const CAMP_PLACE_RADIUS = 15;   // (legacy) max distance from nearest base to place a camp
  const BASE_REVEAL_RADIUS = 5;   // (legacy) tiles revealed around each base/camp each turn
  // --- Settlement expansion (per拠点 level) ---
  const MAX_LEVEL = 3;
  const MIN_CAMP_DISTANCE = 8;          // 既存拠点からこれ未満には建設不可
  const POP_CAP_BY_LEVEL = [5, 10, 15]; // level 1/2/3 が加算するPOP CAP
  const REVEAL_RADIUS_BY_LEVEL = [5, 7, 9];   // 開拓範囲
  const CAMP_PLACE_MAX_BY_LEVEL = [15, 20, 25]; // 建設可能距離(最大)
  // 増築コスト（現在levelをキーに、次levelへ上げるコスト）
  const UPGRADE_COSTS = {
    1: { wood: 40, stone: 20, leather: 10 },
    2: { wood: 80, stone: 50, leather: 20, flint: 5 },
  };
  const POPULATION_GROW_CHANCE = 0.72;
  const RESIDENT_FORAGE_INTERVAL = 40;
  const STAT_FOOD_STEP = 5;
  const FOOD_SHORTAGE_LIMIT = 3;
  const STARVATION_LIFE_COST = 10;
  const LIMIT_ACTION_LIFE_COST = 15;
  const LIMIT_SEA_LIFE_COST = 25;
  const LIFE_WEAK_RATIO = 0.25;
  const AUTOSAVE_TURN_INTERVAL = 20;
  const HOLD_MOVE_DELAY = 180;
  const TILE_METERS = 50;
  const MAP_W = 200;
  const MAP_H = 200;
  const MOVE_ANIM_MS = 100;
  const VISION_RADII = [2, 3, 4, 5];
  const EVOLUTION_THRESHOLDS = [0, 8, 18, 35];
  const MONOLITH_VISION_BOOST_TURNS = 45;
  const ACTION_HP_COST = 1;
  const BASE_HP_RECOVERY = 100;
  const LOW_HP_THRESHOLD = 20;
  const RESOURCE_FRUIT_CHANCE = 0.38;
  const RESOURCE_WOOD_CHANCE = 0.14;
  const RESOURCE_STONE_CHANCE = 0.14;
  // 地形ごとの資源出現率（1地形=1資源）
  const RESOURCE_SMALL_FOREST_FRUIT = 0.24;   // 小さい森: 果物のみ
  const RESOURCE_DEEP_FOREST_WOOD = 0.32;     // 大きい森: 枝/木のみ
  const RESOURCE_MOUNTAIN_STONE = 0.22;       // 普通の山: 石のみ
  const RESOURCE_HIGH_MOUNTAIN_FLINT = 0.26;  // 高い山: フリントのみ
  const ACTION_DIRS = [
    [0, 0],
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const Tile = {
    SEA: 0,
    GRASS: 1,
    FOREST: 2,        // 小さい森（果物）。既存セーブ互換のため値は据え置き。
    MOUNTAIN: 3,      // 普通の山（石）。既存セーブ互換のため値は据え置き。
    MONOLITH: 4,
    DEEP_FOREST: 5,   // 大きい森（枝/木）
    HIGH_MOUNTAIN: 6, // 高い山（フリント）
    RIVER: 7,         // 川（高山から海へ流れる水脈。森の目印）
  };

  // 地形種別ヘルパー（新タイルを既存判定に取り込むため）
  function isForestTile(t) { return t === Tile.FOREST || t === Tile.DEEP_FOREST; }
  function isMountainTile(t) { return t === Tile.MOUNTAIN || t === Tile.HIGH_MOUNTAIN; }
  function isBuildableTile(t) { return t === Tile.GRASS || isForestTile(t); }

  const TERRAIN_HP_COST = {
    [Tile.GRASS]: { hp: 1, every: 2 },
    [Tile.FOREST]: { hp: 1, every: 1 },
    [Tile.DEEP_FOREST]: { hp: 1, every: 1 },
    [Tile.MOUNTAIN]: { hp: 3, every: 1 },
    [Tile.HIGH_MOUNTAIN]: { hp: 4, every: 1 },
    [Tile.RIVER]: { hp: 2, every: 1 },
    [Tile.SEA]: { hp: 20, every: 1 },
    [Tile.MONOLITH]: { hp: 1, every: 2 },
  };

  const Resource = {
    FRUIT: "fruit",
    WOOD: "wood",
    STONE: "stone",
    LEATHER: "leather",
    FLINT: "flint",
  };

  const RESOURCE_MAX_REMAINING = {
    [Resource.FRUIT]: 3,
    [Resource.WOOD]: 8,
    [Resource.STONE]: 5,
    [Resource.FLINT]: 5,
  };

  const RESOURCE_REGROW_TIME = {
    [Resource.FRUIT]: 100,
    [Resource.WOOD]: 150,
    [Resource.STONE]: 300,
    [Resource.FLINT]: 300,
  };
  const ANIMAL_COUNT = 80;
  const ANIMAL_RESPAWN_TURNS = 120;
  const animalTypes = [
    { id: "hare", name: "野兎", meat: 2, attack: 4, hp: 6, flee: 0.72 },
    { id: "boar", name: "猪", meat: 2, attack: 8, hp: 8, flee: 0.38 },
  ];

  const tileInfo = {
    [Tile.SEA]: { name: "海", color: "#111111", dark: "#777", passable: true },
    [Tile.GRASS]: { name: "草原", color: "#eeeeee", dark: "#aaa", passable: true },
    [Tile.FOREST]: { name: "小さい森", color: "#dddddd", dark: "#111", passable: true },
    [Tile.DEEP_FOREST]: { name: "大きい森", color: "#b9b9b9", dark: "#000", passable: true },
    [Tile.MOUNTAIN]: { name: "山", color: "#cfcfcf", dark: "#333", passable: true },
    [Tile.HIGH_MOUNTAIN]: { name: "高い山", color: "#e9e9e9", dark: "#222", passable: true },
    [Tile.RIVER]: { name: "川", color: "#3a3a3a", dark: "#888", passable: true },
    [Tile.MONOLITH]: { name: "黒石", color: "#d8d8d8", dark: "#111", passable: true },
  };

  const wisdomMilestones = [
    { id: "stone_tools", name: "石器", cost: 20, effect: "採集量 +1" },
    { id: "gathering_knack", name: "採集効率アップ", cost: 50, effect: "さらに採集量 +1" },
    { id: "storage", name: "保存の知恵", cost: 80, effect: "果物消費軽減" },
    { id: "hut", name: "小屋の知恵", cost: 120, effect: "人口増加条件緩和" },
  ];

  const CRAFT_RECIPES = [
    {
      id: "sharp_stone",
      name: "SHARP STONE",
      inputs: ["STONE", "STONE"],
      cost: { stone: 2 },
      prereqs: [],
      vision: "STONE CAN CHANGE",
      wisKey: "craft_sharp_stone",
      isInputItem: true,
      bonus: { atk: 1 },
    },
    {
      id: "stone_knife",
      name: "STONE KNIFE",
      inputs: ["BRANCH", "SHARP STONE"],
      cost: { wood: 1 },
      prereqs: ["sharp_stone"],
      vision: "TOOLS MAY EXIST",
      wisKey: "craft_stone_knife",
      effect: "hunting",
    },
    {
      id: "clothing",
      name: "CLOTHING",
      inputs: ["LEATHER", "LEATHER"],
      cost: { leather: 2 },
      prereqs: [],
      vision: "WE CAN ENDURE",
      wisKey: "craft_clothing",
      bonus: { damageReduction: 0.1 },
    },
    {
      id: "pack_frame",
      name: "PACK FRAME",
      inputs: ["LEATHER", "BRANCH"],
      cost: { leather: 1, wood: 1 },
      prereqs: [],
      vision: "CARRY MORE",
      wisKey: "craft_pack_frame",
      bonus: { capacityBonus: 10 },
    },
    {
      id: "spark",
      name: "SPARK",
      inputs: ["FLINT", "FLINT"],
      cost: { flint: 2 },
      prereqs: [],
      vision: "STONE MAKES LIGHT",
      wisKey: "craft_spark",
      isKnowledge: true,
    },
  ];

  const LABOR_JOBS = [
    { id: "fruit",  label: "FRUIT",  yield: { fruit: 2 }, perWorkers: 1, hint: "F+2/W" },
    { id: "stone",  label: "STONE",  yield: { stone: 1 }, perWorkers: 1, hint: "S+1/W" },
    { id: "branch", label: "BRANCH", yield: { wood: 1 },  perWorkers: 1, hint: "W+1/W" },
    { id: "hunt",   label: "HUNT",   yield: { meat: 1, leather: 1 }, perWorkers: 2, hint: "M+L/2W" },
  ];

  const names = ["アム", "ナギ", "トト", "ルカ", "セナ", "モリ", "イワ", "ハル", "コハ", "ラゴ", "エナ", "シキ"];
  const achievementsByDiscovery = {
    forest: "初めて森を発見",
    mountain: "初めて山を発見",
    sea: "初めて海を発見",
    gather_food: "初めて果物を採集",
    gather_wood: "初めて木を採集",
    gather_stone: "初めて石を採集",
    base: "拠点を作った",
    population: "人口を増やした",
    relic: "遺品を回収した",
    generation: "世代をつないだ",
    monolith_seen: "黒い石を見た",
    hunt: "初めて狩猟した",
  };

  const TITLE_OPTIONS = ["NEW GAME", "CONTINUE", "HISTORY", "SETTINGS"];
  const DEATH_DARKEN_MS = 1500;
  const DEATH_TYPE_MS = 4200;
  const DEATH_HOLD_MS = 2200;
  const DEATH_TEXT_FADE_OUT_MS = 1200;
  const DEATH_SEQUENCE_MS = DEATH_TYPE_MS + DEATH_HOLD_MS;
  const DEATH_MESSAGE = "THE LIGHT OF LIFE HAS FADED YET ITS GLOW IS INHERITED";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const gameShell = document.getElementById("gameShell");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlayText");
  const candidateList = document.getElementById("candidateList");
  const historyList = document.getElementById("historyList");
  const statusLine = document.getElementById("statusLine");
  const resourceStats = document.getElementById("resourceStats");
  const playerStats = document.getElementById("playerStats");
  const tribeStats = document.getElementById("tribeStats");

  const input = {
    keys: new Set(),
    mobileX: 0,
    mobileY: 0,
    holdTimer: null,
    holdDir: null,
    pressedControl: null,
    moving: false,
  };

  let state = null;
  let mode = "title"; // title, playing, menu, death, generation, history, gameover, iconPreview
  let titleIndex = 0;
  let titlePanel = "";
  let titleNotice = "";
  let titleNoticeUntil = 0;
  let gameMenuIndex = 0;
  let systemMenuIndex = 0;
  let baseMenuIndex = 0;
  let craftMenuIndex = 0;
  let laborMenuIndex = 0;
  let restSequenceStart = 0;
  let restSequenceDone = false;
  let restResourcesRefreshed = false;

  // VISION system
  let visionQueue = [];
  let visionCurrent = null;
  let visionStart = 0;
  const VISION_FADE_IN_MS = 600;
  const VISION_HOLD_MS = 2200;
  const VISION_FADE_OUT_MS = 700;
  const VISION_TOTAL_MS = VISION_FADE_IN_MS + VISION_HOLD_MS + VISION_FADE_OUT_MS;
  let ignoreNextCanvasClick = false;
  let generationCandidates = [];
  let generationIndex = 0;
  let generationReason = "";
  let deathSequenceStart = 0;
  let deathSequenceReason = "";
  let gameOverReason = "";

  function makeState() {
    const map = generateIslandMap();
    const spawn = findSpawn(map);
    const resources = generateResources(map, spawn);
    const player = createCharacter(1, spawn.x, spawn.y);
    const newState = {
      map,
      resources,
      depleted: {},
      bases: [],
      relics: [],
      animals: generateAnimals(map, spawn),
      animalsSeeded: true,
      hunted: [],
      explored: {},
      monolith: findMonolith(map),
      monolithTouched: false,
      visionBoostUntilTurn: 0,
      evolutionStage: 0,
      player,
      population: 2,
      tribe: { fruit: 1, meat: 0, wood: 0, stone: 0, leather: 0, flint: 0 },
      wisdom: 1,
      tribeAtk: 1,
      tribeInt: 1,
      consumedFruitTotal: 0,
      consumedMeatTotal: 0,
      statFruitMilestones: 0,
      statMeatMilestones: 0,
      lastForageTurn: 0,
      understoodStone: false,
      understoodBranch: false,
      huntingUnlocked: false,
      craftingUnlocked: false,
      buddyUnlocked: false,
      buddyOn: false,
      craftedItems: [],
      knewSpark: false,
      hasFire: false,
      knownMaterials: { fruit: true, wood: false, stone: false, meat: false },
      residents: [createCharacter(1, spawn.x, spawn.y, { atk: 1, int: 1, wis: 1 })],
      discoveries: {},
      inventions: {},
      history: [],
      popups: [],
      notice: null,
      gameMenuOpen: false,
      systemMenuOpen: false,
      baseMenuOpen: false,
      craftMenuOpen: false,
      placingCamp: false,
      campCursor: null,
      settlementUnlocked: false,
      laborUnlocked: false,
      laborMenuOpen: false,
      labor: { fruit: 0, stone: 0, branch: 0, hunt: 0 },
      lastLaborTurn: 0,
      craftSlots: ["FRUIT", "BRANCH"],
      generation: 1,
      log: ["神は小さな島に最初の民を置いた。"],
      turn: 0,
      lastFoodTurn: 0,
      lastPopulationCheckTurn: 0,
      foodShortageCount: 0,
      lastAutosaveTurn: 0,
    };
    revealVisibleTiles(newState);
    return newState;
  }

  function createCharacter(generation, gridX, gridY, lineage = null) {
    const face = randomFace();
    const age = START_AGE;
    const maxAge = DEATH_AGE;
    const baseAtk = Math.max(1, Math.floor(lineage && Number.isFinite(lineage.atk) ? lineage.atk : state && Number.isFinite(state.tribeAtk) ? state.tribeAtk : 1));
    const baseInt = Math.max(1, Math.floor(lineage && Number.isFinite(lineage.int) ? lineage.int : state && Number.isFinite(state.tribeInt) ? state.tribeInt : 1));
    const baseWis = Math.max(1, Math.floor(lineage && Number.isFinite(lineage.wis) ? lineage.wis : state && Number.isFinite(state.wisdom) ? state.wisdom : 1));
    return {
      id: cryptoRandomId(),
      generation,
      name: names[randomInt(0, names.length - 1)],
      gridX,
      gridY,
      x: gridX + 0.5,
      y: gridY + 0.5,
      dirX: 0,
      dirY: 1,
      drawX: gridX,
      drawY: gridY,
      moveFromX: gridX,
      moveFromY: gridY,
      moveToX: gridX,
      moveToY: gridY,
      moveStart: 0,
      moveEnd: 0,
      age,
      startAge: age,
      maxAge,
      hp: 100,
      strength: baseAtk,
      intelligence: baseInt,
      inheritedWisdom: baseWis,
      gathering: randomInt(1, 4),
      hunting: randomInt(1, 4),
      life: 0,
      maxLife: DEBUG_LIFE_TURNS > 0 ? DEBUG_LIFE_TURNS : lifeTurnsForAges(age, maxAge),
      plainMoveCount: 0,
      inventory: { fruit: 0, meat: 0, wood: 0, stone: 0, leather: 0, flint: 0 },
      capacity: 10,
      face,
      achievements: [],
    };
  }

  // 補間つきバリューノイズ（seededNoise を格子点として双線形補間）。
  function smoothNoise(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const v00 = seededNoise(x0, y0);
    const v10 = seededNoise(x0 + 1, y0);
    const v01 = seededNoise(x0, y0 + 1);
    const v11 = seededNoise(x0 + 1, y0 + 1);
    const top = v00 + (v10 - v00) * sx;
    const bot = v01 + (v11 - v01) * sx;
    return top + (bot - top) * sy;
  }

  // 複数オクターブを重ねたフラクタルノイズ（0..1）。
  function fractalNoise(x, y, octaves) {
    let total = 0, amp = 1, freq = 1, max = 0;
    for (let o = 0; o < octaves; o += 1) {
      total += smoothNoise(x * freq, y * freq) * amp;
      max += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return total / max;
  }

  // 環境シミュレーション型ワールド生成。
  // 標高マップ → 海岸線 → 山岳/高山 → 川 → 森林 → の順で地形を決める。
  // 「山があれば川、川があれば森」が予測できる連続した世界をつくる。
  const RIVER_SOURCE_SPACING = 14; // 川の源（高山頂）同士の最小間隔
  const RIVER_MAX_SOURCES = 16;
  const RIVER_DENSE_DIST = 3;      // 川からこの距離まで → 大きい森
  const RIVER_SMALL_DIST = 7;      // さらにこの距離まで → 小さい森
  function generateIslandMap() {
    const cx = (MAP_W - 1) / 2;
    const cy = (MAP_H - 1) / 2;
    const maxDist = Math.hypot(cx, cy);

    // 1) 標高マップ: 中心ほど高く外周ほど低い放射状の土台 + フラクタルノイズ。
    const height = [];
    let hMin = Infinity, hMax = -Infinity;
    for (let y = 0; y < MAP_H; y += 1) {
      const row = [];
      for (let x = 0; x < MAP_W; x += 1) {
        const d = Math.hypot(x - cx, y - cy) / maxDist; // 0(中心)..1(隅)
        const h = (1 - d) * 0.68 + fractalNoise(x * 0.05, y * 0.05, 5) * 0.32;
        row.push(h);
        if (h < hMin) hMin = h;
        if (h > hMax) hMax = h;
      }
      height.push(row);
    }
    const span = hMax - hMin || 1;
    const flat = [];
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        height[y][x] = (height[y][x] - hMin) / span; // 0..1 に正規化
        flat.push(height[y][x]);
      }
    }

    // パーセンタイルで海面/山/高山の境界を決め、地形比率を安定させる。
    flat.sort((a, b) => a - b);
    const pct = (p) => flat[Math.min(flat.length - 1, Math.floor(p * flat.length))];
    const seaLevel = pct(0.40);   // 下位40% → 海
    const mtnLevel = pct(0.75);   // 上位25% → 山岳帯
    const highLevel = pct(0.975); // 上位2.5% → 高山（山岳の約10%）

    // 2) 標高で素地を分類（低地はあとで川との距離で森/平原に分ける）。
    const tiles = [];
    for (let y = 0; y < MAP_H; y += 1) {
      const row = [];
      for (let x = 0; x < MAP_W; x += 1) {
        const h = height[y][x];
        if (h < seaLevel) row.push(Tile.SEA);
        else if (h >= highLevel) row.push(Tile.HIGH_MOUNTAIN);
        else if (h >= mtnLevel) row.push(Tile.MOUNTAIN);
        else row.push(Tile.GRASS); // 低地（仮）
      }
      tiles.push(row);
    }

    const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

    // 海岸線修正: 外洋とつながらない海（内陸の窪み）は低地に埋める。湖は今は作らない。
    const ocean = new Set();
    const oq = [];
    const pushOcean = (x, y) => {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
      const k = y * MAP_W + x;
      if (tiles[y][x] === Tile.SEA && !ocean.has(k)) { ocean.add(k); oq.push([x, y]); }
    };
    for (let x = 0; x < MAP_W; x += 1) { pushOcean(x, 0); pushOcean(x, MAP_H - 1); }
    for (let y = 0; y < MAP_H; y += 1) { pushOcean(0, y); pushOcean(MAP_W - 1, y); }
    for (let i = 0; i < oq.length; i += 1) {
      const [x, y] = oq[i];
      for (const [dx, dy] of N4) pushOcean(x + dx, y + dy);
    }
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (tiles[y][x] === Tile.SEA && !ocean.has(y * MAP_W + x)) tiles[y][x] = Tile.GRASS;
      }
    }

    // 3) 高山の頂を間引いて川の源を選ぶ（互いに離す）。
    const highs = [];
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (tiles[y][x] === Tile.HIGH_MOUNTAIN) highs.push({ x, y, h: height[y][x] });
      }
    }
    highs.sort((a, b) => b.h - a.h);
    const sources = [];
    for (const c of highs) {
      if (sources.every((s) => Math.hypot(c.x - s.x, c.y - s.y) > RIVER_SOURCE_SPACING)) sources.push(c);
      if (sources.length >= RIVER_MAX_SOURCES) break;
    }

    // 4) 川生成: 各源から最急降下で海まで一本の連続した線を流す（途切れない）。
    const isRiver = [];
    for (let y = 0; y < MAP_H; y += 1) isRiver.push(new Array(MAP_W).fill(false));
    for (const src of sources) {
      let x = src.x, y = src.y;
      const visited = new Set();
      for (let step = 0; step < 800; step += 1) {
        visited.add(y * MAP_W + x);
        if (tiles[y][x] === Tile.SEA) break;
        if (tiles[y][x] !== Tile.HIGH_MOUNTAIN) isRiver[y][x] = true; // 頂は山のまま残す
        let best = null, bh = Infinity;
        for (const [dx, dy] of N8) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
          if (visited.has(ny * MAP_W + nx)) continue;
          if (height[ny][nx] < bh) { bh = height[ny][nx]; best = [nx, ny]; }
        }
        if (!best) break;
        x = best[0]; y = best[1];
        if (tiles[y][x] === Tile.SEA) break;
      }
    }
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (isRiver[y][x] && tiles[y][x] !== Tile.SEA) tiles[y][x] = Tile.RIVER;
      }
    }

    // 5) 川からの距離をBFSで求める（海は通らない）。
    const INF = 1e9;
    const dist = [];
    for (let y = 0; y < MAP_H; y += 1) dist.push(new Array(MAP_W).fill(INF));
    const rq = [];
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (tiles[y][x] === Tile.RIVER) { dist[y][x] = 0; rq.push([x, y]); }
      }
    }
    for (let i = 0; i < rq.length; i += 1) {
      const [x, y] = rq[i];
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        if (tiles[ny][nx] === Tile.SEA) continue;
        if (dist[ny][nx] > dist[y][x] + 1) { dist[ny][nx] = dist[y][x] + 1; rq.push([nx, ny]); }
      }
    }

    // 6) 森林: 低地を川からの距離で分類。近いほど濃い森。
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (tiles[y][x] !== Tile.GRASS) continue;
        const rd = dist[y][x];
        if (rd <= RIVER_DENSE_DIST) tiles[y][x] = Tile.DEEP_FOREST;
        else if (rd <= RIVER_SMALL_DIST) tiles[y][x] = Tile.FOREST;
        // それ以外は平原（GRASS）のまま
      }
    }

    tiles[Math.round(cy)][Math.round(cx)] = Tile.MONOLITH; // 中心の頂＝黒石
    return tiles;
  }

  function findMonolith(map) {
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (map[y][x] === Tile.MONOLITH) return { x, y };
      }
    }
    return { x: Math.floor(MAP_W / 2), y: Math.floor(MAP_H / 2) };
  }

  function makeResourceNode(type) {
    const max = RESOURCE_MAX_REMAINING[type] || 3;
    return { type, remaining: max, maxRemaining: max, regrowTimer: 0 };
  }

  function generateResources(map, spawn = null) {
    const resources = {};
    for (let y = 1; y < MAP_H - 1; y += 1) {
      for (let x = 1; x < MAP_W - 1; x += 1) {
        const tile = map[y][x];
        const key = `${x},${y}`;
        const n = seededNoise(x * 17 + 3, y * 19 + 11);
        // 1地形=1資源。山で石/フリント、森で果物/枝が混ざらないようにする。
        if (tile === Tile.GRASS && hasNeighborTile(map, x, y, Tile.FOREST) && n < RESOURCE_FRUIT_CHANCE) {
          resources[key] = makeResourceNode(Resource.FRUIT);          // 小さい森に隣接した草原: 果物
        } else if (tile === Tile.FOREST && n < RESOURCE_SMALL_FOREST_FRUIT) {
          resources[key] = makeResourceNode(Resource.FRUIT);          // 小さい森: 果物のみ
        } else if (tile === Tile.DEEP_FOREST && n < RESOURCE_DEEP_FOREST_WOOD) {
          resources[key] = makeResourceNode(Resource.WOOD);           // 大きい森: 枝/木のみ
        } else if (tile === Tile.MOUNTAIN && n < RESOURCE_MOUNTAIN_STONE) {
          resources[key] = makeResourceNode(Resource.STONE);          // 普通の山: 石のみ
        } else if (tile === Tile.HIGH_MOUNTAIN && n < RESOURCE_HIGH_MOUNTAIN_FLINT) {
          resources[key] = makeResourceNode(Resource.FLINT);          // 高い山: フリントのみ
        }
      }
    }
    if (spawn) {
      seedStarterFruit(resources, map, spawn);
      seedStarterStone(resources, map, spawn);
    }
    return resources;
  }

  function generateAnimals(map, spawn = null) {
    const animals = [];
    let attempts = 0;
    while (animals.length < ANIMAL_COUNT && attempts < 1600) {
      attempts += 1;
      const x = randomInt(2, MAP_W - 3);
      const y = randomInt(2, MAP_H - 3);
      const tile = map[y][x];
      if (!isBuildableTile(tile)) continue;
      if (spawn && manhattanDistance(spawn.x, spawn.y, x, y) <= 8) continue;
      if (animals.some((animal) => animal.x === x && animal.y === y)) continue;
      const type = animalTypes[seededNoise(x * 23, y * 29) > 0.78 ? 1 : 0];
      animals.push({
        id: cryptoRandomId(),
        type: type.id,
        x,
        y,
        attack: type.attack,
        hp: type.hp,
        maxHp: type.hp,
        meat: type.meat,
      });
    }
    return animals;
  }

  function seedStarterFruit(resources, map, spawn) {
    let placed = 0;
    for (let radius = 2; radius <= 7 && placed < 5; radius += 1) {
      for (let y = spawn.y - radius; y <= spawn.y + radius && placed < 5; y += 1) {
        for (let x = spawn.x - radius; x <= spawn.x + radius && placed < 5; x += 1) {
          if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
          const key = `${x},${y}`;
          if (resources[key] || map[y][x] !== Tile.GRASS) continue;
          if (!hasNeighborTile(map, x, y, Tile.FOREST)) continue;
          resources[key] = makeResourceNode(Resource.FRUIT);
          placed += 1;
        }
      }
    }
    for (let radius = 2; radius <= 5 && placed < 7; radius += 1) {
      for (let y = spawn.y - radius; y <= spawn.y + radius && placed < 7; y += 1) {
        for (let x = spawn.x - radius; x <= spawn.x + radius && placed < 7; x += 1) {
          if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
          const key = `${x},${y}`;
          if (resources[key] || map[y][x] !== Tile.GRASS) continue;
          resources[key] = makeResourceNode(Resource.FRUIT);
          placed += 1;
        }
      }
    }
  }

  function hasNeighborTile(map, x, y, targetTile) {
    return ACTION_DIRS.slice(1).some(([dx, dy]) => map[y + dy] && map[y + dy][x + dx] === targetTile);
  }

  function seededNoise(x, y) {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  // スポーン: 平原＋小規模森林地帯。果物（小さい森）が隣接し、石（山）も歩いて届く
  // 麓寄りの平原を選ぶ。初期詰み防止。
  function findSpawn(map) {
    const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    // 山までの距離をBFS
    const INF = 1e9;
    const mdist = [];
    for (let y = 0; y < MAP_H; y += 1) mdist.push(new Array(MAP_W).fill(INF));
    const q = [];
    for (let y = 0; y < MAP_H; y += 1) {
      for (let x = 0; x < MAP_W; x += 1) {
        if (map[y][x] === Tile.MOUNTAIN || map[y][x] === Tile.HIGH_MOUNTAIN) { mdist[y][x] = 0; q.push([x, y]); }
      }
    }
    for (let i = 0; i < q.length; i += 1) {
      const [x, y] = q[i];
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        if (map[ny][nx] === Tile.SEA) continue;
        if (mdist[ny][nx] > mdist[y][x] + 1) { mdist[ny][nx] = mdist[y][x] + 1; q.push([nx, ny]); }
      }
    }
    const cx = (MAP_W - 1) / 2;
    const adjForest = (x, y) => N4.some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < MAP_W && ny < MAP_H && map[ny][nx] === Tile.FOREST;
    });
    let best = null, bestScore = Infinity;
    for (let y = Math.floor(MAP_H * 0.55); y < Math.floor(MAP_H * 0.85); y += 1) {
      for (let x = 15; x < MAP_W - 15; x += 1) {
        if (map[y][x] !== Tile.GRASS || !adjForest(x, y)) continue;
        const md = mdist[y][x];
        if (md < 6 || md > 20) continue; // 山が近すぎず遠すぎず
        const score = md + Math.abs(x - cx) * 0.15;
        if (score < bestScore) { bestScore = score; best = { x, y }; }
      }
    }
    if (best) return best;
    // フォールバック: 通行可能な低地を中心付近から探す
    const center = { x: Math.floor(MAP_W / 2), y: Math.floor(MAP_H * 0.66) };
    for (let radius = 0; radius < 40; radius += 1) {
      for (let y = center.y - radius; y <= center.y + radius; y += 1) {
        for (let x = center.x - radius; x <= center.x + radius; x += 1) {
          if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
          const t = map[y] && map[y][x];
          if (t === Tile.GRASS || t === Tile.FOREST || t === Tile.DEEP_FOREST) return { x, y };
        }
      }
    }
    return center;
  }

  // スポーン近くに STONE を確保（山が近ければ山に、無ければ小さな岩場を作る）。
  function seedStarterStone(resources, map, spawn) {
    let placed = 0;
    let nearest = null, nd = Infinity;
    for (let y = Math.max(1, spawn.y - 20); y < Math.min(MAP_H - 1, spawn.y + 20) && placed < 3; y += 1) {
      for (let x = Math.max(1, spawn.x - 20); x < Math.min(MAP_W - 1, spawn.x + 20) && placed < 3; x += 1) {
        if (map[y][x] !== Tile.MOUNTAIN) continue;
        const key = `${x},${y}`;
        if (resources[key]) continue;
        const d = manhattanDistance(spawn.x, spawn.y, x, y);
        if (d <= 16) { resources[key] = makeResourceNode(Resource.STONE); placed += 1; }
        if (d < nd) { nd = d; nearest = { x, y }; }
      }
    }
    if (placed > 0) return;
    if (nearest && nd <= 24) {
      resources[`${nearest.x},${nearest.y}`] = makeResourceNode(Resource.STONE);
      return;
    }
    // 近くに山が無い場合は小さな岩場を作って石を置く（初期詰み防止）。
    const ox = Math.max(2, Math.min(MAP_W - 3, spawn.x + 4));
    const oy = Math.max(2, Math.min(MAP_H - 3, spawn.y - 4));
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
      const x = ox + dx, y = oy + dy;
      if (map[y][x] === Tile.SEA || map[y][x] === Tile.RIVER) continue;
      map[y][x] = Tile.MOUNTAIN;
      resources[`${x},${y}`] = makeResourceNode(Resource.STONE);
    }
  }

  function getSafeAreaInsets() {
    const cs = getComputedStyle(document.documentElement);
    const px = (name) => {
      const n = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(n) ? n : 0;
    };
    return {
      top: px("--sai-top"),
      right: px("--sai-right"),
      bottom: px("--sai-bottom"),
      left: px("--sai-left"),
    };
  }

  function resizeCanvas() {
    // 実際に見えている領域を基準にする。visualViewport はモバイルのツールバー表示/
    // ピンチズームを反映するため innerWidth/Height より正確。
    const vv = window.visualViewport;
    const viewportW = (vv && vv.width) || window.innerWidth;
    const viewportH = (vv && vv.height) || window.innerHeight;
    // 起動直後はレイアウト未確定で値が 0〜1 になることがある。
    // その値でスケールを決めるとキャンバスが極小（scale 0.1）に固定されるため、
    // まともなサイズが取れるまで次フレームに再試行する。
    if (viewportW < 50 || viewportH < 50) {
      requestAnimationFrame(resizeCanvas);
      return;
    }

    applyCanvasLayout();
    canvas.width = INTERNAL_W;
    canvas.height = INTERNAL_H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // セーフエリア分を差し引いた領域に収める（CSS の #gameShell padding と一致させる）。
    // これでノッチ/ホームインジケータ/ブラウザ下部バーにコントローラが隠れない。
    const insets = getSafeAreaInsets();
    const availableW = Math.max(50, viewportW - insets.left - insets.right);
    const availableH = Math.max(50, viewportH - insets.top - insets.bottom);

    const canvasBorder = 4;
    const fitScale = Math.min(availableW / (INTERNAL_W + canvasBorder), availableH / (INTERNAL_H + canvasBorder));
    const scale = fitScale >= 1 ? Math.max(1, Math.floor(fitScale)) : Math.max(0.1, Math.floor(fitScale * 1000) / 1000);
    document.documentElement.style.setProperty("--game-width", `${INTERNAL_W}px`);
    document.documentElement.style.setProperty("--game-height", `${INTERNAL_H}px`);
    document.documentElement.style.setProperty("--game-scale", String(scale));
  }

  // スリープ復帰直後はモバイル Chrome の上下バー表示や visualViewport.height、
  // dvh の再計算が数百ms 遅れて確定する。1 回の resizeCanvas では古い値を掴んで
  // 画面位置がズレるため、即時 + 複数の遅延で繰り返し再センタリングする。
  function scheduleResizeCanvas() {
    resizeCanvas();
    window.setTimeout(resizeCanvas, 100);
    window.setTimeout(resizeCanvas, 300);
    window.setTimeout(resizeCanvas, 800);
  }

  function applyCanvasLayout() {
    const nextMode = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
    layoutMode = nextMode;
    if (layoutMode === "landscape") {
      INTERNAL_W = LANDSCAPE_W;
      INTERNAL_H = LANDSCAPE_H;
      UI_BOTTOM_H = 0;
      PLAY_W = LANDSCAPE_W - SIDE_CONTROL_W * 2;
      PLAY_H = PLAY_TARGET_H;
      GAME_X = SIDE_CONTROL_W;
      GAME_Y = UI_TOP_H;
      HUD_Y = GAME_Y + PLAY_H;
      CONTROL_Y = INTERNAL_H;
      return;
    }
    INTERNAL_W = PORTRAIT_W;
    INTERNAL_H = PORTRAIT_H;
    UI_BOTTOM_H = PORTRAIT_CONTROL_H;
    PLAY_W = PORTRAIT_W;
    PLAY_H = PLAY_TARGET_H;
    GAME_X = 0;
    GAME_Y = UI_TOP_H;
    HUD_Y = GAME_Y + PLAY_H;
    CONTROL_Y = HUD_Y + HUD_BOTTOM_H;
  }

  function startNewGame() {
    state = makeState();
    migrateTurnState();
    mode = "playing";
    titlePanel = "";
    hideOverlay();
    updateEvolution();
    state.openingUntil = performance.now() + 1800;
    addLog("SURVIVE");
    showVision("SURVIVE");
    showVision("FIND A SAFE PLACE TO SLEEP");
    saveGame();
  }

  function continueFromTitle() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      setTitleNotice("NO SAVE");
      return;
    }
    loadGame();
  }

  function loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      showOverlay("menu", "セーブデータはまだありません。新しい部族を始めましょう。");
      return;
    }
    try {
      state = JSON.parse(raw);
      migrateTurnState();
      // ロード後に一時UI/アニメーション状態をリセット
      state.baseMenuOpen = false;
      state.craftMenuOpen = false;
      state.laborMenuOpen = false;
      state.gameMenuOpen = false;
      state.systemMenuOpen = false;
      state.placingCamp = false;
      state.campCursor = null;
      state.milestoneOverlay = null;
      if (state.player) {
        state.player.moveEnd = 0;
        state.player.moveStart = 0;
      }
      baseMenuIndex = 0;
      craftMenuIndex = 0;
      laborMenuIndex = 0;
      restSequenceStart = 0;
      restSequenceDone = false;
      console.log("after load state flags", {
        baseMenuOpen: state.baseMenuOpen,
        craftMenuOpen: state.craftMenuOpen,
        laborMenuOpen: state.laborMenuOpen,
        placingCamp: state.placingCamp,
        gameMenuOpen: state.gameMenuOpen,
        systemMenuOpen: state.systemMenuOpen
      });
      mode = "playing";
      titlePanel = "";
      hideOverlay();
      updateVisionAndDiscoveries();
      updateEvolution();
      addLog("保存された歴史から部族が目覚めた。");
    } catch (error) {
      showOverlay("menu", "セーブデータを読み込めませんでした。リセットして始め直してください。");
    }
  }

  function saveGame() {
    if (!state) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    statusLine.textContent = "保存しました";
  }

  function resetSave() {
    localStorage.removeItem(SAVE_KEY);
    showOverlay("title", "セーブデータを削除しました。");
  }

  function advanceTurn(reason) {
    if (!state || mode !== "playing") return;
    migrateTurnState();
    state.turn += 1;
    state.gameTime = state.turn;
    updatePlayerLife();
    if (mode !== "playing") return;
    updateResourceRespawn();
    updatePopups();
    updateVisionAndDiscoveries();
    updateAnimals();
    updatePopulation();
    if (mode !== "playing") return;
    updateLaborYield();
    revealAroundBases();
    updateInventions();
    updateEvolution();
    if (state.turn - state.lastAutosaveTurn >= AUTOSAVE_TURN_INTERVAL) {
      state.lastAutosaveTurn = state.turn;
      saveGame();
    }
  }

  function migrateTurnState() {
    if (!state) return;
    if (!Array.isArray(state.map) || state.map.length !== MAP_H || !state.map[0] || state.map[0].length !== MAP_W) {
      state.map = generateIslandMap();
      state.explored = {};
      state.seen = {};
      state.depleted = {};
      state.monolith = findMonolith(state.map);
      const spawn = findSpawn(state.map);
      state.resources = generateResources(state.map, spawn);
      if (state.player) {
        state.player.gridX = spawn.x;
        state.player.gridY = spawn.y;
      }
      state.bases = [];
      state.relics = [];
    }
    if (!Number.isFinite(state.turn)) state.turn = Math.floor(state.gameTime || 0);
    if (!state.resources) state.resources = generateResources(state.map, state.player);
    migrateResourceState();
    if (!Number.isFinite(state.lastFoodTurn)) state.lastFoodTurn = state.turn;
    if (!Number.isFinite(state.lastPopulationCheckTurn)) state.lastPopulationCheckTurn = state.turn;
    if (!Number.isFinite(state.lastForageTurn)) state.lastForageTurn = state.turn;
    if (!Number.isFinite(state.consumedFruitTotal)) state.consumedFruitTotal = 0;
    if (!Number.isFinite(state.consumedMeatTotal)) state.consumedMeatTotal = 0;
    if (!Number.isFinite(state.statFruitMilestones)) state.statFruitMilestones = Math.floor(state.consumedFruitTotal / STAT_FOOD_STEP);
    if (!Number.isFinite(state.statMeatMilestones)) state.statMeatMilestones = Math.floor(state.consumedMeatTotal / STAT_FOOD_STEP);
    if (!Number.isFinite(state.wisdom)) state.wisdom = 1;
    if (state.wisdom < 1) state.wisdom = 1;
    if (!Number.isFinite(state.tribeAtk)) state.tribeAtk = state.player && Number.isFinite(state.player.strength) ? Math.max(1, state.player.strength) : 1;
    if (!Number.isFinite(state.tribeInt)) state.tribeInt = state.player && Number.isFinite(state.player.intelligence) ? Math.max(1, state.player.intelligence) : 1;
    if (typeof state.understoodStone !== "boolean") state.understoodStone = !!(state.knownMaterials && state.knownMaterials.stone);
    if (typeof state.understoodBranch !== "boolean") state.understoodBranch = !!(state.knownMaterials && state.knownMaterials.wood);
    if (typeof state.huntingUnlocked !== "boolean") state.huntingUnlocked = state.understoodBranch || !!(state.knownMaterials && state.knownMaterials.meat);
    if (typeof state.craftingUnlocked !== "boolean") state.craftingUnlocked = state.understoodBranch || false;
    if (typeof state.buddyUnlocked !== "boolean") state.buddyUnlocked = false;
    if (typeof state.buddyOn !== "boolean") state.buddyOn = false;
    if (!Array.isArray(state.craftedItems)) state.craftedItems = [];
    if (typeof state.knewSpark !== "boolean") state.knewSpark = false;
    if (typeof state.hasFire !== "boolean") state.hasFire = false;
    if (!state.knownMaterials) state.knownMaterials = {};
    if (!Number.isFinite(state.tribe.leather)) state.tribe.leather = 0;
    if (!Number.isFinite(state.tribe.flint)) state.tribe.flint = 0;
    if (state.player && !Number.isFinite(state.player.inventory.leather)) state.player.inventory.leather = 0;
    if (state.player && !Number.isFinite(state.player.inventory.flint)) state.player.inventory.flint = 0;
    syncKnownMaterials();
    if (!Number.isFinite(state.foodShortageCount)) state.foodShortageCount = 0;
    if (!Number.isFinite(state.lastAutosaveTurn)) state.lastAutosaveTurn = state.turn;
    if (typeof state.gameMenuOpen !== "boolean") state.gameMenuOpen = false;
    if (typeof state.systemMenuOpen !== "boolean") state.systemMenuOpen = false;
    if (typeof state.baseMenuOpen !== "boolean") state.baseMenuOpen = false;
    if (typeof state.craftMenuOpen !== "boolean") state.craftMenuOpen = false;
    if (typeof state.settlementUnlocked !== "boolean") state.settlementUnlocked = false;
    if (typeof state.laborUnlocked !== "boolean") state.laborUnlocked = state.settlementUnlocked;
    if (typeof state.placingCamp !== "boolean") state.placingCamp = false;
    if (!state.campCursor) state.campCursor = null;
    if (Array.isArray(state.bases)) {
      for (const base of state.bases) {
        if (!Number.isFinite(base.level)) base.level = 1;
        base.level = Math.max(1, Math.min(MAX_LEVEL, base.level));
      }
    }
    if (typeof state.laborMenuOpen !== "boolean") state.laborMenuOpen = false;
    if (!state.labor || typeof state.labor !== "object") state.labor = { fruit: 0, stone: 0, branch: 0, hunt: 0 };
    if (!Number.isFinite(state.labor.fruit)) state.labor.fruit = 0;
    if (!Number.isFinite(state.labor.stone)) state.labor.stone = 0;
    if (!Number.isFinite(state.labor.branch)) state.labor.branch = 0;
    if (!Number.isFinite(state.labor.hunt)) state.labor.hunt = 0;
    if (!Number.isFinite(state.lastLaborTurn)) state.lastLaborTurn = 0;
    revealAroundBases();
    if (!Array.isArray(state.craftSlots)) state.craftSlots = ["FRUIT", "BRANCH"];
    if (Array.isArray(state.craftSlots)) state.craftSlots = state.craftSlots.map(s => s === "WOOD" ? "BRANCH" : s);
    if (!Array.isArray(state.residents)) state.residents = [];
    if (!Array.isArray(state.animals)) state.animals = [];
    if (!Array.isArray(state.hunted)) state.hunted = [];
    if (!state.animalsSeeded && state.animals.length === 0) {
      state.animals = generateAnimals(state.map, state.player || findSpawn(state.map));
      state.animalsSeeded = true;
    }
    if (!state.explored) state.explored = state.seen || {};
    if (!state.discoveries) state.discoveries = {};
    state.seen = state.explored;
    if (!state.monolith) state.monolith = findMonolith(state.map);
    if (!Number.isFinite(state.visionBoostUntilTurn)) state.visionBoostUntilTurn = 0;
    if (!Number.isFinite(state.evolutionStage)) state.evolutionStage = getEvolutionStage();
    if (state.player && !Number.isFinite(state.player.gridX)) {
      state.player.gridX = Math.floor(state.player.x);
      state.player.gridY = Math.floor(state.player.y);
    }
    if (state.player) {
      state.player.x = state.player.gridX + 0.5;
      state.player.y = state.player.gridY + 0.5;
    }
    if (!state.depleted) state.depleted = {};
    if (state.player && state.player.maxAge !== DEATH_AGE) {
      const oldRatio = state.player.maxLife > 0 ? state.player.life / state.player.maxLife : 0;
      state.player.startAge = START_AGE;
      state.player.maxAge = DEATH_AGE;
      state.player.maxLife = DEBUG_LIFE_TURNS > 0 ? DEBUG_LIFE_TURNS : lifeTurnsForAges(START_AGE, DEATH_AGE);
      state.player.life = Math.floor(Math.max(0, Math.min(0.98, oldRatio)) * state.player.maxLife);
      state.player.age = START_AGE + Math.floor(state.player.life / TURNS_PER_YEAR);
    }
    if (state.player) {
      if (!Number.isFinite(state.player.startAge)) state.player.startAge = START_AGE;
      if (!Number.isFinite(state.player.maxAge) || state.player.maxAge !== DEATH_AGE) state.player.maxAge = DEATH_AGE;
      if (!Number.isFinite(state.player.plainMoveCount)) state.player.plainMoveCount = 0;
      if (!Number.isFinite(state.player.strength)) state.player.strength = 1;
      if (!Number.isFinite(state.player.intelligence)) state.player.intelligence = 1;
      if (!Number.isFinite(state.player.inheritedWisdom)) state.player.inheritedWisdom = state.wisdom;
      migrateInventory(state.player.inventory);
    }
    for (const resident of state.residents) {
      if (!Number.isFinite(resident.strength)) resident.strength = state.tribeAtk || 1;
      if (!Number.isFinite(resident.intelligence)) resident.intelligence = state.tribeInt || 1;
      if (!Number.isFinite(resident.inheritedWisdom)) resident.inheritedWisdom = state.wisdom || 1;
      if (!resident.inventory) resident.inventory = { fruit: 0, meat: 0, wood: 0, stone: 0 };
      migrateInventory(resident.inventory);
    }
    while (state.residents.length < Math.max(0, state.population - 1)) {
      const spawn = state.bases[0] || state.player || findSpawn(state.map);
      state.residents.push(createCharacter(state.generation, spawn.x, spawn.y, getCurrentLineage()));
    }
    if (state.residents.length > Math.max(0, state.population - 1)) state.residents = state.residents.slice(0, Math.max(0, state.population - 1));
    revealVisibleTiles(state);
  }

  function migrateResourceState() {
    if (state.resources) {
      for (const key of Object.keys(state.resources)) {
        const r = state.resources[key];
        if (r && !Number.isFinite(r.maxRemaining)) {
          const max = RESOURCE_MAX_REMAINING[r.type] || 3;
          r.maxRemaining = max;
          r.remaining = max;
        }
        if (r && !Number.isFinite(r.regrowTimer)) {
          r.regrowTimer = r.remaining <= 0 ? (RESOURCE_REGROW_TIME[r.type] || 100) : 0;
        }
        if (r && typeof r.harvested !== "boolean") r.harvested = false;
      }
    }
    if (!state.tribe) state.tribe = {};
    if (!Number.isFinite(state.tribe.fruit)) state.tribe.fruit = Number.isFinite(state.tribe.food) ? state.tribe.food : 0;
    if (!Number.isFinite(state.tribe.meat)) state.tribe.meat = 0;
    if (!Number.isFinite(state.tribe.wood)) state.tribe.wood = 0;
    if (!Number.isFinite(state.tribe.stone)) state.tribe.stone = 0;
    if (!Number.isFinite(state.tribe.leather)) state.tribe.leather = 0;
    if (!Number.isFinite(state.tribe.flint)) state.tribe.flint = 0;
    delete state.tribe.food;
    if (state.player) migrateInventory(state.player.inventory);
    if (Array.isArray(state.relics)) {
      for (const relic of state.relics) if (relic.inventory) migrateInventory(relic.inventory);
    }
    if (Array.isArray(state.animals)) {
      for (const animal of state.animals) {
        const type = animalTypes.find((item) => item.id === animal.type) || animalTypes[0];
        if (!Number.isFinite(animal.hp)) animal.hp = type.hp;
        if (!Number.isFinite(animal.maxHp)) animal.maxHp = type.hp;
        if (!Number.isFinite(animal.meat)) animal.meat = type.meat;
      }
    }
  }

  function migrateInventory(inv) {
    if (!inv) return;
    if (!Number.isFinite(inv.fruit)) inv.fruit = Number.isFinite(inv.food) ? inv.food : 0;
    if (!Number.isFinite(inv.meat)) inv.meat = 0;
    if (!Number.isFinite(inv.wood)) inv.wood = 0;
    if (!Number.isFinite(inv.stone)) inv.stone = 0;
    if (!Number.isFinite(inv.leather)) inv.leather = 0;
    if (!Number.isFinite(inv.flint)) inv.flint = 0;
    delete inv.food;
  }

  function syncKnownMaterials() {
    if (!state.knownMaterials) state.knownMaterials = {};
    const known = state.knownMaterials;
    known.fruit = true;
    known.stone = !!state.understoodStone;
    known.wood = !!state.understoodBranch;
    known.meat = !!state.huntingUnlocked;
    known.leather = !!state.huntingUnlocked;
    known.flint = !!state.understoodStone;
  }

  function getCurrentLineage() {
    return { atk: state.tribeAtk || 1, int: state.tribeInt || 1, wis: state.wisdom || 1 };
  }

  function updatePlayerLife() {
    const p = state.player;
    damageLife(1);
    if (mode !== "playing") return;
    p.age = Math.floor(p.startAge + p.life / p.maxLife * (p.maxAge - p.startAge));
  }

  function lifeTurnsForAges(startAge, maxAge) {
    return (maxAge - startAge) * TURNS_PER_YEAR;
  }

  function damageLife(amount, notice = "") {
    if (!state || !state.player || amount <= 0) return;
    const reduction = getCraftBonus("damageReduction");
    if (reduction > 0) amount = amount * (1 - Math.min(0.9, reduction));
    const p = state.player;
    p.life = Math.min(p.maxLife, p.life + amount);
    p.age = Math.floor(p.startAge + p.life / p.maxLife * (p.maxAge - p.startAge));
    if (notice) addLog(notice);
    if (getLifeRatio() <= LIFE_WEAK_RATIO && mode === "playing") addLog("鼓動が弱い");
    if (p.life >= p.maxLife) killPlayer("寿命が尽きた");
  }

  function getMoveVector() {
    let x = input.mobileX;
    let y = input.mobileY;
    if (input.keys.has("arrowleft") || input.keys.has("a")) x -= 1;
    if (input.keys.has("arrowright") || input.keys.has("d")) x += 1;
    if (input.keys.has("arrowup") || input.keys.has("w")) y -= 1;
    if (input.keys.has("arrowdown") || input.keys.has("s")) y += 1;
    const len = Math.hypot(x, y);
    if (len > 0) return { x: x / len, y: y / len };
    return { x: 0, y: 0 };
  }

  function tryMove(dx, dy) {
    if (!state || mode !== "playing" || state.milestoneOverlay || state.gameMenuOpen || state.systemMenuOpen || state.baseMenuOpen || state.craftMenuOpen || state.laborMenuOpen || (restSequenceStart && !restSequenceDone)) return false;
    if (state.placingCamp && state.campCursor) {
      const nx = state.campCursor.x + Math.sign(dx);
      const ny = state.campCursor.y + Math.sign(dy);
      if (nx >= 0 && ny >= 0 && nx < MAP_W && ny < MAP_H) {
        state.campCursor.x = nx;
        state.campCursor.y = ny;
      }
      return true;
    }
    if (isPlayerAnimating()) return false;
    if (!dx && !dy) return false;
    if (dx && dy) return false;
    const p = state.player;
    const wasAtLimit = p.hp <= 0;
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    p.dirX = stepX;
    p.dirY = stepY;
    const nextGridX = p.gridX + stepX;
    const nextGridY = p.gridY + stepY;
    if (!isPassableTile(state.map, nextGridX, nextGridY)) {
      addLog("そこへは進めない。");
      return false;
    }
    p.moveFromX = p.gridX;
    p.moveFromY = p.gridY;
    p.moveToX = nextGridX;
    p.moveToY = nextGridY;
    p.moveStart = performance.now();
    p.moveEnd = p.moveStart + MOVE_ANIM_MS;
    p.gridX = nextGridX;
    p.gridY = nextGridY;
    p.x = nextGridX + 0.5;
    p.y = nextGridY + 0.5;
    const nextTile = state.map[nextGridY][nextGridX];
    applyTerrainMoveCost(nextTile);
    if (!wasAtLimit && p.hp <= 0) addLog("限界だ");
    advanceTurn("MOVE");
    if (mode !== "playing") return true;
    if (wasAtLimit && p.hp <= 0) {
      damageLife(nextTile === Tile.SEA ? LIMIT_SEA_LIFE_COST : LIMIT_ACTION_LIFE_COST, "命を削った");
      if (mode !== "playing") return true;
    }
    if (p.hp <= LOW_HP_THRESHOLD) addLog("HP LOW");
    autoDepositOnBase();
    return true;
  }

  function applyTerrainMoveCost(tile) {
    const p = state.player;
    const cost = TERRAIN_HP_COST[tile] || { hp: 1, every: 1 };
    if (cost.every > 1) {
      p.plainMoveCount = (p.plainMoveCount || 0) + 1;
      if (p.plainMoveCount >= cost.every) {
        p.plainMoveCount = 0;
        p.hp = Math.max(0, p.hp - cost.hp);
      }
    } else {
      p.plainMoveCount = 0;
      p.hp = Math.max(0, p.hp - cost.hp);
    }
    if (tile === Tile.SEA) addLog("海は危険");
  }

  function isPlayerAnimating() {
    return !!(state && state.player && performance.now() < (state.player.moveEnd || 0));
  }

  function getPlayerDrawPosition() {
    const p = state.player;
    const now = performance.now();
    if (now >= (p.moveEnd || 0)) {
      p.drawX = p.gridX;
      p.drawY = p.gridY;
      return { x: p.gridX, y: p.gridY };
    }
    const span = Math.max(1, p.moveEnd - p.moveStart);
    const t = Math.max(0, Math.min(1, (now - p.moveStart) / span));
    const eased = t * t * (3 - 2 * t);
    p.drawX = p.moveFromX + (p.moveToX - p.moveFromX) * eased;
    p.drawY = p.moveFromY + (p.moveToY - p.moveFromY) * eased;
    return { x: p.drawX, y: p.drawY };
  }

  function tryMoveFromKey(key) {
    const dir = getDirForKey(key);
    if (!dir) return false;
    return tryMove(dir[0], dir[1]);
  }

  function getDirForKey(key) {
    const dirs = {
      arrowleft: [-1, 0],
      a: [-1, 0],
      arrowright: [1, 0],
      d: [1, 0],
      arrowup: [0, -1],
      w: [0, -1],
      arrowdown: [0, 1],
      s: [0, 1],
    };
    return dirs[key] || null;
  }

  function canMoveTo(x, y) {
    return isPassableTile(state.map, Math.floor(x), Math.floor(y));
  }

  function isPassableTile(map, x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
    return tileInfo[map[y][x]].passable;
  }

  function getVisionRadius() {
    const stage = Math.max(0, Math.min(VISION_RADII.length - 1, state.evolutionStage || 0));
    const boost = state.turn <= (state.visionBoostUntilTurn || 0) ? 6 : 0;
    return VISION_RADII[stage] + boost;
  }

  function revealVisibleTiles(targetState) {
    if (!targetState || !targetState.player) return;
    if (!targetState.explored) targetState.explored = targetState.seen || {};
    targetState.seen = targetState.explored;
    const radius = getVisionRadiusForState(targetState);
    const p = targetState.player;
    for (let y = p.gridY - radius; y <= p.gridY + radius; y += 1) {
      for (let x = p.gridX - radius; x <= p.gridX + radius; x += 1) {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        if (distance(p.gridX, p.gridY, x, y) <= radius + 0.35) targetState.explored[`${x},${y}`] = 1;
      }
    }
  }

  function getVisionRadiusForState(targetState) {
    const stage = Math.max(0, Math.min(VISION_RADII.length - 1, targetState.evolutionStage || 0));
    const boost = targetState.turn <= (targetState.visionBoostUntilTurn || 0) ? 6 : 0;
    return VISION_RADII[stage] + boost;
  }

  function baseLevel(base) {
    return base && Number.isFinite(base.level) ? base.level : 1;
  }

  function baseRevealRadius(base) {
    return REVEAL_RADIUS_BY_LEVEL[baseLevel(base) - 1] || BASE_REVEAL_RADIUS;
  }

  function campPlaceMaxForBase(base) {
    return CAMP_PLACE_MAX_BY_LEVEL[baseLevel(base) - 1] || CAMP_PLACE_RADIUS;
  }

  function revealAroundBases() {
    if (!state || !state.bases || !state.bases.length) return;
    if (!state.explored) state.explored = {};
    for (const base of state.bases) {
      const r = baseRevealRadius(base);
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const nx = base.x + dx;
          const ny = base.y + dy;
          if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
          if (distance(base.x, base.y, nx, ny) <= r + 0.35) {
            state.explored[`${nx},${ny}`] = 1;
          }
        }
      }
    }
  }

  // 建設可否を判定。優先順位: terrain > tooClose > tooFar > ok
  function campPlacementStatus(x, y) {
    if (!state || !state.bases) return "terrain";
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return "terrain";
    const t = state.map[y] && state.map[y][x];
    if (!isBuildableTile(t)) return "terrain";
    if (state.bases.some((b) => b.x === x && b.y === y)) return "terrain";
    let tooClose = false;
    let withinMax = false;
    for (const b of state.bases) {
      const d = distance(b.x, b.y, x, y);
      if (d < MIN_CAMP_DISTANCE) tooClose = true;
      if (d <= campPlaceMaxForBase(b)) withinMax = true;
    }
    if (tooClose) return "tooClose";
    if (!withinMax) return "tooFar";
    return "ok";
  }

  function getCurrentBase() {
    if (!state || !state.player || !state.bases) return null;
    return state.bases.find((b) => b.x === state.player.gridX && b.y === state.player.gridY) || null;
  }

  function isInCampRange(x, y) {
    return campPlacementStatus(x, y) === "ok";
  }

  function isSeenTile(x, y) {
    return !!(state.explored && state.explored[`${x},${y}`]);
  }

  function isVisibleTile(x, y) {
    return manhattanDistance(state.player.gridX, state.player.gridY, x, y) <= getVisionRadius();
  }

  function updateResourceRespawn() {
    if (state.resources) {
      for (const r of Object.values(state.resources)) {
        if (r && r.remaining <= 0 && r.regrowTimer > 0) {
          r.regrowTimer -= 1;
          if (r.regrowTimer <= 0) {
            r.remaining = r.maxRemaining;
            r.harvested = false;
          }
        }
      }
    }
    if (!Array.isArray(state.hunted)) state.hunted = [];
    state.hunted = state.hunted.filter((entry) => {
      if (state.turn - entry.turn < ANIMAL_RESPAWN_TURNS) return true;
      if (!state.animals.some((animal) => animal.id === entry.animal.id)) {
        const type = animalTypes.find((item) => item.id === entry.animal.type) || animalTypes[0];
        entry.animal.hp = type.hp;
        entry.animal.maxHp = type.hp;
        entry.animal.meat = type.meat;
        state.animals.push(entry.animal);
      }
      return false;
    });
  }

  function updatePopups() {
    if (!state.popups) state.popups = [];
    for (const popup of state.popups) {
      popup.life -= 1;
      popup.y -= 0.08;
    }
    state.popups = state.popups.filter((popup) => popup.life > 0);
  }

  function updateVisionAndDiscoveries() {
    const p = state.player;
    revealVisibleTiles(state);
  }

  function updatePopulation() {
    updateResidentForage();
    if (state.turn - state.lastFoodTurn >= FOOD_TURN_INTERVAL) {
      state.lastFoodTurn = state.turn;
      const foodCost = state.inventions.storage ? Math.max(1, Math.ceil(state.population * 0.45)) : Math.max(1, Math.ceil(state.population * 0.6));
      const eaten = consumeTribeFood(foodCost);
      if (eaten >= foodCost) {
        state.foodShortageCount = 0;
      } else {
        state.foodShortageCount += 1;
        addLog("飢え");
        damageLife(STARVATION_LIFE_COST * state.foodShortageCount, "鼓動が弱い");
        if (mode !== "playing") return;
        if (state.foodShortageCount >= FOOD_SHORTAGE_LIMIT) {
          state.foodShortageCount = 0;
          state.population -= 1;
          clampLaborToPopulation();
          addLog("人口-1");
        }
      }
    }
    if (state.population <= 0) {
      mode = "gameover";
      gameOverReason = "NO TRIBE";
      hideOverlay();
      return;
    }
    if (state.turn - state.lastPopulationCheckTurn < POPULATION_CHECK_INTERVAL) return;
    state.lastPopulationCheckTurn = state.turn;
    const growNeed = state.inventions.hut ? 3 + Math.ceil(state.population * 0.8) : 4 + state.population;
    const foodStore = (state.tribe.fruit || 0) + Math.floor((state.tribe.meat || 0) * 1.5);
    const meatBonus = state.tribe.meat > 0 ? 0.1 : 0;
    const popCap = getPopCap();
    if (!state.settlementUnlocked && state.population >= 5) {
      state.settlementUnlocked = true;
      state.laborUnlocked = true;
      addLog("UNDERSTOOD SETTLEMENT");
      addLog("WIS +1");
      state.wisdom += 1;
      showMilestone("UNDERSTOOD SETTLEMENT", "WE CAN LIVE FARTHER AWAY");
    }
    if (state.bases.length > 0 && state.population >= 2 && state.population < popCap && foodStore >= growNeed && seededNoise(state.turn, state.population * 13) < POPULATION_GROW_CHANCE + meatBonus) {
      consumeTribeFood(Math.ceil(growNeed / 2));
      state.population += 1;
      const spawn = state.bases[0] || state.player || findSpawn(state.map);
      state.residents.push(createCharacter(state.generation, spawn.x, spawn.y, getCurrentLineage()));
      addAchievement("人口を増やした");
      addLog("NEW LIFE BORN");
    }
  }

  function consumeTribeFood(cost) {
    let remaining = Math.max(0, cost);
    const fruitEat = Math.min(state.tribe.fruit || 0, remaining);
    state.tribe.fruit -= fruitEat;
    remaining -= fruitEat;
    const meatEat = Math.min(state.tribe.meat || 0, remaining);
    state.tribe.meat -= meatEat;
    remaining -= meatEat;
    return cost - remaining;
  }

  function applyStoredStatGrowth(fruitStored, meatStored) {
    state.consumedFruitTotal += fruitStored;
    state.consumedMeatTotal += meatStored;
    const fruitMilestone = Math.floor(state.consumedFruitTotal / STAT_FOOD_STEP);
    const meatMilestone = Math.floor(state.consumedMeatTotal / STAT_FOOD_STEP);
    if (fruitMilestone > state.statFruitMilestones) {
      const prevInt = state.tribeInt;
      state.tribeInt += fruitMilestone - state.statFruitMilestones;
      state.statFruitMilestones = fruitMilestone;
      addLog(`INT +${state.tribeInt - prevInt}`);
      showStatNotice("INT", state.tribeInt - prevInt);
      if (prevInt < 10 && state.tribeInt >= 10) showVision("STONE HAS PURPOSE");
      if (prevInt < 15 && state.tribeInt >= 15) showVision("THE BRANCH FEELS USEFUL");
    }
    if (meatMilestone > state.statMeatMilestones) {
      const prevAtk = state.tribeAtk;
      state.tribeAtk += meatMilestone - state.statMeatMilestones;
      state.statMeatMilestones = meatMilestone;
      addLog(`ATK +${state.tribeAtk - prevAtk}`);
      showStatNotice("ATK", state.tribeAtk - prevAtk);
    }
  }

  function showStatNotice(stat, delta) {
    state.notice = { text: `${stat} +${delta}`, until: performance.now() + 2500, stat: true };
  }

  function updateResidentForage() {
    if (state.population < 2 || state.bases.length === 0) return;
    if (state.turn - state.lastForageTurn < RESIDENT_FORAGE_INTERVAL) return;
    state.lastForageTurn = state.turn;
    const chance = Math.min(0.78, 0.36 + state.population * 0.06);
    if (seededNoise(state.turn * 7, state.population * 17) > chance) return;
    const amount = Math.min(4, Math.max(1, Math.floor(state.population / 2)));
    state.tribe.fruit += amount;
    // addLog(`FORAGE +${amount}`);
  }

  function updateAnimals() {
    if (!Array.isArray(state.animals)) state.animals = [];
    spawnWildAnimals();
    if (state.turn % 3 === 0) {
      for (const animal of state.animals) {
        let dir;
        const px = state.player.gridX, py = state.player.gridY;
        const dist = manhattanDistance(animal.x, animal.y, px, py);
        if (dist > 6 && dist < 30 && seededNoise(animal.x + state.turn, animal.y) > 0.4) {
          const dx = px - animal.x, dy = py - animal.y;
          if (Math.abs(dx) >= Math.abs(dy)) dir = [dx > 0 ? 1 : -1, 0];
          else dir = [0, dy > 0 ? 1 : -1];
        } else {
          dir = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]][randomInt(0, 4)];
        }
        const nextX = animal.x + dir[0];
        const nextY = animal.y + dir[1];
        if (isAnimalTileAllowed(nextX, nextY)) {
          animal.x = nextX;
          animal.y = nextY;
        }
      }
    }
  }

  function spawnWildAnimals() {
    if (state.animals.length >= ANIMAL_COUNT) return;
    if (state.turn % 2 !== 0) return;
    let attempts = 0;
    while (state.animals.length < ANIMAL_COUNT && attempts < 20) {
      attempts += 1;
      const angle = seededNoise(state.turn + attempts, state.population) * Math.PI * 2;
      const radius = 9 + Math.floor(seededNoise(attempts, state.turn) * 18);
      const x = Math.max(2, Math.min(MAP_W - 3, Math.floor(state.player.gridX + Math.cos(angle) * radius)));
      const y = Math.max(2, Math.min(MAP_H - 3, Math.floor(state.player.gridY + Math.sin(angle) * radius)));
      if (!isAnimalTileAllowed(x, y)) continue;
      if (isVisibleTile(x, y)) continue;
      if (state.animals.some((animal) => animal.x === x && animal.y === y)) continue;
      const type = animalTypes[seededNoise(x * 23, y * 29) > 0.76 ? 1 : 0];
      state.animals.push({
        id: cryptoRandomId(),
        type: type.id,
        x,
        y,
        attack: type.attack,
        hp: type.hp,
        maxHp: type.hp,
        meat: type.meat,
      });
      return;
    }
  }

  function isAnimalTileAllowed(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
    const tile = state.map[y][x];
    if (!isBuildableTile(tile)) return false;
    if (state.bases.some((base) => manhattanDistance(base.x, base.y, x, y) <= 8)) return false;
    return true;
  }

  function updateInventions() {
    for (const item of wisdomMilestones) {
      if (state.wisdom >= item.cost && !state.inventions[item.id]) {
        state.inventions[item.id] = true;
        addLog("発明");
      }
    }
  }

  function updateEvolution() {
    const nextStage = getEvolutionStage();
    if (nextStage > state.evolutionStage) {
      state.evolutionStage = nextStage;
      addLog("VIEW UP");
      addPopup(state.player.gridX, state.player.gridY, `EV${nextStage}`);
      revealVisibleTiles(state);
    } else {
      state.evolutionStage = nextStage;
    }
    checkBuddyUnlock();
  }

  function checkBuddyUnlock() {
    if (state.buddyUnlocked) return;
    if (state.population >= 6 && state.evolutionStage >= 1) {
      state.buddyUnlocked = true;
      showVision("TOGETHER");
    }
  }

  function getEvolutionStage() {
    if (!state) return 0;
    if (state.wisdom >= 18 && state.population >= 10 && state.generation >= 3) return 3;
    if (state.wisdom >= 10 && state.population >= 8 && state.generation >= 2) return 2;
    if (state.wisdom >= 5 && state.population >= 6) return 1;
    return 0;
  }

  function closeAllMenusForMilestone() {
    state.baseMenuOpen = false;
    state.craftMenuOpen = false;
    state.laborMenuOpen = false;
    state.gameMenuOpen = false;
    state.systemMenuOpen = false;
    state.placingCamp = false;
    state.campCursor = null;
    baseMenuIndex = 0;
    craftMenuIndex = 0;
    laborMenuIndex = 0;
    gameMenuIndex = 0;
    systemMenuIndex = 0;
  }

  function showMilestone(title, visionText) {
    if (!state) return;
    closeAllMenusForMilestone();
    state.milestoneOverlay = {
      title,
      text: visionText,
      timer: 0,
      duration: 120
    };
  }

  function drawMilestoneOverlay() {
    if (!state || !state.milestoneOverlay) return;
    const ov = state.milestoneOverlay;
    ov.timer += 1;
    if (ov.timer >= ov.duration) {
      state.milestoneOverlay = null;
      return;
    }
    const panelW = Math.min(380, PLAY_W - 48);
    const panelH = 110;
    const px = GAME_X + Math.floor((PLAY_W - panelW) / 2);
    const py = GAME_Y + Math.floor((PLAY_H - panelH) / 2);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(GAME_X, GAME_Y, PLAY_W, PLAY_H);
    ctx.fillStyle = "rgba(0,0,0,0.95)";
    ctx.fillRect(px, py, panelW, panelH);
    drawPixelFrame(px, py, panelW, panelH, 2, "#fff");
    const titleScale = 3;
    const titleW = measurePixelText(ov.title) * titleScale;
    const titleX = px + Math.floor((panelW - titleW) / 2);
    drawPixelTextScaled(ov.title, titleX, py + 14, titleScale, "#fff");
    const textScale = 2;
    const textW = measurePixelText(ov.text) * textScale;
    const textX = px + Math.floor((panelW - textW) / 2);
    drawPixelTextScaled(ov.text, textX, py + 52, textScale, "#aaa");
    ctx.restore();
  }

  function doAction() {
    if (!state) return;
    if (mode !== "playing") return;
    if (state.milestoneOverlay) return;
    if (restSequenceStart && !restSequenceDone) return;
    if (state.gameMenuOpen || state.systemMenuOpen || state.baseMenuOpen || state.laborMenuOpen) return;
    if (state.placingCamp) {
      placeNewCamp();
      return;
    }
    if (isPlayerAnimating()) return;
    if (state.bases.length === 0) {
      const wasAtLimit = state.player.hp <= 0;
      if (placeBase()) {
        state.player.hp = Math.max(0, state.player.hp - ACTION_HP_COST);
        if (!wasAtLimit && state.player.hp <= 0) addLog("限界だ");
        advanceTurn("ACTION");
        if (mode !== "playing") return;
        if (wasAtLimit && state.player.hp <= 0) {
          damageLife(LIMIT_ACTION_LIFE_COST, "命を削った");
          if (mode !== "playing") return;
        }
      }
      return;
    }
    if (state.craftMenuOpen) return;
    const target = findActionTarget();
    const wasAtLimit = state.player.hp <= 0;
    const acted = target ? runActionTarget(target) : false;
    if (acted) {
      state.player.hp = Math.max(0, state.player.hp - ACTION_HP_COST);
      if (!wasAtLimit && state.player.hp <= 0) addLog("限界だ");
      advanceTurn("ACTION");
      if (mode !== "playing") return;
      if (wasAtLimit && state.player.hp <= 0) {
        damageLife(LIMIT_ACTION_LIFE_COST, "命を削った");
        if (mode !== "playing") return;
      }
      if (state.player.hp <= LOW_HP_THRESHOLD) addLog("HP低下");
    }
  }

  function findActionTiles() {
    const p = state.player;
    return ACTION_DIRS.map(([dx, dy]) => ({ x: p.gridX + dx, y: p.gridY + dy })).filter(({ x, y }) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H);
  }

  function findActionTarget() {
    const tiles = findActionTiles();
    const base = state.bases.find((item) => item.x === state.player.gridX && item.y === state.player.gridY);
    if (base) return { type: "base", x: base.x, y: base.y, base };
    for (const tile of tiles) {
      const animal = state.animals.find((item) => item.x === tile.x && item.y === tile.y);
      if (animal) return { type: "animal", x: tile.x, y: tile.y, animal };
    }
    for (const tile of tiles) {
      const relic = state.relics.find((item) => !item.recovered && item.x === tile.x && item.y === tile.y);
      if (relic) return { type: "relic", x: tile.x, y: tile.y, relic };
    }
    for (const tile of tiles) {
      const target = gatherTargetAt(tile, true);
      if (target) return target;
    }
    for (const tile of tiles) {
      if (state.monolith && state.monolith.x === tile.x && state.monolith.y === tile.y) return { type: "monolith", x: tile.x, y: tile.y };
    }
    for (const tile of tiles) {
      const target = gatherTargetAt(tile, false);
      if (target) return target;
    }
    return null;
  }

  function gatherTargetAt(tile, knownOnly) {
    const key = `${tile.x},${tile.y}`;
    const resource = state.resources && state.resources[key];
    if (state.bases.some((base) => base.x === tile.x && base.y === tile.y)) return null;
    if (!resource || resource.remaining <= 0 || resource.harvested) return null;
    const known = isMaterialKnown(resource.type);
    if (knownOnly && !known) return null;
    if (!knownOnly && known) return null;
    return { type: "gather", x: tile.x, y: tile.y, resource, key };
  }

  function runActionTarget(target) {
    if (target.type === "relic") return recoverRelic(target.relic);
    if (target.type === "monolith") return touchMonolith();
    if (target.type === "base") return openBaseMenu();
    if (target.type === "craft") return openCraftMenu();
    if (target.type === "animal") return huntAnimal(target.animal);
    if (target.type === "gather") return gatherTile(target);
    return false;
  }

  function huntAnimal(animal) {
    if (!animal) return false;
    if (!state.huntingUnlocked) {
      addLog("YOU DON'T UNDERSTAND THIS CREATURE");
      return true;
    }
    const p = state.player;
    const type = animalTypes.find((item) => item.id === animal.type) || animalTypes[0];
    if (!Number.isFinite(animal.hp)) animal.hp = type.hp;
    const damage = Math.max(2, 2 + Math.floor((p.strength || 1) / 2));
    animal.hp -= damage;
    p.hp = Math.max(0, p.hp - (animal.attack || type.attack || 4));
    addLog("HIT");
    addPopup(animal.x, animal.y, "HIT");
    if (p.hp <= LOW_HP_THRESHOLD) addLog("DMG");
    if (animal.hp > 0) return true;
    const firstHunt = !state.discoveries.gather_meat;
    const meatAmt = animal.meat || type.meat || 2;
    const leatherAmt = animal.leather || type.leather || 1;
    p.inventory.meat += meatAmt;
    p.inventory.leather += leatherAmt;
    p.hunting += 1;
    clampInventory();
    state.animals = state.animals.filter((item) => item.id !== animal.id);
    state.hunted.push({ turn: state.turn, animal });
    addWisdom("gather_meat", 1);
    addAchievement("獲物を狩った");
    addLog(`M +${meatAmt}  LT +${leatherAmt}`);
    addPopup(animal.x, animal.y, `M+${meatAmt}`);
    if (firstHunt) showMilestone("UNDERSTOOD LEATHER", "WE CAN GROW STRONGER");
    return true;
  }

  function tryGather() {
    const p = state.player;
    if (inventoryTotal(p.inventory) >= getPlayerCapacity()) {
      addLog("BAG FULL");
      return false;
    }
    const target = findActionTarget();
    if (!target) {
      addLog("近くに採集できるものがない。");
      return false;
    }
    if (target.type !== "gather") return false;
    return gatherTile(target);
  }

  function gatherTile(target) {
    const p = state.player;
    if (inventoryTotal(p.inventory) >= getPlayerCapacity()) {
      addLog("BAG FULL");
      return false;
    }
    if (!isMaterialKnown(target.resource.type)) {
      addLog("?");
      return false;
    }
    const amount = gatherAmount();
    if (target.resource.type === Resource.FRUIT) {
      const firstFruit = !state.discoveries.gather_fruit;
      p.inventory.fruit += amount;
      addWisdom("gather_fruit", 1);
      addAchievement("果物を採集した");
      addLog(`F +${amount}`);
      addPopup(target.x, target.y, `F+${amount}`);
      if (firstFruit) showMilestone("UNDERSTOOD FRUIT", "FRUIT SUSTAINS LIFE");
    }
    if (target.resource.type === Resource.WOOD) {
      const firstBranch = !state.understoodBranch;
      if (firstBranch) {
        state.understoodBranch = true;
        state.craftingUnlocked = true;
        syncKnownMaterials();
        addWisdom("gather_wood", 1);
        addLog("UNDERSTOOD BRANCH");
        showMilestone("UNDERSTOOD BRANCH", "LIFE FEEDS LIFE");
      }
      p.inventory.wood += amount;
      addAchievement("木を採集した");
      addLog(`W +${amount}`);
      addPopup(target.x, target.y, `W+${amount}`);
    }
    if (target.resource.type === Resource.STONE) {
      const firstStone = !state.understoodStone;
      if (firstStone) {
        state.understoodStone = true;
        syncKnownMaterials();
        addWisdom("gather_stone", 1);
        addLog("UNDERSTOOD STONE");
        showMilestone("UNDERSTOOD STONE", "STONE HAS PURPOSE");
      }
      p.inventory.stone += amount;
      addAchievement("石を採集した");
      addLog(`S +${amount}`);
      addPopup(target.x, target.y, `S+${amount}`);
    }
    if (target.resource.type === Resource.FLINT) {
      const firstFlint = !state.discoveries.gather_flint;
      if (firstFlint) {
        state.discoveries.gather_flint = true;
        addLog("FLINT");
        showMilestone("UNDERSTOOD FLINT", "THIS STONE IS DIFFERENT");
      }
      p.inventory.flint += amount;
      addLog(`FL +${amount}`);
      addPopup(target.x, target.y, `FL+${amount}`);
    }
    clampInventory();
    const resource = target.resource;
    resource.harvested = true;
    if (typeof resource.remaining === "number") {
      resource.remaining -= 1;
      if (resource.remaining <= 0) {
        resource.remaining = 0;
        resource.regrowTimer = RESOURCE_REGROW_TIME[resource.type] || 100;
        addLog("BARREN");
      }
    }
    return true;
  }

  function isMaterialKnown(type) {
    const actorInt = state && Number.isFinite(state.tribeInt) ? state.tribeInt : 1;
    if (type === Resource.FRUIT) return true;
    if (type === Resource.STONE) return actorInt >= 10;
    if (type === Resource.WOOD) return actorInt >= 15;
    if (type === Resource.FLINT) return actorInt >= 10;
    if (type === "meat") return !!state.huntingUnlocked;
    if (type === Resource.LEATHER) return !!state.huntingUnlocked;
    return true;
  }

  function touchMonolith() {
    state.monolithTouched = true;
    state.visionBoostUntilTurn = state.turn + MONOLITH_VISION_BOOST_TURNS;
    syncKnownMaterials();
    addAchievement("黒い石に触れた");
    addLog(state.discoveries.monolith_touch ? "何かを見た" : "黒い石に触れた");
    state.discoveries.monolith_touch = true;
    revealVisibleTiles(state);
    return true;
  }

  function findGatherTarget(range) {
    const target = findActionTarget();
    return target && target.type === "gather" ? target : null;
  }

  function addPopup(x, y, text) {
    addLog(text);
  }

  function gatherAmount() {
    return 1;
  }

  function tryBaseAction() {
    const base = nearestBase(1.5);
    if (!base) return false;
    return depositToBase(base);
  }

  function openCraftMenu() {
    if (!state.craftingUnlocked) return false;
    state.craftMenuOpen = true;
    state.gameMenuOpen = false;
    state.systemMenuOpen = false;
    craftMenuIndex = 0;
    if (!Array.isArray(state.craftSlots)) state.craftSlots = ["FRUIT", "BRANCH"];
    addLog("CRAFT");
    return false;
  }

  function moveCraftMenuSelection(delta) {
    craftMenuIndex = (craftMenuIndex + delta + 4) % 4;
  }

  function activateCraftMenuSelection() {
    if (!state.craftMenuOpen) return;
    if (craftMenuIndex === 2) {
      tryCraftCombination();
      return;
    }
    state.craftMenuOpen = false;
  }

  function cycleCraftSlot(slotIndex, dir = 1) {
    const items = getUnlockedItemLabels();
    if (items.length === 0) return;
    const current = state.craftSlots[slotIndex] || items[0];
    const idx = items.indexOf(current);
    state.craftSlots[slotIndex] = items[(idx + dir + items.length) % items.length];
  }

  function getUnlockedItemLabels() {
    const items = [];
    if (state.understoodBranch) items.push("BRANCH");
    if (state.understoodStone) items.push("STONE");
    if (state.discoveries.gather_flint) items.push("FLINT");
    if (state.huntingUnlocked && state.discoveries.gather_meat) items.push("LEATHER");
    for (const r of CRAFT_RECIPES) {
      if (r.isInputItem && state.craftedItems.includes(r.id)) items.push(r.name);
    }
    return items;
  }

  function tryCraftCombination() {
    const key = [...state.craftSlots].sort().join("+");
    for (const recipe of CRAFT_RECIPES) {
      if ([...recipe.inputs].sort().join("+") !== key) continue;
      for (const pre of recipe.prereqs) {
        if (!state.craftedItems.includes(pre)) { addLog("MISSING PIECE"); return; }
      }
      if (!recipe.isKnowledge && state.craftedItems.includes(recipe.id)) { addLog("ALREADY KNOWN"); return; }
      if (!consumeCraftCost(recipe.cost)) { addLog("NOT ENOUGH"); return; }
      const firstTime = !state.discoveries[recipe.wisKey];
      if (recipe.isKnowledge) {
        state.knewSpark = true;
      } else {
        state.craftedItems.push(recipe.id);
      }
      if (recipe.bonus?.atk) { state.tribeAtk += recipe.bonus.atk; showStatNotice("ATK", recipe.bonus.atk); }
      if (recipe.effect === "hunting") { state.huntingUnlocked = true; syncKnownMaterials(); }
      if (firstTime) {
        state.discoveries[recipe.wisKey] = true;
        state.wisdom += 1;
        addLog("UNDERSTOOD");
        addLog(recipe.name);
        addLog("WIS +1");
        showMilestone("UNDERSTOOD " + recipe.name, recipe.vision);
      } else {
        addLog("UNDERSTOOD");
        addLog(recipe.name);
      }
      return;
    }
    addLog("NO IDEA");
  }

  function consumeCraftCost(cost) {
    if (!cost) return true;
    const tribe = state.tribe;
    const inv = state.player.inventory;
    const labelToKey = { BRANCH: "wood", STONE: "stone", FRUIT: "fruit", MEAT: "meat", LEATHER: "leather", FLINT: "flint" };
    for (const [raw, amount] of Object.entries(cost)) {
      const k = labelToKey[raw] || raw;
      if ((tribe[k] || 0) + (inv[k] || 0) < amount) return false;
    }
    for (const [raw, amount] of Object.entries(cost)) {
      const k = labelToKey[raw] || raw;
      let rem = amount;
      const fromTribe = Math.min(tribe[k] || 0, rem);
      tribe[k] = (tribe[k] || 0) - fromTribe;
      rem -= fromTribe;
      inv[k] = (inv[k] || 0) - rem;
    }
    return true;
  }

  function getCraftBonus(key) {
    if (!state || !Array.isArray(state.craftedItems)) return 0;
    return state.craftedItems.reduce((sum, id) => {
      const r = CRAFT_RECIPES.find(r => r.id === id);
      return sum + (r?.bonus?.[key] || 0);
    }, 0);
  }

  function openBaseMenu() {
    state.baseMenuOpen = true;
    state.gameMenuOpen = false;
    state.systemMenuOpen = false;
    state.craftMenuOpen = false;
    baseMenuIndex = 0;
    return false;
  }

  function getBaseMenuOptions() {
    const options = ["REST"];
    if (state.buddyUnlocked) options.push(state.buddyOn ? "BUDDY ON" : "BUDDY OFF");
    if (state.craftingUnlocked) options.push("CRAFT");
    if (state.knewSpark && !state.hasFire) options.push("MAKE FIRE");
    if (state.settlementUnlocked) {
      const cur = getCurrentBase();
      if (cur && baseLevel(cur) < MAX_LEVEL) options.push("UPGRADE CAMP");
      options.push("ESTABLISH CAMP");
    }
    if (state.laborUnlocked) options.push("ASSIGN WORK");
    return options;
  }

  function moveBaseMenuSelection(delta) {
    const options = getBaseMenuOptions();
    baseMenuIndex = (baseMenuIndex + delta + options.length) % options.length;
  }

  function activateBaseMenuSelection() {
    const option = getBaseMenuOptions()[baseMenuIndex];
    if (option === "REST") {
      startRestSequence();
      return;
    }
    if (option === "BUDDY ON" || option === "BUDDY OFF") {
      state.buddyOn = !state.buddyOn;
      addLog(state.buddyOn ? "BUDDY ON" : "BUDDY OFF");
      return;
    }
    if (option === "CRAFT") {
      state.baseMenuOpen = false;
      openCraftMenu();
      return;
    }
    if (option === "ASSIGN WORK") {
      state.baseMenuOpen = false;
      openLaborMenu();
      return;
    }
    if (option === "ESTABLISH CAMP") {
      state.baseMenuOpen = false;
      state.placingCamp = true;
      state.campCursor = { x: state.player.gridX, y: state.player.gridY };
      addLog("MOVE CURSOR, ACT TO PLACE");
      return;
    }
    if (option === "UPGRADE CAMP") {
      upgradeCamp();
      return;
    }
    if (option === "MAKE FIRE") {
      state.hasFire = true;
      state.baseMenuOpen = false;
      const firstFire = !state.discoveries.make_fire;
      if (firstFire) {
        state.discoveries.make_fire = true;
        state.wisdom += 1;
        addLog("UNDERSTOOD");
        addLog("FIRE");
        addLog("WIS +1");
        showMilestone("UNDERSTOOD FIRE", "THE NIGHT CAN CHANGE");
      } else {
        addLog("FIRE LIT");
      }
    }
  }

  function openLaborMenu() {
    state.laborMenuOpen = true;
    state.gameMenuOpen = false;
    state.systemMenuOpen = false;
    state.baseMenuOpen = false;
    state.craftMenuOpen = false;
    laborMenuIndex = 0;
  }

  function moveLaborMenuSelection(delta) {
    laborMenuIndex = (laborMenuIndex + delta + LABOR_JOBS.length) % LABOR_JOBS.length;
  }

  function adjustLaborJob(delta) {
    const job = LABOR_JOBS[laborMenuIndex];
    if (!job || !isLaborJobUnlocked(job.id)) return;
    const avail = getLaborAvailable();
    const total = getLaborTotal();
    const current = state.labor[job.id] || 0;
    if (delta > 0) {
      if (total >= avail) return; // no slots left
      state.labor[job.id] = current + 1;
    } else {
      if (current <= 0) return;
      state.labor[job.id] = current - 1;
    }
  }

  function startRestSequence() {
    state.baseMenuOpen = false;
    restSequenceStart = performance.now();
    restSequenceDone = false;
    restResourcesRefreshed = false;
  }

  function updateRestSequence() {
    if (!restSequenceStart || restSequenceDone) return;
    const elapsed = performance.now() - restSequenceStart;
    if (!restResourcesRefreshed && elapsed >= 1800) {
      restResourcesRefreshed = true;
      finishRestSequence();
    }
    if (elapsed >= 3400) {
      restSequenceDone = true;
    }
  }

  function finishRestSequence() {
    depositToBase();
    state.player.hp = 100;
    if (state.resources) {
      for (const r of Object.values(state.resources)) {
        if (r && r.harvested && r.remaining > 0) r.harvested = false;
      }
    }
    saveGame();
  }


  function getPlayerCapacity() {
    const base = 10 + getCraftBonus("capacityBonus");
    return state && state.buddyOn ? base + 10 : base;
  }

  function autoDepositOnBase() {
    if (!state || !state.player) return;
    const p = state.player;
    const onBase = state.bases.some((b) => b.x === p.gridX && b.y === p.gridY);
    if (!onBase) return;
    const total = inventoryTotal(p.inventory);
    if (total <= 0) return;
    const fruitStored = p.inventory.fruit || 0;
    const meatStored = p.inventory.meat || 0;
    const woodStored = p.inventory.wood || 0;
    const stoneStored = p.inventory.stone || 0;
    const leatherStored = p.inventory.leather || 0;
    const flintStored = p.inventory.flint || 0;
    state.tribe.fruit += p.inventory.fruit;
    state.tribe.meat += p.inventory.meat;
    state.tribe.wood += p.inventory.wood;
    state.tribe.stone += p.inventory.stone;
    state.tribe.leather += p.inventory.leather;
    state.tribe.flint += p.inventory.flint;
    p.inventory.fruit = 0;
    p.inventory.meat = 0;
    p.inventory.wood = 0;
    p.inventory.stone = 0;
    p.inventory.leather = 0;
    p.inventory.flint = 0;
    if (fruitStored > 0) addLog("FRUIT STORED");
    if (meatStored > 0) addLog("MEAT STORED");
    if (woodStored > 0) addLog("WOOD STORED");
    if (stoneStored > 0) addLog("STONE STORED");
    if (leatherStored > 0) addLog("LEATHER STORED");
    if (flintStored > 0) addLog("FLINT STORED");
    if (fruitStored > 0 || meatStored > 0) applyStoredStatGrowth(fruitStored, meatStored);
  }

  function depositToBase() {
    const inv = state.player.inventory;
    const total = inventoryTotal(inv);
    if (total <= 0) {
      return false;
    }
    const fruitStored = inv.fruit || 0;
    const meatStored = inv.meat || 0;
    const woodStored = inv.wood || 0;
    const stoneStored = inv.stone || 0;
    const leatherStored = inv.leather || 0;
    const flintStored = inv.flint || 0;
    state.tribe.fruit += fruitStored;
    state.tribe.meat += meatStored;
    state.tribe.wood += woodStored;
    state.tribe.stone += stoneStored;
    state.tribe.leather += leatherStored;
    state.tribe.flint += flintStored;
    if (fruitStored > 0) addLog("FRUIT STORED");
    if (meatStored > 0) addLog("MEAT STORED");
    if (woodStored > 0) addLog("WOOD STORED");
    if (stoneStored > 0) addLog("STONE STORED");
    if (leatherStored > 0) addLog("LEATHER STORED");
    if (flintStored > 0) addLog("FLINT STORED");
    if (fruitStored > 0 || meatStored > 0) applyStoredStatGrowth(fruitStored, meatStored);
    inv.fruit = 0;
    inv.meat = 0;
    inv.wood = 0;
    inv.stone = 0;
    inv.leather = 0;
    inv.flint = 0;
    return true;
  }

  function placeBase() {
    const x = state.player.gridX;
    const y = state.player.gridY;
    if (state.bases.length > 0) {
      addLog("巣はひとつだけ");
      return false;
    }
    const tile = state.map[y][x];
    if (!isBuildableTile(tile)) {
      addLog("ここには作れない");
      return false;
    }
    state.bases.push({ x, y, type: "BASE", name: "巣", level: 1 });
    addWisdom("base", 1);
    addAchievement("拠点を作った");
    addLog("BASE SET");
    showMilestone("UNDERSTOOD BASE", "REST IS POSSIBLE");
    return true;
  }

  function placeNewCamp() {
    if (!state.placingCamp || !state.campCursor) return;
    const { x, y } = state.campCursor;
    const status = campPlacementStatus(x, y);
    if (status === "terrain") {
      addLog("BLOCKED TERRAIN");
      return;
    }
    if (status === "tooClose") {
      addLog("TOO CLOSE TO CAMP");
      return;
    }
    if (status === "tooFar") {
      addLog("TOO FAR FROM CAMP");
      return;
    }
    const CAMP_COST = { wood: 20, stone: 10, leather: 5 };
    const curWood    = state.tribe.wood    || 0;
    const curStone   = state.tribe.stone   || 0;
    const curLeather = state.tribe.leather || 0;
    if (curWood < CAMP_COST.wood || curStone < CAMP_COST.stone || curLeather < CAMP_COST.leather) {
      state.placingCamp = false;
      state.campCursor = null;
      addLog("NOT ENOUGH RESOURCE");
      if (curWood    < CAMP_COST.wood)    addLog(`NEED BRANCH ${CAMP_COST.wood}(/${curWood})`);
      if (curStone   < CAMP_COST.stone)   addLog(`NEED STONE ${CAMP_COST.stone}(/${curStone})`);
      if (curLeather < CAMP_COST.leather) addLog(`NEED LEATHER ${CAMP_COST.leather}(/${curLeather})`);
      return;
    }
    state.tribe.wood -= CAMP_COST.wood;
    state.tribe.stone -= CAMP_COST.stone;
    state.tribe.leather -= CAMP_COST.leather;
    state.bases.push({ x, y, type: "CAMP", name: "野営地", level: 1 });
    revealAroundBases();
    state.placingCamp = false;
    state.campCursor = null;
    const isFirst = !state.discoveries.new_camp;
    if (isFirst) {
      state.discoveries.new_camp = true;
      addLog("UNDERSTOOD NEW CAMP");
      addLog("WIS +1");
      state.wisdom += 1;
      showMilestone("UNDERSTOOD NEW CAMP", "THE TRIBE SPREADS");
    } else {
      addLog("NEW CAMP BUILT");
    }
  }

  function upgradeCamp() {
    const base = getCurrentBase();
    if (!base) return;
    const level = baseLevel(base);
    if (level >= MAX_LEVEL) {
      addLog("MAX LEVEL");
      return;
    }
    const cost = UPGRADE_COSTS[level];
    if (!cost) {
      addLog("MAX LEVEL");
      return;
    }
    const curWood    = state.tribe.wood    || 0;
    const curStone   = state.tribe.stone   || 0;
    const curLeather = state.tribe.leather || 0;
    const curFlint   = state.tribe.flint   || 0;
    const needWood    = cost.wood    || 0;
    const needStone   = cost.stone   || 0;
    const needLeather = cost.leather || 0;
    const needFlint   = cost.flint   || 0;
    if (curWood < needWood || curStone < needStone || curLeather < needLeather || curFlint < needFlint) {
      addLog("NOT ENOUGH RESOURCE");
      if (curWood    < needWood)    addLog(`NEED BRANCH ${needWood}(/${curWood})`);
      if (curStone   < needStone)   addLog(`NEED STONE ${needStone}(/${curStone})`);
      if (curLeather < needLeather) addLog(`NEED LEATHER ${needLeather}(/${curLeather})`);
      if (curFlint   < needFlint)   addLog(`NEED FLINT ${needFlint}(/${curFlint})`);
      return;
    }
    state.tribe.wood    -= needWood;
    state.tribe.stone   -= needStone;
    state.tribe.leather -= needLeather;
    state.tribe.flint   -= needFlint;
    base.level = level + 1;
    state.baseMenuOpen = false;
    revealAroundBases();
    addLog("CAMP UPGRADED");
    showMilestone("CAMP UPGRADED", "THE TRIBE BUILDS HIGHER");
  }

  function tryRecoverRelic() {
    const target = findActionTarget();
    if (!target || target.type !== "relic") return false;
    return recoverRelic(target.relic);
  }

  function recoverRelic(relic) {
    const p = state.player;
    if (!relic) return false;
    migrateInventory(relic.inventory);
    p.inventory.fruit += relic.inventory.fruit;
    p.inventory.meat += relic.inventory.meat;
    p.inventory.wood += relic.inventory.wood;
    p.inventory.stone += relic.inventory.stone;
    p.strength += 1;
    p.gathering += 1;
    relic.recovered = true;
    const entry = state.history.find((h) => h.relicId === relic.id);
    if (entry) entry.recovered = true;
    clampInventory();
    addAchievement("遺品を回収した");
    addLog("遺品回収");
    return true;
  }

  function killPlayer(reason, forced = false) {
    if (mode !== "playing" && !forced) return;
    const p = state.player;
    const relicId = cryptoRandomId();
    const x = p.gridX;
    const y = p.gridY;
    state.relics.push({
      id: relicId,
      name: `${p.name}の遺品`,
      x,
      y,
      inventory: { ...p.inventory },
      recovered: false,
    });
    const history = {
      generation: p.generation,
      name: p.name,
      age: p.age,
      face: p.face,
      achievements: p.achievements.length ? [...new Set(p.achievements)] : ["遺品を残した"],
      deathPlace: `${x}, ${y}`,
      recovered: false,
      relicId,
      reason,
    };
    state.history.push(history);
    state.population = Math.max(0, state.population - 1);
    clampLaborToPopulation();
    addLog(`${p.name}は${reason}。${p.name}の遺品が残された。`);
    saveGame();
    if (state.population <= 0) {
      mode = "gameover";
      gameOverReason = "LAST ONE FELL";
      hideOverlay();
      return;
    }
    startDeathSequence(reason);
  }

  function startDeathSequence(reason = "") {
    mode = "death";
    deathSequenceStart = performance.now();
    deathSequenceReason = reason;
    generationCandidates = [];
    generationReason = noticeTextForCanvas(reason) || "DEATH";
    hideOverlay();
  }

  function updateDeathSequence() {
    if (mode !== "death") return;
    if (performance.now() - deathSequenceStart < DEATH_SEQUENCE_MS) return;
    mode = "generation";
    showGenerationSelect(deathSequenceReason);
  }

  function showGenerationSelect(reason = "") {
    const spawn = state.bases[state.bases.length - 1] || findSpawn(state.map);
    const survivorCount = Math.max(1, state.population);
    if (!Array.isArray(state.residents)) state.residents = [];
    while (state.residents.length < survivorCount) state.residents.push(createCharacter(state.generation + 1, spawn.x, spawn.y, getCurrentLineage()));
    generationCandidates = state.residents.slice(0, survivorCount).map((resident) => ({
      ...resident,
      generation: state.generation + 1,
      gridX: spawn.x,
      gridY: spawn.y,
      x: spawn.x + 0.5,
      y: spawn.y + 0.5,
      drawX: spawn.x,
      drawY: spawn.y,
      moveFromX: spawn.x,
      moveFromY: spawn.y,
      moveToX: spawn.x,
      moveToY: spawn.y,
      moveStart: 0,
      moveEnd: 0,
      hp: 100,
      inventory: { fruit: 0, meat: 0, wood: 0, stone: 0, leather: 0, flint: 0 },
      achievements: [],
    }));
    generationIndex = 0;
    generationReason = noticeTextForCanvas(reason) || "DEATH";
    deathSequenceReason = "";
    hideOverlay();
    candidateList.innerHTML = "";
    historyList.innerHTML = "";
  }

  function moveGenerationSelection(delta) {
    if (!generationCandidates.length) return;
    generationIndex = (generationIndex + delta + generationCandidates.length) % generationCandidates.length;
  }

  function activateGenerationSelection() {
    const candidate = generationCandidates[generationIndex];
    if (!candidate) return;
    state.generation += 1;
    state.player = candidate;
    state.residents = state.residents.filter((resident) => resident.id !== candidate.id);
    generationCandidates = [];
    generationReason = "";
    migrateTurnState();
    addLog(`GEN ${state.generation}`);
    mode = "playing";
    hideOverlay();
    saveGame();
  }

  function addWisdom(key, amount) {
    const wisdomKeys = new Set(["base", "gather_fruit", "gather_wood", "gather_stone", "gather_meat",
      "craft_sharp_stone", "craft_stone_knife", "craft_clothing", "craft_pack_frame", "craft_spark"]);
    if (!wisdomKeys.has(key)) return;
    if (!state || state.discoveries[key]) return;
    state.discoveries[key] = true;
    state.wisdom += amount;
    const achievement = achievementsByDiscovery[key];
    if (achievement) addAchievement(achievement);
    addLog(`叡智+${amount}`);
    syncKnownMaterials();
  }

  function addAchievement(text) {
    if (!state.player.achievements.includes(text)) state.player.achievements.push(text);
  }

  function addLog(text) {
    if (!state) return;
    state.log.unshift(text);
    state.log = state.log.slice(0, 8);
    const canvasText = noticeTextForCanvas(text);
    state.notice = { text, until: performance.now() + (isEmergencyNotice(canvasText) ? 3000 : 1500) };
    statusLine.textContent = text;
  }

  function draw() {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, INTERNAL_W, INTERNAL_H);
    const viewW = INTERNAL_W;
    const viewH = INTERNAL_H;
    updateShellMode();
    if (mode === "title" && !state) {
      drawTitleScreen(viewW, viewH);
      drawTitleControls();
      return;
    }
    if (mode === "iconPreview") {
      drawIconPreview();
      drawTitleControls();
      return;
    }
    if (!state) {
      drawTitleScreen(viewW, viewH);
      drawTitleControls();
      return;
    }
    drawWorld(viewW, viewH);
    updateDeathSequence();
    if (mode === "death") drawDeathSequence();
    if (mode === "generation") drawGenerationScreen();
    if (mode === "gameover") drawGameOverScreen();
    updateRestSequence();
    drawHudText();
    drawMilestoneOverlay();
  }

  function updateShellMode() {
    gameShell.classList.toggle("title-mode", mode === "title" && !state);
  }

  function drawWorld(viewW, viewH) {
    const p = state.player;
    const drawPos = getPlayerDrawPosition();
    const cameraX = drawPos.x * TILE_SIZE - PLAY_W / 2 + TILE_SIZE / 2 - GAME_X;
    const cameraY = drawPos.y * TILE_SIZE - PLAY_H / 2 + TILE_SIZE / 2 - GAME_Y;
    const actionTarget = findActionTarget();
    const startX = Math.max(0, Math.floor((cameraX + GAME_X) / TILE_SIZE) - 1);
    const startY = Math.max(0, Math.floor((cameraY + GAME_Y) / TILE_SIZE) - 1);
    const endX = Math.min(MAP_W, Math.ceil((cameraX + GAME_X + PLAY_W) / TILE_SIZE) + 1);
    const endY = Math.min(MAP_H, Math.ceil((cameraY + GAME_Y + PLAY_H) / TILE_SIZE) + 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(GAME_X, GAME_Y, PLAY_W, PLAY_H);
    ctx.clip();
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        drawTile(x, y, cameraX, cameraY, actionTarget);
      }
    }
    for (const base of state.bases) if (isSeenTile(base.x, base.y)) drawBase(base, cameraX, cameraY);
    if (state.placingCamp) drawCampRangeIndicators(cameraX, cameraY);
    if (state.placingCamp && state.campCursor) {
      const cx = state.campCursor.x;
      const cy = state.campCursor.y;
      const csx = Math.floor(cx * TILE_SIZE - cameraX);
      const csy = Math.floor(cy * TILE_SIZE - cameraY);
      const status = campPlacementStatus(cx, cy);
      // 有効=緑 / 近すぎ=赤 / 遠すぎ=灰 / 地形NG=赤
      const cursorColor = status === "ok" ? "#4f4"
        : status === "tooFar" ? "#888"
        : "#f44";
      ctx.fillStyle = cursorColor;
      ctx.fillRect(csx, csy, TILE_SIZE, 2);
      ctx.fillRect(csx, csy + TILE_SIZE - 2, TILE_SIZE, 2);
      ctx.fillRect(csx, csy, 2, TILE_SIZE);
      ctx.fillRect(csx + TILE_SIZE - 2, csy, 2, TILE_SIZE);
      if (status === "ok") drawCamp(csx, csy, 1);
    }
    if (state.huntingUnlocked) {
      for (const animal of state.animals) {
        if (!isVisibleTile(animal.x, animal.y)) continue;
        if (!state.discoveries.animal_seen) {
          state.discoveries.animal_seen = true;
          showVision("THEY FLEE");
        }
        drawAnimal(animal, cameraX, cameraY);
      }
    }
    for (const relic of state.relics) if (!relic.recovered && isVisibleTile(relic.x, relic.y)) drawRelic(relic, cameraX, cameraY);
    if (state.monolith && isVisibleTile(state.monolith.x, state.monolith.y)) drawMonolith(state.monolith, cameraX, cameraY);
    if (actionTarget) drawActionHint(actionTarget, cameraX, cameraY);
    drawPlayer(p, cameraX, cameraY);
    drawDirectionMarkers(cameraX, cameraY);
    ctx.restore();
    drawVision();
    drawNotice(cameraX, cameraY, drawPos);
    if (state.gameMenuOpen) drawGameMenu();
    if (state.baseMenuOpen) drawBaseMenu();
    if (state.craftMenuOpen) drawCraftMenu();
    if (state.systemMenuOpen) drawSystemMenu();
    if (state.placingCamp) drawCampPlacementHint();
    if (state.laborMenuOpen) drawLaborMenu();
    drawRestOverlay();
  }

  function drawGenerationScreen() {
    if (!generationCandidates.length) showGenerationSelect(generationReason || "DEATH");
    const panelW = Math.min(430, PLAY_W - 64);
    const panelH = 264;
    const x = GAME_X + Math.floor((PLAY_W - panelW) / 2);
    const y = GAME_Y + Math.floor((PLAY_H - panelH) / 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
    ctx.fillRect(GAME_X, GAME_Y, PLAY_W, PLAY_H);
    ctx.fillStyle = "#111";
    ctx.fillRect(x, y, panelW, panelH);
    drawPixelFrame(x, y, panelW, panelH, 3, "#fff");
    const title = "CHOOSE HEIR";
    drawPixelTextScaled(title, x + Math.floor((panelW - measurePixelText(title) * 2) / 2), y + 20, 2, "#fff");

    const PAGE_SIZE = 6;
    const totalPages = Math.ceil(generationCandidates.length / PAGE_SIZE);
    const page = Math.floor(generationIndex / PAGE_SIZE);
    const pageStart = page * PAGE_SIZE;
    const pageEnd = Math.min(pageStart + PAGE_SIZE, generationCandidates.length);
    const pageCount = pageEnd - pageStart;
    const gap = Math.floor(panelW / (pageCount + 1));
    const faceY = y + 108;

    for (let i = pageStart; i < pageEnd; i += 1) {
      const candidate = generationCandidates[i];
      const col = i - pageStart;
      const cx = x + gap * (col + 1);
      const selected = i === generationIndex;
      if (selected) {
        drawStar(cx, faceY - 38);
        ctx.fillStyle = "#fff";
        ctx.fillRect(cx - 12, faceY + 19, 24, 3);
      }
      drawStickPerson(ctx, cx, faceY, candidate.dirX || 0, candidate.dirY || 1);
      drawPixelTextScaled(`N${i + 1}`, cx - 12, faceY + 26, 2, selected ? "#fff" : "#777");
    }

    if (totalPages > 1) {
      const pageText = `< PAGE ${page + 1}/${totalPages} >`;
      const ptW = measurePixelText(pageText) * 2;
      drawPixelTextScaled(pageText, x + Math.floor((panelW - ptW) / 2), y + 152, 2, "#fff");
    }

    const chosen = generationCandidates[generationIndex];
    if (chosen) {
      const statY = y + panelH - 68;
      drawPixelTextScaled(`SELECTED N${generationIndex + 1}`, x + 18, statY, 2, "#fff");
      drawPixelTextScaled(`AGE ${chosen.age}  WIS ${chosen.inheritedWisdom}  INT ${chosen.intelligence}  ATK ${chosen.strength}`, x + 18, statY + 22, 2, "#fff");
    }
  }

  function drawStar(x, y) {
    const cycle = (performance.now() % 3000) / 3000;
    const wave = 0.5 - Math.cos(cycle * Math.PI * 2) * 0.5;
    const armY = Math.round(2 + wave * 4);
    const armX = Math.round(1 + wave * 1);
    const core = 1;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx - core, cy - armY, core * 2, armY * 2);
    ctx.fillRect(cx - armX, cy - core, armX * 2, core * 2);
    if (wave > 0.35) {
      ctx.fillRect(cx - core, cy - armY - 3, core * 2, 1);
      ctx.fillRect(cx - core, cy + armY + 2, core * 2, 1);
    }
  }

  function drawGameOverScreen() {
    const panelW = Math.min(460, PLAY_W - 48);
    const panelH = 172;
    const x = GAME_X + Math.floor((PLAY_W - panelW) / 2);
    const y = GAME_Y + Math.floor((PLAY_H - panelH) / 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.86)";
    ctx.fillRect(GAME_X, GAME_Y, PLAY_W, PLAY_H);
    ctx.fillStyle = "#111";
    ctx.fillRect(x, y, panelW, panelH);
    drawPixelFrame(x, y, panelW, panelH, 3, "#fff");
    drawPixelTextScaled("GAME OVER", x + 28, y + 26, 3, "#fff");
    drawPixelTextScaled(gameOverReason || "NO TRIBE", x + 30, y + 82, 2, "#fff");
    const blink = Math.floor(performance.now() / 420) % 2 === 0;
    if (blink) drawPixelTextScaled("A/MENU TITLE", x + 30, y + 126, 2, "#fff");
  }

  function drawDeathSequence() {
    const elapsed = Math.max(0, performance.now() - deathSequenceStart);
    const darkProgress = Math.min(1, elapsed / DEATH_DARKEN_MS);
    const fadeIn = Math.min(1, elapsed / DEATH_TYPE_MS);
    const fadeOutStart = DEATH_SEQUENCE_MS - DEATH_TEXT_FADE_OUT_MS;
    const fadeOut = elapsed <= fadeOutStart ? 1 : Math.max(0, 1 - (elapsed - fadeOutStart) / DEATH_TEXT_FADE_OUT_MS);
    const textAlpha = fadeIn * fadeOut;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.22 + darkProgress * 0.74})`;
    ctx.fillRect(GAME_X, GAME_Y, PLAY_W, PLAY_H);
    const lines = wrapPixelText(DEATH_MESSAGE, 34);
    const scale = 2;
    const lineH = 22;
    const startY = GAME_Y + Math.floor(PLAY_H / 2) - Math.floor((lines.length * lineH) / 2);
    ctx.save();
    ctx.globalAlpha = textAlpha;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const textW = measurePixelText(line) * scale;
      drawOutlinedPixelTextScaled(line, GAME_X + Math.floor((PLAY_W - textW) / 2), startY + i * lineH, scale);
    }
    ctx.restore();
  }

  function returnToTitle() {
    state = null;
    mode = "title";
    titlePanel = "";
    gameOverReason = "";
    hideOverlay();
  }

  function showPreviewFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const preview = params.get("preview");
    if (!preview) return;
    state = makeState();
    migrateTurnState();
    revealVisibleTiles(state);
    if (preview === "generation") {
      state.population = 3;
      mode = "generation";
      showGenerationSelect("DEATH");
      return;
    }
    if (preview === "death") {
      state.population = 3;
      startDeathSequence("DEATH");
      return;
    }
    if (preview === "gameover") {
      mode = "gameover";
      gameOverReason = "NO TRIBE";
      hideOverlay();
      return;
    }
    if (preview === "icons") {
      mode = "iconPreview";
      hideOverlay();
    }
  }

  function currentBiomeName() {
    if (!state || !state.player) return "未知の地";
    const tile = state.map[state.player.gridY][state.player.gridX];
    if (tile === Tile.FOREST) return "小さい森";
    if (tile === Tile.DEEP_FOREST) return "深い森";
    if (tile === Tile.GRASS) return "平原";
    if (tile === Tile.MOUNTAIN) return "山岳地帯";
    if (tile === Tile.HIGH_MOUNTAIN) return "高い山";
    if (tile === Tile.RIVER) return "川辺";
    if (tile === Tile.SEA) return "海辺";
    if (tile === Tile.MONOLITH) return "黒い石の前";
    return "未知の地";
  }

  function getDiscoveryLog() {
    if (!state) return [];
    const log = [];
    if (state.huntingUnlocked) log.push("HUNT");
    if (state.craftingUnlocked) log.push("CRAFT");
    if (state.buddyUnlocked) log.push("BUDDY");
    if (state.settlementUnlocked) log.push("SETTLEMENT");
    for (const r of CRAFT_RECIPES) {
      if (state.discoveries[r.wisKey]) log.push(r.name);
    }
    if (state.discoveries.new_camp) log.push("NEW CAMP");
    return log;
  }

  function getGoalSteps() {
    if (!state) return [];
    const all = [
      { text: "SET YOUR BASE", done: state.bases.length > 0 },
      { text: "FIND FRUIT", done: !!state.discoveries.gather_fruit },
      { text: "UNDERSTAND STONE", done: !!state.understoodStone },
      { text: "UNDERSTAND BRANCH", done: !!state.understoodBranch },
      { text: "FIND ANIMAL", done: !!state.discoveries.animal_seen },
      { text: "TRY CRAFT", done: !!(state.inventions && state.inventions.stone_tools) },
    ];
    // Show only completed steps + the next one pending (hidden as ???)
    const result = [];
    let foundPending = false;
    for (const step of all) {
      if (step.done) {
        result.push(step);
      } else if (!foundPending) {
        foundPending = true;
        result.push({ text: "???", done: false });
      }
    }
    return result;
  }

  function showVision(line) {
    visionQueue.push(line);
  }

  function updateVisionQueue() {
    if (visionCurrent !== null) {
      const elapsed = performance.now() - visionStart;
      if (elapsed >= VISION_TOTAL_MS) {
        visionCurrent = null;
        visionStart = 0;
      } else {
        return;
      }
    }
    if (visionQueue.length > 0) {
      visionCurrent = visionQueue.shift();
      visionStart = performance.now();
    }
  }

  function drawVision() {
    updateVisionQueue();
    if (visionCurrent === null) return;
    const elapsed = performance.now() - visionStart;
    let alpha;
    if (elapsed < VISION_FADE_IN_MS) {
      alpha = elapsed / VISION_FADE_IN_MS;
    } else if (elapsed < VISION_FADE_IN_MS + VISION_HOLD_MS) {
      alpha = 1;
    } else {
      alpha = 1 - (elapsed - VISION_FADE_IN_MS - VISION_HOLD_MS) / VISION_FADE_OUT_MS;
    }
    alpha = Math.max(0, Math.min(1, alpha));
    ctx.save();
    ctx.globalAlpha = alpha;
    const labelScale = 2;
    const textScale = 3;
    const labelW = measurePixelText("VISION") * labelScale;
    const bodyW = measurePixelText(visionCurrent) * textScale;
    const panelW = Math.max(labelW, bodyW) + 32;
    const panelH = 80;
    const px = GAME_X + Math.floor((PLAY_W - panelW) / 2);
    const py = GAME_Y + Math.floor(PLAY_H * 0.1);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(px, py, panelW, panelH);
    drawPixelFrame(px, py, panelW, panelH, 2, "#fff");
    drawPixelTextScaled("VISION", px + Math.floor((panelW - labelW) / 2), py + 10, labelScale, "#fff");
    drawPixelTextScaled(visionCurrent, px + Math.floor((panelW - bodyW) / 2), py + 46, textScale, "#fff");
    ctx.restore();
  }

  function drawIconPreview() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
    ctx.fillStyle = "#111";
    ctx.fillRect(GAME_X, GAME_Y, PLAY_W, PLAY_H);
    drawPixelFrame(GAME_X, GAME_Y, PLAY_W, PLAY_H, 2, "#fff");
    drawPixelTextScaled("ICON LIST", GAME_X + 18, GAME_Y + 18, 2, "#fff");

    const icons = [
      { label: "PLAIN", kind: "tile", tile: Tile.GRASS },
      { label: "RIVER", kind: "tile", tile: Tile.RIVER },
      { label: "SMALL FOREST", kind: "tile", tile: Tile.FOREST },
      { label: "DENSE FOREST", kind: "tile", tile: Tile.DEEP_FOREST },
      { label: "MOUNTAIN", kind: "tile", tile: Tile.MOUNTAIN },
      { label: "HIGH MOUNTAIN", kind: "tile", tile: Tile.HIGH_MOUNTAIN },
      { label: "SEA", kind: "tile", tile: Tile.SEA },
      { label: "FRUIT", kind: "resource", resource: Resource.FRUIT, tile: Tile.FOREST },
      { label: "WOOD", kind: "resource", resource: Resource.WOOD, tile: Tile.DEEP_FOREST },
      { label: "STONE", kind: "resource", resource: Resource.STONE, tile: Tile.MOUNTAIN },
      { label: "FLINT", kind: "resource", resource: Resource.FLINT, tile: Tile.HIGH_MOUNTAIN },
      { label: "BASE", kind: "base", tile: Tile.GRASS },
      { label: "RELIC", kind: "relic", tile: Tile.GRASS },
      { label: "HARE", kind: "animal", animal: "hare", tile: Tile.GRASS },
      { label: "BOAR", kind: "animal", animal: "boar", tile: Tile.DEEP_FOREST },
      { label: "PLAYER", kind: "player", tile: Tile.GRASS },
      { label: "MONOLITH", kind: "monolith", tile: Tile.MONOLITH },
      { label: "STAR", kind: "star", tile: Tile.GRASS },
      { label: "ACTION", kind: "action", tile: Tile.GRASS },
    ];
    const cols = layoutMode === "landscape" ? 5 : 4;
    const cellW = Math.floor((PLAY_W - 36) / cols);
    const cellH = 82;
    const startX = GAME_X + 18;
    const startY = GAME_Y + 58;
    for (let i = 0; i < icons.length; i += 1) {
      const icon = icons[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cellW;
      const y = startY + row * cellH;
      drawIconSample(icon, x, y);
    }
  }

  function drawIconSample(icon, x, y) {
    const tile = icon.tile || Tile.GRASS;
    const sampleX = x + 8;
    const sampleY = y + 4;
    ctx.fillStyle = tileInfo[tile].color;
    ctx.fillRect(sampleX, sampleY, TILE_SIZE, TILE_SIZE);
    drawTilePattern(tile, sampleX, sampleY, x, y);
    if (icon.kind === "resource") drawResourceObject(icon.resource, sampleX, sampleY, x, y);
    if (icon.kind === "base") drawBase({ x: 0, y: 0 }, -sampleX, -sampleY);
    if (icon.kind === "relic") drawRelic({ x: 0, y: 0 }, -sampleX, -sampleY);
    if (icon.kind === "animal") drawAnimal({ x: 0, y: 0, type: icon.animal }, -sampleX, -sampleY);
    if (icon.kind === "player") drawStickPerson(ctx, sampleX + 16, sampleY + 16, 0, 1);
    if (icon.kind === "monolith") drawMonolith({ x: 0, y: 0 }, -sampleX, -sampleY);
    if (icon.kind === "star") drawStar(sampleX + 16, sampleY + 16);
    if (icon.kind === "action") drawOutlinedPixelTextScaled("!", sampleX + 13, sampleY + 3, 2);
    drawPixelFrame(sampleX, sampleY, TILE_SIZE, TILE_SIZE, 1, "#777");
    drawPixelTextScaled(icon.label, x + 4, y + 44, 1, "#fff");
  }

  function drawTile(x, y, cameraX, cameraY, actionTarget) {
    const tile = state.map[y][x];
    const info = tileInfo[tile];
    const sx = Math.floor(x * TILE_SIZE - cameraX);
    const sy = Math.floor(y * TILE_SIZE - cameraY);
    if (!isSeenTile(x, y)) {
      ctx.fillStyle = "#000";
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
      return;
    }
    ctx.fillStyle = info.color;
    ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
    drawTilePattern(tile, sx, sy, x, y);
    const resource = state.resources && state.resources[`${x},${y}`];
    const visible = isVisibleTile(x, y);
    const isDepleted = resource && resource.remaining <= 0;
    const isHarvested = resource && resource.harvested;
    if (resource && visible && !isDepleted && !isHarvested) {
      if (isMaterialKnown(resource.type)) drawResourceObject(resource.type, sx, sy, x, y);
      else drawOutlinedPixelTextScaled("?", sx + 10, sy + 8, 2);
    }
    if (resource && visible && isDepleted) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
    }
    if (!visible) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
    }
  }

  function drawActionHint(target, cameraX, cameraY) {
    if (Math.floor(performance.now() / 260) % 2 !== 0) return;
    const sx = Math.floor(target.x * TILE_SIZE - cameraX);
    const sy = Math.floor(target.y * TILE_SIZE - cameraY);
    drawOutlinedPixelTextScaled("!", sx + 13, sy + 3, 2);
  }

  function drawTilePattern(tile, sx, sy, x, y) {
    if (tile === Tile.GRASS) {
      ctx.fillStyle = "#c9c9c9";
      for (let i = 0; i < 4; i += 1) {
        const px = (x * 11 + y * 5 + i * 9) % 26 + 3;
        const py = (y * 7 + x * 3 + i * 11) % 24 + 4;
        ctx.fillRect(sx + px, sy + py, 3, 1);
      }
      ctx.fillStyle = "#999";
      if (seededNoise(x, y) > 0.48) ctx.fillRect(sx + 8, sy + 22, 4, 1);
      if (seededNoise(y, x) > 0.62) ctx.fillRect(sx + 22, sy + 10, 3, 1);
    }
    if (tile === Tile.FOREST) {
      drawSmallForest(sx, sy, x, y);
    }
    if (tile === Tile.DEEP_FOREST) {
      drawDenseForest(sx, sy, x, y);
    }
    if (tile === Tile.MOUNTAIN) {
      drawMountainRange(sx, sy);
    }
    if (tile === Tile.HIGH_MOUNTAIN) {
      drawHighMountain(sx, sy);
    }
    if (tile === Tile.SEA) {
      ctx.fillStyle = "#999";
      ctx.fillRect(sx + 4, sy + 10, 10, 1);
      ctx.fillRect(sx + 18, sy + 16, 9, 1);
      ctx.fillRect(sx + 7, sy + 24, 12, 1);
      ctx.fillStyle = "#e8e8e8";
      ctx.fillRect(sx + 9, sy + 12, 4, 1);
      ctx.fillRect(sx + 21, sy + 18, 3, 1);
    }
    if (tile === Tile.RIVER) {
      // 流れる水。海より明るく、横方向の流線で「川」と分かるようにする。
      ctx.fillStyle = "#555";
      ctx.fillRect(sx, sy + 8, TILE_SIZE, 16);
      ctx.fillStyle = "#888";
      ctx.fillRect(sx + 2, sy + 12, 12, 1);
      ctx.fillRect(sx + 16, sy + 15, 13, 1);
      ctx.fillRect(sx + 5, sy + 19, 14, 1);
      ctx.fillStyle = "#cfcfcf";
      ctx.fillRect(sx + 9, sy + 11, 5, 1);
      ctx.fillRect(sx + 20, sy + 18, 4, 1);
      ctx.fillRect(sx + 3, sy + 21, 3, 1);
    }
    if (tile === Tile.MONOLITH) {
      ctx.fillStyle = "#555";
      ctx.fillRect(sx + 6, sy + 25, 20, 4);
      ctx.fillRect(sx + 10, sy + 21, 13, 4);
      ctx.fillStyle = "#111";
      ctx.fillRect(sx + 14, sy + 5, 9, 24);
      ctx.fillRect(sx + 16, sy + 2, 6, 3);
      ctx.fillStyle = "#eee";
      ctx.fillRect(sx + 18, sy + 8, 1, 7);
    }
  }

  // 小さい森: 低い木がまばら、明るめ/薄め。果物が採れる雰囲気。
  function drawSmallForest(sx, sy, x, y) {
    drawConifer(sx + 4, sy + 13, 9, "#bbb", "#888");
    drawConifer(sx + 18, sy + 11, 10, "#cccccc", "#999");
    if (seededNoise(x, y) > 0.55) drawConifer(sx + 11, sy + 16, 8, "#bbb", "#888");
    // まばらな下草
    ctx.fillStyle = "#aaa";
    ctx.fillRect(sx + 2, sy + 26, 5, 1);
    ctx.fillRect(sx + 13, sy + 27, 6, 1);
    ctx.fillRect(sx + 24, sy + 25, 5, 1);
    ctx.fillStyle = "#ccc";
    ctx.fillRect(sx + 8, sy + 22, 3, 1);
    ctx.fillRect(sx + 22, sy + 20, 3, 1);
  }

  // 大きい森: 木が密集して濃い色。枝資源が採れそうな見た目。
  function drawDenseForest(sx, sy, x, y) {
    drawConifer(sx + 1, sy + 6, 14, "#666", "#333");
    drawConifer(sx + 9, sy + 3, 17, "#777", "#3a3a3a");
    drawConifer(sx + 18, sy + 5, 15, "#666", "#333");
    drawConifer(sx + 24, sy + 8, 13, "#5a5a5a", "#2a2a2a");
    drawConifer(sx + 6, sy + 13, 14, "#555", "#2a2a2a");
    // 暗い林床と落ちた枝
    ctx.fillStyle = "#2e2e2e";
    ctx.fillRect(sx, sy + 27, 32, 3);
    ctx.fillStyle = "#888";
    ctx.fillRect(sx + 5, sy + 29, 7, 1);
    ctx.fillRect(sx + 19, sy + 28, 8, 1);
  }

  function drawConifer(x, y, h, mid, dark) {
    ctx.fillStyle = dark;
    ctx.fillRect(x + 5, y + h - 3, 3, 5);
    ctx.fillStyle = mid;
    ctx.fillRect(x + 5, y, 3, 3);
    ctx.fillRect(x + 3, y + 3, 7, 3);
    ctx.fillRect(x + 2, y + 7, 9, 3);
    ctx.fillRect(x, y + 11, 13, 3);
    ctx.fillStyle = dark;
    ctx.fillRect(x + 4, y + 6, 6, 2);
    ctx.fillRect(x + 3, y + 12, 8, 2);
  }

  function drawMountainRange(sx, sy) {
    ctx.fillStyle = "#555";
    ctx.fillRect(sx + 2, sy + 26, 28, 3);
    ctx.fillRect(sx + 5, sy + 22, 23, 4);
    ctx.fillRect(sx + 9, sy + 17, 18, 5);
    ctx.fillRect(sx + 13, sy + 12, 11, 5);
    ctx.fillRect(sx + 17, sy + 7, 5, 5);
    ctx.fillStyle = "#777";
    ctx.fillRect(sx + 3, sy + 24, 10, 3);
    ctx.fillRect(sx + 22, sy + 23, 8, 4);
    ctx.fillRect(sx + 6, sy + 18, 8, 5);
    ctx.fillRect(sx + 23, sy + 15, 6, 7);
    ctx.fillStyle = "#222";
    ctx.fillRect(sx + 20, sy + 12, 4, 15);
    ctx.fillRect(sx + 12, sy + 19, 3, 8);
    ctx.fillRect(sx + 26, sy + 20, 3, 7);
    ctx.fillStyle = "#eeeeee";
    ctx.fillRect(sx + 17, sy + 8, 4, 2);
    ctx.fillRect(sx + 15, sy + 12, 5, 2);
    ctx.fillRect(sx + 9, sy + 18, 4, 2);
    ctx.fillRect(sx + 24, sy + 16, 3, 2);
    ctx.fillStyle = "#aaa";
    ctx.fillRect(sx + 6, sy + 25, 8, 1);
    ctx.fillRect(sx + 14, sy + 22, 5, 1);
  }

  // 高い山: 尖った山頂、明るい/雪の頂点。フリント産地として分かる見た目。
  function drawHighMountain(sx, sy) {
    // 鋭い稜線を持つ高い山体
    ctx.fillStyle = "#444";
    ctx.fillRect(sx + 2, sy + 27, 28, 2);
    ctx.fillRect(sx + 5, sy + 23, 22, 4);
    ctx.fillRect(sx + 8, sy + 18, 16, 5);
    ctx.fillRect(sx + 11, sy + 13, 10, 5);
    ctx.fillRect(sx + 14, sy + 8, 5, 5);
    ctx.fillRect(sx + 15, sy + 3, 3, 5);
    // 左斜面の陰
    ctx.fillStyle = "#666";
    ctx.fillRect(sx + 4, sy + 24, 9, 3);
    ctx.fillRect(sx + 8, sy + 19, 6, 4);
    ctx.fillRect(sx + 11, sy + 14, 4, 4);
    // 深い谷
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(sx + 19, sy + 13, 3, 14);
    ctx.fillRect(sx + 24, sy + 20, 3, 7);
    // 雪の積もった尖頂
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(sx + 15, sy + 3, 3, 4);
    ctx.fillRect(sx + 14, sy + 7, 5, 2);
    ctx.fillRect(sx + 12, sy + 11, 4, 2);
    ctx.fillRect(sx + 17, sy + 11, 3, 2);
    ctx.fillStyle = "#e2e2e2";
    ctx.fillRect(sx + 10, sy + 15, 3, 2);
    ctx.fillRect(sx + 20, sy + 16, 3, 2);
  }

  function drawResourceObject(resourceType, sx, sy, x, y) {
    ctx.fillStyle = "#111";
    if (resourceType === Resource.FRUIT) {
      ctx.fillRect(sx + 13, sy + 13, 11, 3);
      ctx.fillRect(sx + 11, sy + 16, 15, 9);
      ctx.fillRect(sx + 13, sy + 25, 11, 3);
      ctx.fillRect(sx + 16, sy + 9, 3, 4);
      ctx.fillRect(sx + 18, sy + 8, 5, 2);
      ctx.fillStyle = "#777";
      ctx.fillRect(sx + 14, sy + 16, 10, 8);
      ctx.fillRect(sx + 16, sy + 24, 6, 2);
      ctx.fillStyle = "#bbb";
      ctx.fillRect(sx + 15, sy + 15, 5, 3);
      ctx.fillRect(sx + 13, sy + 19, 3, 4);
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx + 16, sy + 16, 3, 2);
      ctx.fillRect(sx + 20, sy + 9, 3, 1);
      return;
    }
    if (resourceType === Resource.WOOD) {
      ctx.fillRect(sx + 15, sy + 17, 5, 13);
      ctx.fillRect(sx + 11, sy + 14, 5, 8);
      ctx.fillRect(sx + 8, sy + 11, 5, 5);
      ctx.fillRect(sx + 20, sy + 15, 5, 7);
      ctx.fillRect(sx + 23, sy + 12, 5, 5);
      ctx.fillRect(sx + 13, sy + 29, 12, 2);
      ctx.fillStyle = "#777";
      ctx.fillRect(sx + 17, sy + 18, 1, 10);
      ctx.fillRect(sx + 13, sy + 16, 2, 4);
      ctx.fillRect(sx + 21, sy + 17, 2, 4);
      ctx.fillStyle = "#eee";
      ctx.fillRect(sx + 9, sy + 12, 2, 2);
      ctx.fillRect(sx + 24, sy + 13, 2, 2);
      return;
    }
    if (resourceType === Resource.STONE) {
      ctx.fillStyle = "#111";
      ctx.fillRect(sx + 10, sy + 20, 18, 7);
      ctx.fillRect(sx + 13, sy + 14, 14, 8);
      ctx.fillRect(sx + 17, sy + 10, 8, 5);
      ctx.fillRect(sx + 8, sy + 24, 22, 3);
      ctx.fillStyle = "#eeeeee";
      ctx.fillRect(sx + 12, sy + 20, 14, 5);
      ctx.fillRect(sx + 14, sy + 15, 11, 6);
      ctx.fillRect(sx + 18, sy + 11, 5, 4);
      ctx.fillStyle = "#777";
      ctx.fillRect(sx + 12, sy + 24, 16, 3);
      ctx.fillRect(sx + 21, sy + 15, 5, 7);
      ctx.fillRect(sx + 15, sy + 21, 8, 2);
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx + 15, sy + 16, 5, 2);
      ctx.fillRect(sx + 18, sy + 12, 4, 1);
    }
    if (resourceType === Resource.FLINT) {
      ctx.fillStyle = "#111";
      ctx.fillRect(sx + 16, sy + 10, 4, 3);
      ctx.fillRect(sx + 13, sy + 13, 10, 4);
      ctx.fillRect(sx + 10, sy + 17, 16, 4);
      ctx.fillRect(sx + 12, sy + 21, 13, 3);
      ctx.fillRect(sx + 15, sy + 24, 7, 3);
      ctx.fillStyle = "#999";
      ctx.fillRect(sx + 17, sy + 11, 2, 2);
      ctx.fillRect(sx + 14, sy + 14, 7, 3);
      ctx.fillRect(sx + 11, sy + 18, 10, 3);
      ctx.fillStyle = "#ddd";
      ctx.fillRect(sx + 17, sy + 14, 3, 1);
      ctx.fillRect(sx + 12, sy + 19, 5, 1);
    }
  }

  function drawBase(base, cameraX, cameraY) {
    const sx = Math.floor(base.x * TILE_SIZE - cameraX);
    const sy = Math.floor(base.y * TILE_SIZE - cameraY);
    const lv = baseLevel(base);
    if (base.type === "CAMP") {
      drawCamp(sx, sy, lv);
    } else {
      ctx.fillStyle = "#111";
      ctx.fillRect(sx + 4, sy + 24, 24, 4);
      ctx.fillRect(sx + 7, sy + 20, 19, 4);
      ctx.fillRect(sx + 10, sy + 15, 13, 5);
      ctx.fillRect(sx + 15, sy + 8, 4, 7);
      ctx.fillRect(sx + 2, sy + 28, 28, 2);
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx + 14, sy + 21, 6, 6);
      ctx.fillRect(sx + 16, sy + 10, 1, 5);
      ctx.fillStyle = "#777";
      ctx.fillRect(sx + 8, sy + 24, 17, 1);
    }
    if (lv >= 2) {
      const label = `L${lv}`;
      const lw = measurePixelText(label) + 2;
      ctx.fillStyle = "#111";
      ctx.fillRect(sx + 1, sy + 1, lw + 2, 9);
      drawPixelTextScaled(label, sx + 2, sy + 2, 1, "#fff");
    }
    if (manhattanDistance(state.player.gridX, state.player.gridY, base.x, base.y) <= 1) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx, sy, TILE_SIZE, 2);
      ctx.fillRect(sx, sy + TILE_SIZE - 2, TILE_SIZE, 2);
      ctx.fillRect(sx, sy, 2, TILE_SIZE);
      ctx.fillRect(sx + TILE_SIZE - 2, sy, 2, TILE_SIZE);
    }
  }

  function drawCamp(sx, sy, level = 1) {
    if (level >= 3) {
      // 集落風 — 母屋 + 2つの小屋
      ctx.fillStyle = "#111";
      ctx.fillRect(sx + 9, sy + 12, 14, 14);   // 母屋
      ctx.fillRect(sx + 8, sy + 10, 16, 3);     // 棟
      ctx.fillRect(sx + 2, sy + 20, 8, 8);      // 左の小屋
      ctx.fillRect(sx + 22, sy + 20, 8, 8);     // 右の小屋
      ctx.fillRect(sx + 1, sy + 28, 30, 2);     // 地面
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx + 14, sy + 19, 4, 7);     // 母屋の入口
      ctx.fillRect(sx + 4, sy + 23, 3, 5);
      ctx.fillRect(sx + 25, sy + 23, 3, 5);
      ctx.fillStyle = "#555";
      ctx.fillRect(sx + 10, sy + 16, 12, 1);
      return;
    }
    if (level >= 2) {
      // 少し大きい小屋
      ctx.fillStyle = "#111";
      ctx.fillRect(sx + 6, sy + 25, 20, 5);
      ctx.fillRect(sx + 8, sy + 20, 16, 5);
      ctx.fillRect(sx + 11, sy + 14, 10, 6);
      ctx.fillRect(sx + 14, sy + 9, 4, 5);
      ctx.fillRect(sx + 4, sy + 30, 24, 2);
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx + 14, sy + 21, 5, 6);
      ctx.fillStyle = "#555";
      ctx.fillRect(sx + 9, sy + 25, 14, 1);
      return;
    }
    // Lv1: Smaller hut — lean-to shape
    ctx.fillStyle = "#111";
    ctx.fillRect(sx + 8, sy + 26, 16, 4);
    ctx.fillRect(sx + 10, sy + 22, 12, 4);
    ctx.fillRect(sx + 13, sy + 17, 7, 5);
    ctx.fillRect(sx + 15, sy + 13, 3, 4);
    ctx.fillRect(sx + 6, sy + 30, 20, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(sx + 15, sy + 23, 4, 4);
    ctx.fillStyle = "#555";
    ctx.fillRect(sx + 10, sy + 26, 10, 1);
  }

  function drawRelic(relic, cameraX, cameraY) {
    const sx = Math.floor(relic.x * TILE_SIZE - cameraX);
    const sy = Math.floor(relic.y * TILE_SIZE - cameraY);
    ctx.fillStyle = "#111";
    ctx.fillRect(sx + 9, sy + 9, 7, 7);
    ctx.fillRect(sx + 19, sy + 9, 5, 8);
    ctx.fillRect(sx + 14, sy + 16, 8, 7);
    ctx.fillRect(sx + 8, sy + 23, 9, 4);
    ctx.fillRect(sx + 20, sy + 24, 7, 3);
    ctx.fillStyle = "#fff";
    ctx.fillRect(sx + 10, sy + 10, 2, 2);
    ctx.fillRect(sx + 20, sy + 10, 1, 3);
  }

  function drawAnimal(animal, cameraX, cameraY) {
    const sx = Math.floor(animal.x * TILE_SIZE - cameraX);
    const sy = Math.floor(animal.y * TILE_SIZE - cameraY);
    const boar = animal.type === "boar";
    ctx.fillStyle = "#111";
    if (boar) {
      ctx.fillRect(sx + 5, sy + 15, 19, 10);
      ctx.fillRect(sx + 21, sy + 12, 8, 7);
      ctx.fillRect(sx + 7, sy + 25, 4, 5);
      ctx.fillRect(sx + 19, sy + 25, 4, 5);
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx + 25, sy + 14, 2, 2);
      ctx.fillRect(sx + 27, sy + 19, 3, 1);
      return;
    }
    ctx.fillRect(sx + 8, sy + 17, 15, 8);
    ctx.fillRect(sx + 21, sy + 12, 6, 6);
    ctx.fillRect(sx + 24, sy + 6, 2, 7);
    ctx.fillRect(sx + 19, sy + 8, 2, 5);
    ctx.fillRect(sx + 9, sy + 25, 4, 4);
    ctx.fillRect(sx + 20, sy + 24, 4, 5);
    ctx.fillStyle = "#fff";
    ctx.fillRect(sx + 24, sy + 13, 1, 1);
  }

  function drawMonolith(monolith, cameraX, cameraY) {
    const sx = Math.floor(monolith.x * TILE_SIZE - cameraX);
    const sy = Math.floor(monolith.y * TILE_SIZE - cameraY);
    ctx.fillStyle = "#111";
    ctx.fillRect(sx + 13, sy + 3, 11, 26);
    ctx.fillRect(sx + 11, sy + 29, 16, 3);
    ctx.fillRect(sx + 15, sy, 7, 3);
    ctx.fillStyle = "#fff";
    ctx.fillRect(sx + 18, sy + 7, 1, 8);
  }

  function drawPlayer(p, cameraX, cameraY) {
    const drawPos = getPlayerDrawPosition();
    const sx = Math.floor(drawPos.x * TILE_SIZE - cameraX + TILE_SIZE / 2);
    const sy = Math.floor(drawPos.y * TILE_SIZE - cameraY + TILE_SIZE / 2);
    if (state && state.buddyOn) {
      const bx = sx - (p.dirX || 0) * 14 - (p.dirY !== 0 ? 10 : 0);
      const by = sy - (p.dirY || 0) * 14 + (p.dirX !== 0 ? 6 : 0);
      ctx.globalAlpha = 0.7;
      drawStickPerson(ctx, bx, by, -(p.dirX || 0), -(p.dirY || -1));
      ctx.globalAlpha = 1;
    }
    drawStickPerson(ctx, sx, sy, p.dirX || 0, p.dirY || 1);
  }

  function drawStickPerson(targetCtx, x, y, dirX, dirY) {
    const ox = Math.round(dirX);
    const oy = Math.round(dirY);
    const stage = state ? state.evolutionStage || 0 : 0;
    targetCtx.fillStyle = "#111";
    if (stage === 0) {
      targetCtx.fillRect(x - 8, y - 4, 6, 5);
      targetCtx.fillRect(x - 2, y - 1, 11, 5);
      targetCtx.fillRect(x + 7, y - 4, 4, 6);
      targetCtx.fillRect(x - 10, y + 4, 6, 3);
      targetCtx.fillRect(x + 1, y + 6, 8, 3);
      targetCtx.fillRect(x - 6, y, 3, 6);
      targetCtx.fillRect(x + 10, y + 1, 3, 5);
      targetCtx.fillStyle = "#fff";
      targetCtx.fillRect(x - 6, y - 3, 3, 2);
      targetCtx.fillRect(x, y, 4, 1);
      targetCtx.fillRect(x + 8, y - 3, 1, 1);
    } else if (stage === 1) {
      targetCtx.fillRect(x - 5, y - 10, 8, 7);
      targetCtx.fillRect(x - 4, y - 4, 8, 11);
      targetCtx.fillRect(x - 9, y - 1, 5, 3);
      targetCtx.fillRect(x + 4, y + 1, 7, 3);
      targetCtx.fillRect(x - 5, y + 7, 4, 5);
      targetCtx.fillRect(x + 4, y + 6, 4, 6);
      targetCtx.fillRect(x - 6, y + 11, 6, 2);
      targetCtx.fillRect(x + 4, y + 11, 6, 2);
      targetCtx.fillStyle = "#fff";
      targetCtx.fillRect(x - 4, y - 9, 3, 4);
      targetCtx.fillRect(x - 1, y - 2, 4, 7);
      targetCtx.fillRect(x + 2, y + 5, 1, 3);
    } else {
      targetCtx.fillRect(x - 5, y - 11, 9, 7);
      targetCtx.fillRect(x - 4, y - 4, 8, 13);
      targetCtx.fillRect(x - 10, y - 1, 6, 3);
      targetCtx.fillRect(x + 4, y, 7, 3);
      targetCtx.fillRect(x - 4, y + 9, 4, 7);
      targetCtx.fillRect(x + 4, y + 9, 4, 7);
      targetCtx.fillRect(x - 6, y + 15, 7, 2);
      targetCtx.fillRect(x + 4, y + 15, 7, 2);
      targetCtx.fillRect(x + 9, y - 9, 3, 12);
      targetCtx.fillStyle = "#fff";
      targetCtx.fillRect(x - 3, y - 10, 4, 5);
      targetCtx.fillRect(x - 1, y - 3, 4, 8);
      targetCtx.fillRect(x + 9, y - 7, 1, 4);
      targetCtx.fillRect(x + 1, y + 6, 1, 3);
    }
    targetCtx.fillStyle = "#111";
    targetCtx.fillRect(x + ox * 2, y - 8 + oy * 2, 2, 2);
  }

  function drawDirectionMarkers(cameraX, cameraY) {
    const targets = [];
    if (state.bases.length > 0) targets.push({ ...state.bases[0], kind: "base" });
    const relic = state.relics.find((item) => !item.recovered);
    if (relic) targets.push({ ...relic, kind: "relic" });
    if (state.monolith && (state.monolithTouched || isSeenTile(state.monolith.x, state.monolith.y))) targets.push({ ...state.monolith, kind: "goal" });
    for (const target of targets) drawEdgeMarker(target, cameraX, cameraY);
  }

  function drawEdgeMarker(target, cameraX, cameraY) {
    const screenX = target.x * TILE_SIZE - cameraX + TILE_SIZE / 2;
    const screenY = target.y * TILE_SIZE - cameraY + TILE_SIZE / 2;
    if (screenX >= GAME_X + 6 && screenX <= GAME_X + PLAY_W - 6 && screenY >= GAME_Y + 6 && screenY <= GAME_Y + PLAY_H - 6) return;
    const cx = GAME_X + PLAY_W / 2;
    const cy = GAME_Y + PLAY_H / 2;
    const dx = screenX - cx;
    const dy = screenY - cy;
    const edgeX = Math.max(GAME_X + 4, Math.min(GAME_X + PLAY_W - 5, cx + dx * Math.min((PLAY_W / 2 - 5) / Math.max(1, Math.abs(dx)), (PLAY_H / 2 - 5) / Math.max(1, Math.abs(dy)))));
    const edgeY = Math.max(GAME_Y + 4, Math.min(GAME_Y + PLAY_H - 5, cy + dy * Math.min((PLAY_W / 2 - 5) / Math.max(1, Math.abs(dx)), (PLAY_H / 2 - 5) / Math.max(1, Math.abs(dy)))));
    ctx.fillStyle = target.kind === "base" ? "#fff" : "#111";
    ctx.fillRect(Math.floor(edgeX) - 2, Math.floor(edgeY) - 2, 5, 5);
    ctx.fillStyle = target.kind === "base" ? "#111" : "#fff";
    ctx.fillRect(Math.floor(edgeX), Math.floor(edgeY), 1, 1);
  }

  function drawPixelPerson(targetCtx, x, y, face, scale) {
    // All character art is made from tiny fillRect calls.
    const s = scale;
    targetCtx.fillStyle = "#ddd";
    targetCtx.fillRect(x + 3 * s, y + 2 * s, 6 * s, 6 * s);
    targetCtx.fillStyle = "#111";
    targetCtx.fillRect(x + 2 * s, y + 1 * s, 8 * s, 3 * s);
    targetCtx.fillStyle = "#171311";
    targetCtx.fillRect(x + 4 * s, y + 5 * s, s, s);
    targetCtx.fillRect(x + 8 * s, y + 5 * s, s, s);
    targetCtx.fillStyle = "#111";
    targetCtx.fillRect(x + 6 * s, y + 8 * s, 3 * s, s);
    targetCtx.fillStyle = "#555";
    targetCtx.fillRect(x + 3 * s, y + 9 * s, 7 * s, 7 * s);
    targetCtx.fillStyle = "#ddd";
    targetCtx.fillRect(x + s, y + 10 * s, 2 * s, 6 * s);
    targetCtx.fillRect(x + 10 * s, y + 10 * s, 2 * s, 6 * s);
    targetCtx.fillRect(x + 4 * s, y + 16 * s, 2 * s, 5 * s);
    targetCtx.fillRect(x + 8 * s, y + 16 * s, 2 * s, 5 * s);
  }

  function drawTitleScreen(viewW, viewH) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, viewW, viewH);
    const area = getTitleDrawArea(viewW, viewH);
    const scale = getTitleScale(area.w, area.h);
    const offsetX = area.x + Math.floor((area.w - TITLE_W * scale) / 2);
    const offsetY = area.y + Math.floor((area.h - TITLE_H * scale) / 2);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    drawTitleScreenContent(TITLE_W, TITLE_H);
    ctx.restore();
  }

  function drawTitleScreenContent(viewW, viewH) {
    drawTitleLandscape(viewW, viewH);
    if (titlePanel === "history") {
      drawTitlePanel("HISTORY", getTitleHistoryLines());
      return;
    }
    if (titlePanel === "settings") {
      drawTitlePanel("SETTINGS", ["DISPLAY PIXEL", "SOUND NONE", "ACTION BACK"]);
      return;
    }
    const title = "ANCESTORS";
    const titleScale = 3;
    const titleW = measurePixelText(title) * titleScale;
    const titleX = Math.floor((viewW - titleW) / 2);
    const subtitle = "THE FIRST TRIBE";
    drawPixelTextScaled(title, titleX, 28, titleScale, "#fff");
    drawPixelText(subtitle, titleX + Math.floor((titleW - measurePixelText(subtitle)) / 2), 56, "#fff");
    drawTitleMenu();
    if (titleNotice && performance.now() < titleNoticeUntil) drawPixelText(titleNotice, 105, 218, "#fff");
  }

  function getTitleDrawArea(viewW = INTERNAL_W, viewH = INTERNAL_H) {
    if (layoutMode === "portrait") return { x: 0, y: 0, w: viewW, h: CONTROL_Y };
    return { x: 0, y: 0, w: viewW, h: viewH };
  }

  function getTitleScale(viewW = INTERNAL_W, viewH = INTERNAL_H) {
    return Math.max(1, Math.floor(Math.min(viewW / TITLE_W, viewH / TITLE_H)));
  }

  function drawTitleLandscape(viewW, viewH) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, viewW, viewH);
    drawTitleSky(viewW);
    drawTitleSea(viewW);
    drawTitleIsland();
    drawTitleMonolith();
    drawTitleLookout();
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 224, viewW, 16);
  }

  function drawTitleSky(viewW) {
    const t = performance.now();
    ctx.fillStyle = "#080808";
    ctx.fillRect(0, 58, viewW, 80);
    ctx.fillStyle = "#111";
    for (let y = 66; y < 134; y += 9) ctx.fillRect(0, y, viewW, 1);
    const clouds = [
      { x: 8, y: 72, w: 58, speed: 620, color: "#333", parts: [[0, 6, 18, 3], [12, 2, 16, 6], [26, 8, 18, 3], [44, 10, 8, 2]] },
      { x: 86, y: 84, w: 54, speed: 820, color: "#2a2a2a", parts: [[0, 8, 22, 2], [18, 4, 15, 5], [30, 9, 18, 2], [46, 11, 8, 1]] },
      { x: 176, y: 62, w: 92, speed: 980, color: "#444", parts: [[0, 14, 20, 3], [14, 7, 20, 8], [30, 2, 24, 14], [50, 9, 22, 7], [70, 16, 18, 2]] },
      { x: 194, y: 92, w: 58, speed: 720, color: "#333", parts: [[0, 8, 18, 2], [14, 4, 18, 5], [30, 9, 20, 2], [48, 7, 10, 1]] },
      { x: -28, y: 103, w: 46, speed: 760, color: "#222", parts: [[0, 9, 16, 2], [12, 5, 18, 5], [28, 10, 18, 2]] },
      { x: 130, y: 74, w: 36, speed: 1100, color: "#2f2f2f", parts: [[0, 6, 13, 2], [10, 2, 14, 5], [22, 7, 14, 2]] },
    ];
    for (const cloud of clouds) {
      const loopW = viewW + cloud.w + 18;
      const drift = Math.floor(t / cloud.speed) % loopW;
      const cloudX = ((cloud.x + drift + cloud.w + 9) % loopW) - cloud.w - 9;
      ctx.fillStyle = cloud.color;
      for (const [x, y, w, h] of cloud.parts) ctx.fillRect(cloudX + x, cloud.y + y, w, h);
      ctx.fillStyle = "#777";
      for (let i = 0; i < cloud.parts.length; i += 2) {
        const [x, y, w] = cloud.parts[i];
        ctx.fillRect(cloudX + x + 2, cloud.y + y, Math.max(4, Math.floor(w / 2)), 1);
      }
    }
  }

  function drawTitleSea(viewW) {
    const t = performance.now();
    ctx.fillStyle = "#0b0b0b";
    ctx.fillRect(0, 138, viewW, 86);
    ctx.fillStyle = "#222";
    for (const horizon of [
      { y: 152, speed: 1800, offset: 0 },
      { y: 174, speed: 2400, offset: 5 },
      { y: 204, speed: 3000, offset: 11 },
    ]) {
      const drift = Math.floor(t / horizon.speed + horizon.offset) % 12;
      for (let x = -drift; x < viewW; x += 18) ctx.fillRect(x, horizon.y, 12, 1);
    }
    const waveRows = [
      { y: 142, step: 16, color: "#333", alt: "#222", len: 3, speed: 2400 },
      { y: 148, step: 12, color: "#555", alt: "#444", len: 4, speed: 1900 },
      { y: 156, step: 11, color: "#444", alt: "#333", len: 3, speed: 1700 },
      { y: 164, step: 10, color: "#777", alt: "#555", len: 5, speed: 1520 },
      { y: 172, step: 14, color: "#333", alt: "#222", len: 4, speed: 2100 },
      { y: 181, step: 9, color: "#555", alt: "#444", len: 3, speed: 1440 },
      { y: 190, step: 10, color: "#666", alt: "#555", len: 4, speed: 1360 },
      { y: 197, step: 12, color: "#888", alt: "#666", len: 6, speed: 1240 },
      { y: 205, step: 9, color: "#999", alt: "#777", len: 3, speed: 1120 },
      { y: 212, step: 8, color: "#bbb", alt: "#888", len: 4, speed: 1000 },
    ];
    for (let rowIndex = 0; rowIndex < waveRows.length; rowIndex += 1) {
      const row = waveRows[rowIndex];
      const drift = Math.floor(t / row.speed + rowIndex * 5) % row.step;
      const shimmer = Math.floor(t / (900 + rowIndex * 55)) % 2 === 0;
      ctx.fillStyle = shimmer ? row.color : row.alt;
      for (let x = -12; x < viewW + 12; x += row.step) {
        const waveX = x - drift;
        const wobble = Math.floor(seededNoise(waveX + row.y, row.y * 3) * 7);
        const lift = Math.floor((t / (1800 + rowIndex * 90) + rowIndex) % 2);
        const y = row.y + wobble - lift;
        ctx.fillRect(waveX, y, row.len, 1);
        if (seededNoise(waveX * 2, row.y) > 0.62) ctx.fillRect(waveX + row.len + 2, y + 2, Math.max(2, row.len - 2), 1);
      }
    }
    drawTitleEdgeWaves(viewW, t);
    drawTitleFoam(viewW);
  }

  function drawTitleEdgeWaves(viewW, t) {
    const rows = [
      { y: 160, step: 15, len: 7, color: "#333", speed: 2600 },
      { y: 178, step: 17, len: 9, color: "#444", speed: 3100 },
      { y: 194, step: 19, len: 8, color: "#555", speed: 2800 },
      { y: 210, step: 13, len: 6, color: "#777", speed: 2200 },
    ];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const drift = Math.floor(t / row.speed + i * 3) % row.step;
      ctx.fillStyle = row.color;
      for (let x = -row.step - drift; x < viewW + row.step; x += row.step) {
        const skip = seededNoise(x + row.y, i * 19) < 0.28;
        if (skip) continue;
        const y = row.y + Math.floor(seededNoise(x, row.y) * 5);
        ctx.fillRect(x, y, row.len, 1);
      }
    }
  }

  function drawTitleFoam(viewW) {
    const t = performance.now();
    ctx.fillStyle = "#ddd";
    for (let x = -8; x < viewW + 8; x += 18) {
      const drift = Math.floor(t / 1200) % 18;
      const foamX = x - drift;
      const y = 212 + Math.floor(seededNoise(foamX, 51) * 7);
      ctx.fillRect(foamX, y, 2, 1);
      ctx.fillRect(foamX + 5, y + 1, 5, 1);
    }
    ctx.fillStyle = "#777";
    for (let x = 2; x < viewW; x += 23) {
      const drift = Math.floor(t / 1700) % 23;
      const fleckX = x + drift;
      const y = 146 + Math.floor(seededNoise(fleckX, 57) * 18);
      ctx.fillRect(fleckX, y, 1, 1);
      if (seededNoise(fleckX, y) > 0.5) ctx.fillRect(fleckX + 3, y + 4, 2, 1);
    }
  }

  function drawTitleIsland() {
    const landRows = [
      { y: 137, color: "#333", spans: [[10, 8], [24, 22], [52, 44], [98, 34], [136, 20]] },
      { y: 134, color: "#2a2a2a", spans: [[18, 10], [38, 14], [84, 18], [122, 16]] },
      { y: 131, color: "#444", spans: [[14, 12], [26, 40], [66, 48], [106, 34]] },
      { y: 126, color: "#555", spans: [[22, 24], [40, 52], [90, 34]] },
      { y: 121, color: "#666", spans: [[28, 12], [44, 38], [78, 30]] },
      { y: 116, color: "#777", spans: [[42, 26], [64, 34]] },
      { y: 111, color: "#888", spans: [[44, 16], [60, 26]] },
      { y: 106, color: "#999", spans: [[56, 18]] },
    ];
    for (const row of landRows) {
      ctx.fillStyle = row.color;
      for (const [x, w] of row.spans) ctx.fillRect(x, row.y, w, 5);
    }
    drawTitleCoastBreaks();
    drawTitleSnowPeak();
    drawTitleIslandTexture();
    ctx.fillStyle = "#222";
    for (let x = 12; x < 152; x += 7) {
      const y = 138 + Math.floor(seededNoise(x, 12) * 6);
      ctx.fillRect(x, y, 4, 1);
      if (seededNoise(x, y) > 0.74) ctx.fillRect(x + 3, y + 3, 2, 1);
    }
    drawTitleCliff();
  }

  function drawTitleIslandTexture() {
    ctx.fillStyle = "#1a1a1a";
    const cracks = [
      [140, 134, 10], [106, 132, 8], [70, 130, 12], [53, 133, 7], [24, 131, 6],
      [122, 139, 8], [79, 137, 9], [45, 138, 11], [19, 136, 5],
    ];
    for (const [x, y, w] of cracks) ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = "#777";
    ctx.fillRect(116, 124, 8, 1);
    ctx.fillRect(44, 125, 14, 1);
    ctx.fillRect(21, 129, 9, 1);
    ctx.fillStyle = "#999";
    ctx.fillRect(86, 116, 6, 1);
    ctx.fillRect(38, 118, 8, 1);
  }

  function drawTitleCoastBreaks() {
    ctx.fillStyle = "#0b0b0b";
    const cuts = [
      [128, 138, 8, 2],
      [93, 139, 5, 3],
      [51, 137, 9, 3],
      [25, 139, 7, 2],
      [9, 136, 7, 4],
    ];
    for (const [x, y, w, h] of cuts) ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#555";
    ctx.fillRect(110, 136, 20, 1);
    ctx.fillRect(68, 136, 24, 1);
    ctx.fillRect(26, 135, 30, 1);
    ctx.fillRect(10, 136, 14, 1);
  }

  function drawTitleSnowPeak() {
    ctx.fillStyle = "#eee";
    ctx.fillRect(65, 104, 8, 2);
    ctx.fillRect(60, 108, 18, 3);
    ctx.fillRect(61, 113, 25, 3);
    ctx.fillRect(74, 118, 18, 2);
    ctx.fillStyle = "#bbb";
    ctx.fillRect(56, 108, 8, 3);
    ctx.fillRect(44, 113, 18, 3);
    ctx.fillRect(38, 118, 16, 2);
    ctx.fillStyle = "#999";
    ctx.fillRect(65, 111, 9, 2);
    ctx.fillRect(64, 117, 10, 2);
    ctx.fillStyle = "#777";
    ctx.fillRect(76, 121, 12, 2);
    ctx.fillRect(34, 121, 18, 2);
    ctx.fillStyle = "#333";
    ctx.fillRect(55, 110, 3, 8);
    ctx.fillRect(37, 119, 5, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(72, 106, 4, 1);
    ctx.fillRect(79, 111, 5, 1);
    ctx.fillStyle = "#555";
    ctx.fillRect(45, 114, 7, 1);
    ctx.fillRect(70, 120, 10, 1);
  }

  function drawTitleCliff() {
    ctx.fillStyle = "#eee";
    ctx.fillRect(194, 191, 34, 5);
    ctx.fillRect(184, 196, 52, 6);
    ctx.fillRect(174, 202, 74, 6);
    ctx.fillStyle = "#bbb";
    ctx.fillRect(162, 204, 24, 4);
    ctx.fillRect(174, 208, 78, 5);
    ctx.fillRect(196, 196, 26, 2);
    ctx.fillStyle = "#777";
    ctx.fillRect(166, 213, 86, 6);
    ctx.fillRect(226, 208, 22, 4);
    ctx.fillStyle = "#555";
    ctx.fillRect(158, 219, 88, 6);
    ctx.fillStyle = "#333";
    ctx.fillRect(152, 225, 92, 9);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(144, 234, 98, 6);
    ctx.fillStyle = "#0b0b0b";
    ctx.fillRect(248, 202, 8, 7);
    ctx.fillRect(252, 209, 4, 6);
    ctx.fillRect(246, 219, 10, 7);
    ctx.fillRect(244, 229, 12, 5);
    ctx.fillStyle = "#777";
    for (let x = 154; x < 244; x += 8) {
      const y = 216 + Math.floor(seededNoise(x, 28) * 4);
      ctx.fillRect(x, y, 4, 1);
    }
    ctx.fillStyle = "#999";
    for (let x = 166; x < 238; x += 13) {
      const y = 207 + Math.floor(seededNoise(x, 61) * 4);
      ctx.fillRect(x, y, 7, 1);
    }
    ctx.fillStyle = "#050505";
    for (let x = 148; x < 240; x += 19) ctx.fillRect(x, 236, 10, 1);
  }

  function drawTitleLookout() {
    drawStickPerson(ctx, 208, 198, 0, 1);
  }

  function drawTitleMonolith() {
    const cycle = (performance.now() % 3000) / 3000;
    const wave = 0.5 - Math.cos(cycle * Math.PI * 2) * 0.5;
    const armY = Math.round(2 + wave * 2);
    const cx = 68;
    const cy = 101;
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx, cy - armY, 1, armY * 2 + 1);
    ctx.fillRect(cx - 1, cy, 3, 1);
    if (wave > 0.55) {
      ctx.fillRect(cx, cy - armY - 2, 1, 1);
      ctx.fillRect(cx, cy + armY + 2, 1, 1);
    }
  }

  function drawTitleMenu() {
    const startX = 184;
    const startY = 104;
    for (let i = 0; i < TITLE_OPTIONS.length; i += 1) {
      const y = startY + i * 14;
      const selected = i === titleIndex;
      if (selected) drawMenuCursor(startX - 14, y);
      drawPixelText(TITLE_OPTIONS[i], startX, y, "#fff");
    }
  }

  function drawMenuCursor(x, y) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + 3, y, 1, 7);
    ctx.fillRect(x, y + 3, 7, 1);
  }

  function drawTitlePanel(title, lines) {
    ctx.fillStyle = "#000";
    ctx.fillRect(28, 44, 200, 138);
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(28, 44, 200, 138);
    drawPixelText(title, 42, 58, "#fff");
    let y = 82;
    for (const line of lines) {
      drawPixelText(line, 42, y, "#fff");
      y += 14;
    }
    drawPixelText("ACTION BACK", 42, 162, "#fff");
  }

  function getTitleHistoryLines() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return ["NO HISTORY"];
    try {
      const saved = JSON.parse(raw);
      if (!saved.history || saved.history.length === 0) return ["NO HISTORY"];
      return saved.history.slice(0, 5).map((entry) => `GEN ${entry.generation} ${romanName(entry.name)} AGE ${entry.age}`);
    } catch (error) {
      return ["NO HISTORY"];
    }
  }

  function drawNotice(cameraX, cameraY, drawPos) {
    if (!state.notice || performance.now() > state.notice.until) return;
    const text = noticeTextForCanvas(state.notice.text);
    if (isEmergencyNotice(text)) {
      drawEmergencyNotice(text);
      return;
    }
    const textW = measurePixelText(text) * 2;
    const w = Math.min(PLAY_W - 16, Math.max(96, textW + 18));
    const playerX = drawPos.x * TILE_SIZE - cameraX + TILE_SIZE / 2;
    const playerY = drawPos.y * TILE_SIZE - cameraY + TILE_SIZE / 2;
    const x = Math.floor(Math.max(GAME_X + 8, Math.min(GAME_X + PLAY_W - w - 8, playerX - w / 2)));
    const y = Math.floor(Math.max(GAME_Y + 8, Math.min(GAME_Y + PLAY_H - 34, playerY + TILE_SIZE * 2)));
    ctx.fillStyle = "#111";
    ctx.fillRect(x, y, w, 26);
    drawPixelFrame(x, y, w, 26, 2, "#fff");
    drawPixelTextScaled(text, x + Math.floor((w - textW) / 2), y + 6, 2, "#fff");
  }

  function drawEmergencyNotice(text) {
    const textW = measurePixelText(text) * 2;
    const x = Math.floor(GAME_X + (PLAY_W - textW) / 2);
    const y = Math.floor(GAME_Y + (PLAY_H - 14) / 2);
    const phase = (performance.now() % 420) / 420;
    if (phase >= 0.55) return;
    drawOutlinedPixelTextScaled(text, x, y, 2);
  }

  function drawHudText() {
    const p = state.player;
    const lifeLeft = getLifeTurnsLeft();
    const cap = getPlayerCapacity();
    const yearsLeft = Math.ceil(lifeLeft / TURNS_PER_YEAR);
    playerStats.textContent = `STATUS | NAME ${p.name} | AGE ${p.age} | HP ${Math.round(p.hp)} | LIFE ${yearsLeft}Y | BAG ${inventoryTotal(p.inventory)}/${cap}`;
    tribeStats.textContent = `TRIBE | INT ${state.tribeInt} | ATK ${state.tribeAtk} | WIS ${state.wisdom} | POP ${state.population}`;
    const tr = state.tribe;
    resourceStats.textContent = `POP ${state.population}/${getPopCap()} WIS${state.wisdom} Y${getGameYear()} | F${tr.fruit||0} M${tr.meat||0} B${tr.wood||0} S${tr.stone||0} L${tr.leather||0} FL${tr.flint||0}`;
    drawGameHud();
  }

  function drawTitleControls() {
    ctx.fillStyle = "#111";
    if (layoutMode === "portrait") {
      ctx.fillRect(0, CONTROL_Y, INTERNAL_W, UI_BOTTOM_H);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, CONTROL_Y, INTERNAL_W, 1);
    } else {
      ctx.fillRect(0, UI_TOP_H, SIDE_CONTROL_W, INTERNAL_H - UI_TOP_H);
      ctx.fillRect(INTERNAL_W - SIDE_CONTROL_W, UI_TOP_H, SIDE_CONTROL_W, INTERNAL_H - UI_TOP_H);
      ctx.fillStyle = "#fff";
      ctx.fillRect(GAME_X - 1, UI_TOP_H, 1, INTERNAL_H - UI_TOP_H);
      ctx.fillRect(GAME_X + PLAY_W, UI_TOP_H, 1, INTERNAL_H - UI_TOP_H);
    }
    drawControlPanel();
  }

  function drawGameHud() {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, INTERNAL_W, UI_TOP_H);
    ctx.fillRect(GAME_X, HUD_Y, PLAY_W, HUD_BOTTOM_H);
    if (layoutMode === "portrait") {
      ctx.fillRect(0, CONTROL_Y, INTERNAL_W, UI_BOTTOM_H);
    } else {
      ctx.fillRect(0, UI_TOP_H, SIDE_CONTROL_W, INTERNAL_H - UI_TOP_H);
      ctx.fillRect(INTERNAL_W - SIDE_CONTROL_W, UI_TOP_H, SIDE_CONTROL_W, INTERNAL_H - UI_TOP_H);
      ctx.fillRect(GAME_X, HUD_Y + HUD_BOTTOM_H, PLAY_W, Math.max(0, INTERNAL_H - HUD_Y - HUD_BOTTOM_H));
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, UI_TOP_H - 1, INTERNAL_W, 1);
    ctx.fillRect(GAME_X, HUD_Y, PLAY_W, 1);
    ctx.fillRect(GAME_X, HUD_Y + HUD_BOTTOM_H - 1, PLAY_W, 1);
    if (layoutMode === "portrait") {
      ctx.fillRect(0, CONTROL_Y, INTERNAL_W, 1);
    } else {
      ctx.fillRect(GAME_X - 1, UI_TOP_H, 1, INTERNAL_H - UI_TOP_H);
      ctx.fillRect(GAME_X + PLAY_W, UI_TOP_H, 1, INTERNAL_H - UI_TOP_H);
    }
    const popCap = getPopCap();
    drawPixelTextScaled(`P${state.population}/${popCap} WIS${state.wisdom} Y${getGameYear()}`, GAME_X + 10, 8, 2, "#fff");
    const tr = state.tribe;
    const storeParts = [`F${tr.fruit || 0}`];
    if (state.huntingUnlocked) storeParts.push(`M${tr.meat || 0}`);
    if (state.understoodBranch) storeParts.push(`B${tr.wood || 0}`);
    if (state.understoodStone) storeParts.push(`S${tr.stone || 0}`);
    if (state.huntingUnlocked) storeParts.push(`L${tr.leather || 0}`);
    if (state.understoodStone) storeParts.push(`FL${tr.flint || 0}`);
    const storeText = storeParts.join(" ");
    const storeW = measurePixelText(storeText) * 2;
    drawPixelTextScaled(storeText, GAME_X + PLAY_W - storeW - 10, 8, 2, "#fff");
    const p = state.player;
    drawUiGauge("HP", Math.max(0, p.hp) / 100, GAME_X + 10, HUD_Y + 10, 96);
    const cap = getPlayerCapacity();
    drawUiGauge("BAG", inventoryTotal(p.inventory) / cap, GAME_X + 166, HUD_Y + 10, 66, `${inventoryTotal(p.inventory)}/${cap}`);
    drawPixelTextScaled(`ATK${state.tribeAtk} INT${state.tribeInt}`, GAME_X + PLAY_W - 222, HUD_Y + 12, 2, "#fff");
    drawLifeCircle(GAME_X + PLAY_W - 18, HUD_Y + 18);
    drawControlPanel();
  }

  function drawUiGauge(label, ratio, x, y, barW, suffix = "") {
    const barX = x + measurePixelText(label) * 2 + 10;
    ctx.fillStyle = "#111";
    ctx.fillRect(x - 2, y - 2, suffix ? barW + 92 : barW + 52, 20);
    ctx.fillStyle = "#fff";
    drawPixelTextScaled(label, x, y + 1, 2, "#fff");
    drawPixelFrame(barX, y, barW, 16, 2, "#fff");
    const fillW = Math.max(0, Math.min(barW - 4, Math.floor((barW - 4) * ratio)));
    ctx.fillRect(barX + 2, y + 2, fillW, 12);
    if (suffix) drawPixelTextScaled(suffix, barX + barW + 10, y + 1, 2, "#fff");
  }

  function drawLifeCircle(x, y) {
    const ratio = getLifeRatio();
    const innerRadius = Math.max(2, Math.round(9 * ratio));
    const danger = ratio <= 0.5 || state.player.hp <= 0 || state.foodShortageCount > 0;
    const critical = ratio <= 0.25 || state.player.hp <= 0;
    const pulseSpeed = critical ? 110 : 220;
    const pulsePhase = Math.floor(performance.now() / pulseSpeed) % 4;
    drawPixelTextScaled("LIFE", x - 76, y - 7, 2, "#fff");
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.stroke();
    if (danger) {
      const pulseRadius = Math.max(2, 9 - pulsePhase);
      if (critical || pulsePhase % 2 === 0) {
        ctx.beginPath();
        ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.lineWidth = 1;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPixelFrame(x, y, w, h, thickness = 2, color = "#fff") {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, thickness);
    ctx.fillRect(x, y + h - thickness, w, thickness);
    ctx.fillRect(x, y, thickness, h);
    ctx.fillRect(x + w - thickness, y, thickness, h);
  }

  function drawControlPanel() {
    const controls = getControlRects();
    drawDpad(controls);
    drawCanvasButton("SYSTEM", controls.menu.x, controls.menu.y, controls.menu.w, controls.menu.h, input.pressedControl === "menu");
    drawCanvasButton("MENU", controls.start.x, controls.start.y, controls.start.w, controls.start.h, input.pressedControl === "start");
    drawCanvasButton("ACT", controls.action.x, controls.action.y, controls.action.w, controls.action.h, input.pressedControl === "action", true);
  }

  function drawDpad(controls) {
    for (const part of getDpadTriangles(controls)) drawDpadPolygon(part.points, input.pressedControl === part.id);
  }

  function getDpadTriangles(controls) {
    const box = controls.dpadBox;
    const x = box.x;
    const y = box.y;
    const w = box.w;
    const h = box.h;
    const cx = x + w / 2;
    const cy = y + h / 2;
    return [
      { id: "up", dir: [0, -1], points: [[x, y], [x + w, y], [cx, cy]] },
      { id: "right", dir: [1, 0], points: [[x + w, y], [x + w, y + h], [cx, cy]] },
      { id: "down", dir: [0, 1], points: [[x + w, y + h], [x, y + h], [cx, cy]] },
      { id: "left", dir: [-1, 0], points: [[x, y + h], [x, y], [cx, cy]] },
    ];
  }

  function drawDpadPolygon(points, pressed) {
    if (!points) return;
    ctx.beginPath();
    ctx.moveTo(Math.floor(points[0][0]), Math.floor(points[0][1]));
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(Math.floor(points[i][0]), Math.floor(points[i][1]));
    ctx.closePath();
    ctx.fillStyle = pressed ? "#fff" : "#050505";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.lineWidth = 1;
    if (pressed) {
      ctx.fillStyle = "#111";
      const cx = points.reduce((sum, point) => sum + point[0], 0) / points.length;
      const cy = points.reduce((sum, point) => sum + point[1], 0) / points.length;
      ctx.fillRect(Math.floor(cx) - 3, Math.floor(cy) - 3, 6, 6);
    }
  }

  function drawCanvasButton(label, x, y, w, h, pressed, large = false) {
    ctx.fillStyle = pressed ? "#fff" : "#050505";
    ctx.fillRect(x, y, w, h);
    drawPixelFrame(x, y, w, h, 3, "#fff");
    ctx.fillStyle = pressed ? "#111" : "#fff";
    if (label) {
      const scale = large ? 3 : 2;
      const textW = measurePixelText(label) * scale;
      drawPixelTextScaled(label, x + Math.floor((w - textW) / 2), y + Math.floor((h - 7 * scale) / 2), scale, pressed ? "#111" : "#fff");
    }
  }

  function getControlRects() {
    if (layoutMode === "landscape") {
      // 左ストリップは D-pad 専用、右ストリップに ACT / SYSTEM / MENU をまとめる。
      return {
        dpadBox: { x: 6, y: 500, w: 150, h: 150 },
        menu: { id: "menu", x: 820, y: 380, w: 120, h: 60 },
        start: { id: "start", x: 820, y: 448, w: 120, h: 60 },
        action: { id: "action", x: 810, y: 520, w: 140, h: 140 },
      };
    }
    // 左側は D-pad 専用（大きく）、右側下部に ACT、その左に小さい SYSTEM / MENU。
    return {
      dpadBox: { x: 28, y: CONTROL_Y + 96, w: 168, h: 168 },
      menu: { id: "menu", x: 368, y: CONTROL_Y + 114, w: 96, h: 60 },
      start: { id: "start", x: 368, y: CONTROL_Y + 186, w: 96, h: 60 },
      action: { id: "action", x: 480, y: CONTROL_Y + 114, w: 132, h: 132 },
    };
  }

  function drawGameMenu() {
    const layout = getGameMenuLayout();
    const p = state.player;
    const { x, y, w, h, options } = layout;
    const cap = getPlayerCapacity();
    const carried = inventoryTotal(p.inventory);
    ctx.fillStyle = "#111";
    ctx.fillRect(x, y, w, h);
    drawPixelFrame(x, y, w, h, 3, "#fff");
    drawPixelTextScaled("MENU", x + 18, y + 16, 2, "#fff");
    for (let i = 0; i < options.length; i += 1) {
      const lineY = y + 50 + i * 26;
      if (i === gameMenuIndex) drawOutlinedPixelTextScaled("!", x + 18, lineY, 2);
      drawPixelTextScaled(options[i], x + 42, lineY, 2, "#fff");
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + 166, y + 44, 3, h - 60);
    const detailX = x + 188;
    let detailY = y + 50;
    const write = (text) => {
      drawPixelTextScaled(text, detailX, detailY, 2, "#fff");
      detailY += 22;
    };
    if (gameMenuIndex === 0) {
      write(`TRIBE STORAGE`);
      write(`FRUIT  ${state.tribe.fruit || 0}`);
      if (state.understoodStone) write(`STONE  ${state.tribe.stone || 0}`);
      if (state.understoodBranch) write(`BRANCH ${state.tribe.wood || 0}`);
      if (state.huntingUnlocked) write(`MEAT   ${state.tribe.meat || 0}`);
      if (state.huntingUnlocked) write(`LEATHR ${state.tribe.leather || 0}`);
      if (state.understoodStone) write(`FLINT  ${state.tribe.flint || 0}`);
    } else if (gameMenuIndex === 1) {
      write(`NAME ${romanName(p.name)}`);
      write(`AGE ${p.age}`);
      write(`HP ${Math.round(p.hp)}/100`);
      write(`LIFE ${Math.ceil(getLifeTurnsLeft() / TURNS_PER_YEAR)}Y`);
      write(`BAG ${carried}/${cap}`);
    } else if (gameMenuIndex === 2) {
      write(`INT ${state.tribeInt}`);
      write(`ATK ${state.tribeAtk}`);
      write(`WIS ${state.wisdom}`);
      write(`POP ${state.population}`);
      if (state.huntingUnlocked) write("HUNT ON");
      if (state.craftingUnlocked) write("CRAFT ON");
      if (state.buddyUnlocked) write(state.buddyOn ? "BUDDY ON" : "BUDDY OFF");
    } else if (gameMenuIndex === 3) {
      const discovered = getDiscoveryLog();
      if (discovered.length === 0) {
        write("NOTHING YET");
      } else {
        for (const entry of discovered) {
          write(`- ${entry}`);
        }
      }
    }
  }

  function drawCraftMenu() {
    const unlockedItems = getUnlockedItemLabels();
    if (!unlockedItems.includes(state.craftSlots[0])) state.craftSlots[0] = unlockedItems[0];
    if (!unlockedItems.includes(state.craftSlots[1])) state.craftSlots[1] = unlockedItems[0];
    const knownRecipes = CRAFT_RECIPES.filter(r => state.discoveries[r.wisKey]);
    const w = Math.min(420, PLAY_W - 40);
    const knownH = knownRecipes.length > 0 ? 20 + knownRecipes.length * 30 : 0;
    const h = 180 + knownH;
    const x = GAME_X + Math.floor((PLAY_W - w) / 2);
    const y = GAME_Y + Math.floor((PLAY_H - h) / 2);
    const slotLabels = [
      state.craftSlots[0] || unlockedItems[0] || "?",
      state.craftSlots[1] || unlockedItems[0] || "?",
    ];
    const options = [
      `A  ${slotLabels[0]}`,
      `B  ${slotLabels[1]}`,
      "TRY",
      "BACK",
    ];
    ctx.fillStyle = "#111";
    ctx.fillRect(x, y, w, h);
    drawPixelFrame(x, y, w, h, 3, "#fff");
    drawPixelTextScaled("COMBINE ITEMS", x + 22, y + 18, 2, "#fff");
    for (let i = 0; i < options.length; i += 1) {
      const lineY = y + 58 + i * 30;
      const selected = i === craftMenuIndex;
      if (selected) drawOutlinedPixelTextScaled("!", x + 24, lineY, 2);
      drawPixelTextScaled(options[i], x + 54, lineY, 2, "#fff");
      if (selected && (i === 0 || i === 1)) {
        drawPixelTextScaled("< >", x + w - 60, lineY, 2, "#fff");
      }
    }
    // Tribe storage column
    const storageX = x + Math.floor(w / 2);
    drawPixelTextScaled("STORAGE", storageX, y + 18, 2, "#888");
    const storageItems = [
      { key: "fruit",   label: "FRUIT ", always: true },
      { key: "wood",    label: "BRANCH", flag: state.understoodBranch },
      { key: "stone",   label: "STONE ", flag: state.understoodStone },
      { key: "meat",    label: "MEAT  ", flag: state.huntingUnlocked },
      { key: "leather", label: "LEATHR", flag: state.huntingUnlocked },
      { key: "flint",   label: "FLINT ", flag: state.understoodStone },
    ];
    let sY = y + 46;
    for (const item of storageItems) {
      if (!item.always && !item.flag) continue;
      drawPixelTextScaled(`${item.label} ${state.tribe[item.key] || 0}`, storageX, sY, 2, "#aaa");
      sY += 22;
    }
    if (knownRecipes.length > 0) {
      const kY = y + 172;
      ctx.fillStyle = "#333";
      ctx.fillRect(x + 12, kY - 4, w - 24, 1);
      drawPixelTextScaled("KNOWN", x + 22, kY + 4, 2, "#fff");
      knownRecipes.forEach((r, i) => {
        drawPixelTextScaled(r.name, x + 22, kY + 24 + i * 30, 2, "#888");
      });
    }
  }

  function drawBaseMenu() {
    const options = getBaseMenuOptions();
    const w = Math.min(260, PLAY_W - 40);
    const h = 112 + options.length * 30;
    const x = GAME_X + Math.floor((PLAY_W - w) / 2);
    const y = GAME_Y + Math.floor((PLAY_H - h) / 2);
    ctx.fillStyle = "#111";
    ctx.fillRect(x, y, w, h);
    drawPixelFrame(x, y, w, h, 3, "#fff");
    drawPixelTextScaled("BASE", x + 22, y + 18, 2, "#fff");
    for (let i = 0; i < options.length; i += 1) {
      const lineY = y + 58 + i * 30;
      if (i === baseMenuIndex) drawOutlinedPixelTextScaled("!", x + 24, lineY, 2);
      drawPixelTextScaled(options[i], x + 54, lineY, 2, "#fff");
    }
  }

  function drawLaborMenu() {
    const w = Math.min(300, PLAY_W - 40);
    const h = 80 + LABOR_JOBS.length * 34 + 16;
    const x = GAME_X + Math.floor((PLAY_W - w) / 2);
    const y = GAME_Y + Math.floor((PLAY_H - h) / 2);
    ctx.fillStyle = "#111";
    ctx.fillRect(x, y, w, h);
    drawPixelFrame(x, y, w, h, 3, "#fff");
    drawPixelTextScaled("ASSIGN WORK", x + 22, y + 18, 2, "#fff");
    const avail = getLaborAvailable();
    const total = getLaborTotal();
    const workerLabel = `WORKERS ${total}/${avail}`;
    drawPixelTextScaled(workerLabel, x + 22, y + 46, 2, "#fff");
    for (let i = 0; i < LABOR_JOBS.length; i += 1) {
      const job = LABOR_JOBS[i];
      const lineY = y + 78 + i * 34;
      const unlocked = isLaborJobUnlocked(job.id);
      if (i === laborMenuIndex) drawOutlinedPixelTextScaled("!", x + 18, lineY, 2);
      drawPixelTextScaled(job.label, x + 46, lineY, 2, unlocked ? "#fff" : "#888");
      if (!unlocked) {
        drawPixelTextScaled("LOCKED", x + 46 + 80, lineY, 2, "#888");
      } else {
        const count = state.labor[job.id] || 0;
        drawPixelTextScaled("<", x + 46 + 80, lineY, 2, "#fff");
        drawPixelTextScaled(String(count), x + 46 + 98, lineY, 2, "#fff");
        drawPixelTextScaled(">", x + 46 + 114, lineY, 2, "#fff");
        drawPixelTextScaled(job.hint, x + 46 + 134, lineY, 2, "#888");
      }
    }
  }

  function drawCampRangeIndicators(cameraX, cameraY) {
    // 各拠点について、近接禁止範囲(赤)と建設可能範囲(灰)を点線で描く
    const drawRing = (base, radius, color) => {
      ctx.fillStyle = color;
      for (let angle = 0; angle < 360; angle += 3) {
        const rad = (angle * Math.PI) / 180;
        const tx = Math.round(base.x + Math.cos(rad) * radius);
        const ty = Math.round(base.y + Math.sin(rad) * radius);
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        const sx = Math.floor(tx * TILE_SIZE - cameraX) + TILE_SIZE / 2 - 1;
        const sy = Math.floor(ty * TILE_SIZE - cameraY) + TILE_SIZE / 2 - 1;
        ctx.fillRect(sx, sy, 2, 2);
      }
    };
    for (const base of state.bases) {
      drawRing(base, MIN_CAMP_DISTANCE, "#a33");          // 近すぎ
      drawRing(base, campPlaceMaxForBase(base), "#666");  // 建設可能上限
    }
  }

  function drawCampPlacementHint() {
    const label = "MOVE: CURSOR  ACT: BUILD  ESC: CANCEL";
    const scale = 2;
    const textW = measurePixelText(label) * scale;
    const bx = GAME_X + Math.floor((PLAY_W - textW) / 2) - 6;
    const by = GAME_Y + PLAY_H - 32;
    ctx.fillStyle = "#111";
    ctx.fillRect(bx, by, textW + 12, 24);
    drawPixelFrame(bx, by, textW + 12, 24, 2, "#fff");
    drawPixelTextScaled(label, bx + 6, by + 6, scale, "#fff");
  }

  function drawRestOverlay() {
    if (!restSequenceStart || restSequenceDone) return;
    const elapsed = performance.now() - restSequenceStart;
    const NIGHT_END = 2200;
    const MORNING_END = 3400;
    let bgAlpha, text;
    if (elapsed < NIGHT_END) {
      bgAlpha = Math.min(0.94, elapsed / 900 * 0.94);
      text = "GOOD NIGHT";
    } else {
      bgAlpha = Math.max(0, 0.94 - (elapsed - NIGHT_END) / (MORNING_END - NIGHT_END) * 0.94);
      text = "GOOD MORNING";
    }
    ctx.fillStyle = `rgba(0, 0, 0, ${bgAlpha})`;
    ctx.fillRect(GAME_X, GAME_Y, PLAY_W, PLAY_H);
    if (elapsed > 400 && elapsed < MORNING_END - 200) {
      const scale = 2;
      const textW = measurePixelText(text) * scale;
      drawOutlinedPixelTextScaled(text, GAME_X + Math.floor((PLAY_W - textW) / 2), GAME_Y + Math.floor(PLAY_H / 2) - 8, scale);
    }
  }

  function formatUnlockedItemCounts(source) {
    const parts = [`F${source.fruit || 0}`];
    if (state.huntingUnlocked) parts.push(`M${source.meat || 0}`);
    if (state.understoodBranch) parts.push(`W${source.wood || 0}`);
    if (state.understoodStone) parts.push(`S${source.stone || 0}`);
    return parts.join(" ");
  }

  function getGameMenuLayout() {
    const w = Math.min(440, PLAY_W - 32);
    const x = GAME_X + Math.floor((PLAY_W - w) / 2);
    const y = GAME_Y + 34;
    const h = 300;
    return {
      x,
      y,
      w,
      h,
      options: getGameMenuOptions(),
    };
  }

  function getGameMenuOptions() {
    return ["ITEMS", "STATUS", "TRIBE", "DISCOVERY"];
  }

  function drawSystemMenu() {
    const options = getSystemMenuOptions();
    const w = Math.min(340, PLAY_W - 32);
    const x = GAME_X + Math.floor((PLAY_W - w) / 2);
    const y = GAME_Y + 50;
    const h = 76 + options.length * 30;
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, w, h);
    drawPixelFrame(x, y, w, h, 3, "#fff");
    drawPixelTextScaled("SYSTEM", x + 42, y + 18, 2, "#fff");
    for (let i = 0; i < options.length; i += 1) {
      const lineY = y + 56 + i * 30;
      if (i === systemMenuIndex) drawOutlinedPixelTextScaled("!", x + 18, lineY, 2);
      const isDebug = options[i].startsWith("[DEBUG]");
      drawPixelTextScaled(options[i], x + 42, lineY, 2, isDebug ? "#f80" : "#fff");
    }
  }

  function getSystemMenuOptions() {
    return ["SAVE AUTO", "LOAD TITLE", "RESET SAVE", "[DEBUG] UNLOCK ALL", "[DEBUG] ADD RESOURCES", "[DEBUG] POP +5"];
  }

  function moveSystemMenuSelection(delta) {
    const options = getSystemMenuOptions();
    systemMenuIndex = (systemMenuIndex + delta + options.length) % options.length;
  }

  function activateSystemMenuSelection() {
    const options = getSystemMenuOptions();
    const selected = options[systemMenuIndex];
    if (selected === "SAVE AUTO") {
      saveGame();
      addLog("SAVED");
      state.systemMenuOpen = false;
    } else if (selected === "LOAD TITLE") {
      state.systemMenuOpen = false;
      mode = "title";
    } else if (selected === "RESET SAVE") {
      resetSave();
      state.systemMenuOpen = false;
      mode = "title";
    } else if (selected === "[DEBUG] UNLOCK ALL") {
      debugUnlockAll();
    } else if (selected === "[DEBUG] ADD RESOURCES") {
      debugAddResources();
    } else if (selected === "[DEBUG] POP +5") {
      debugPopPlus5();
    }
  }

  function debugUnlockAll() {
    // Unlock features
    state.settlementUnlocked = true;
    state.laborUnlocked = true;
    state.huntingUnlocked = true;
    state.craftingUnlocked = true;
    state.hasFire = true;
    state.knewSpark = true;

    // Discoveries
    const disc = state.discoveries;
    disc.understoodFruit = true;
    disc.understoodStone = true;
    disc.understoodBranch = true;
    disc.understoodFlint = true;
    disc.understoodLeather = true;
    disc.craft_sharp_stone = true;
    disc.craft_stone_knife = true;
    disc.craft_clothing = true;
    disc.craft_pack_frame = true;
    disc.craft_spark = true;
    disc.make_fire = true;

    // Top-level understood flags
    state.understoodStone = true;
    state.understoodBranch = true;

    // Tribe stats
    state.wisdom   = Math.max(state.wisdom   || 0, 20);
    state.tribeInt = Math.max(state.tribeInt || 0, 20);
    state.tribeAtk = Math.max(state.tribeAtk || 0, 10);
    state.population = Math.max(state.population || 0, 5);

    // Resources
    state.tribe.fruit   = (state.tribe.fruit   || 0) + 50;
    state.tribe.stone   = (state.tribe.stone   || 0) + 50;
    state.tribe.wood    = (state.tribe.wood    || 0) + 50;
    state.tribe.meat    = (state.tribe.meat    || 0) + 20;
    state.tribe.leather = (state.tribe.leather || 0) + 30;
    state.tribe.flint   = (state.tribe.flint   || 0) + 30;

    clampLaborToPopulation();
    clampInventory();
    revealAroundBases();
    addLog("DEBUG UNLOCK ALL");
    state.systemMenuOpen = false;
  }

  function debugAddResources() {
    state.tribe.fruit   = (state.tribe.fruit   || 0) + 50;
    state.tribe.stone   = (state.tribe.stone   || 0) + 50;
    state.tribe.wood    = (state.tribe.wood    || 0) + 50;
    state.tribe.meat    = (state.tribe.meat    || 0) + 20;
    state.tribe.leather = (state.tribe.leather || 0) + 30;
    state.tribe.flint   = (state.tribe.flint   || 0) + 30;
    clampInventory();
    addLog("DEBUG ADD RESOURCES");
    state.systemMenuOpen = false;
  }

  function debugPopPlus5() {
    state.population = (state.population || 0) + 5;
    clampLaborToPopulation();
    addLog("DEBUG POP +5");
    state.systemMenuOpen = false;
  }

  function getLifeRatio() {
    if (!state || !state.player || !state.player.maxLife) return 1;
    return Math.max(0, Math.min(1, (state.player.maxLife - state.player.life) / state.player.maxLife));
  }

  function getLifeTurnsLeft() {
    if (!state || !state.player) return 0;
    return Math.max(0, Math.ceil(state.player.maxLife - state.player.life));
  }

  function getGameYear() {
    return Math.max(1, Math.floor(state.turn / TURNS_PER_YEAR) + 1);
  }

  function getGameDay() {
    return Math.max(1, Math.floor(state.turn / 30) + 1);
  }

  function romanName(name) {
    const index = Math.max(0, names.indexOf(name));
    return `N${index + 1}`;
  }

  function noticeTextForCanvas(text) {
    if (!text) return "";
    if (text.includes("限界")) return "LIMIT";
    if (text.includes("命を削った")) return "LIFE -";
    if (text.includes("飢え")) return "NO FOOD";
    if (text.includes("鼓動")) return "LOW HP";
    if (text.includes("海")) return "SEA DANGER";
    if (text.includes("手持ち満杯")) return "BAG FULL";
    if (text.includes("HP回復")) return "HP FULL";
    if (text.includes("HP低下")) return "LOW HP";
    if (text.includes("荷物")) return "BAG HOME";
    if (text.includes("拠点")) return "BASE";
    if (text.includes("果物")) return text.includes("+") ? text.replace("果物", "F") : "FRUIT";
    if (text.includes("肉")) return text.includes("+") ? text.replace("肉", "M") : "MEAT";
    if (text.includes("木")) return text.includes("+") ? text.replace("木", "WOOD ") : "WOOD";
    if (text.includes("石")) return text.includes("+") ? text.replace("石", "STONE ") : "STONE";
    if (text.includes("人口")) return "POP";
    if (text.includes("叡智")) return "WIS";
    if (text.includes("視界")) return "VIEW UP";
    if (text.includes("遺品")) return "RELIC";
    if (text.includes("獲物")) return "HUNT";
    if (text.includes("獣")) return "MISS";
    if (text.includes("巣")) return "BASE";
    if (text.includes("進めない")) return "NO WAY";
    return String(text).replace(/[^\x20-\x7e]/g, "").slice(0, 24) || "NOTICE";
  }

  function isEmergencyNotice(text) {
    return ["NO FOOD", "LOW HP", "LIMIT", "LIFE -"].includes(text);
  }

  const pixelFont = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "11100"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "/": ["00001", "00001", "00010", "00100", "01000", "10000", "10000"],
    ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    "ト": ["10000", "10000", "11110", "10011", "10000", "10000", "10000"],
    "ル": ["10010", "10010", "10010", "10010", "10010", "10010", "01101"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  };

  function drawPixelText(text, x, y, color = "#fff") {
    ctx.fillStyle = color;
    let dx = Math.floor(x);
    const dy = Math.floor(y);
    for (const rawChar of String(text).toUpperCase()) {
      const glyph = pixelFont[rawChar] || pixelFont[" "];
      for (let row = 0; row < glyph.length; row += 1) {
        for (let col = 0; col < glyph[row].length; col += 1) {
          if (glyph[row][col] === "1") ctx.fillRect(dx + col, dy + row, 1, 1);
        }
      }
      dx += rawChar === " " ? 4 : 6;
    }
  }

  function drawPixelTextScaled(text, x, y, scale = 2, color = "#fff") {
    ctx.fillStyle = color;
    let dx = Math.floor(x);
    const dy = Math.floor(y);
    for (const rawChar of String(text).toUpperCase()) {
      const glyph = pixelFont[rawChar] || pixelFont[" "];
      for (let row = 0; row < glyph.length; row += 1) {
        for (let col = 0; col < glyph[row].length; col += 1) {
          if (glyph[row][col] === "1") ctx.fillRect(dx + col * scale, dy + row * scale, scale, scale);
        }
      }
      dx += rawChar === " " ? 4 * scale : 6 * scale;
    }
  }

  function drawOutlinedPixelTextScaled(text, x, y, scale = 2) {
    const offsets = [
      [-scale, 0],
      [scale, 0],
      [0, -scale],
      [0, scale],
      [-scale, -scale],
      [scale, -scale],
      [-scale, scale],
      [scale, scale],
    ];
    for (const [ox, oy] of offsets) drawPixelTextScaled(text, x + ox, y + oy, scale, "#111");
    drawPixelTextScaled(text, x, y, scale, "#fff");
  }

  function drawPixelTextDissolve(text, x, y, color = "#fff", phase = 0) {
    ctx.fillStyle = color;
    let dx = Math.floor(x);
    const dy = Math.floor(y);
    const gate = phase < 0.5 ? 0.88 - phase * 0.6 : 0.58 + (phase - 0.5) * 0.7;
    for (let charIndex = 0; charIndex < String(text).length; charIndex += 1) {
      const rawChar = String(text)[charIndex].toUpperCase();
      const glyph = pixelFont[rawChar] || pixelFont[" "];
      for (let row = 0; row < glyph.length; row += 1) {
        for (let col = 0; col < glyph[row].length; col += 1) {
          const n = seededNoise((charIndex + 1) * 17 + col * 5, row * 11 + Math.floor(phase * 10));
          if (glyph[row][col] === "1" && n < gate) ctx.fillRect(dx + col, dy + row, 1, 1);
        }
      }
      dx += rawChar === " " ? 4 : 6;
    }
  }

  function drawPixelTextDissolveScaled(text, x, y, scale = 2, color = "#fff", phase = 0) {
    ctx.fillStyle = color;
    let dx = Math.floor(x);
    const dy = Math.floor(y);
    const gate = phase < 0.5 ? 0.88 - phase * 0.6 : 0.58 + (phase - 0.5) * 0.7;
    for (let charIndex = 0; charIndex < String(text).length; charIndex += 1) {
      const rawChar = String(text)[charIndex].toUpperCase();
      const glyph = pixelFont[rawChar] || pixelFont[" "];
      for (let row = 0; row < glyph.length; row += 1) {
        for (let col = 0; col < glyph[row].length; col += 1) {
          const n = seededNoise((charIndex + 1) * 17 + col * 5, row * 11 + Math.floor(phase * 10));
          if (glyph[row][col] === "1" && n < gate) ctx.fillRect(dx + col * scale, dy + row * scale, scale, scale);
        }
      }
      dx += rawChar === " " ? 4 * scale : 6 * scale;
    }
  }

  function measurePixelText(text) {
    let width = 0;
    for (const rawChar of String(text)) width += rawChar === " " ? 4 : 6;
    return Math.max(0, width - 1);
  }

  function wrapPixelText(text, maxChars) {
    const words = String(text).split(" ");
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    return hash;
  }

  function showOverlay(nextMode, text) {
    mode = nextMode;
    overlay.classList.add("visible");
    overlayText.textContent = text;
    candidateList.innerHTML = "";
    historyList.innerHTML = "";
    document.getElementById("closeOverlayButton").style.display = nextMode === "title" || nextMode === "generation" || nextMode === "gameover" ? "none" : "block";
  }

  function hideOverlay() {
    overlay.classList.remove("visible");
    candidateList.innerHTML = "";
    historyList.innerHTML = "";
  }

  function showMenu() {
    if (!state) {
      showOverlay("title", "小さな島で採集し、拠点を築き、世代をつないで部族を育てよう。");
      return;
    }
    if (mode !== "playing") return;
    if (state.milestoneOverlay) return;
    if (state.placingCamp) {
      state.placingCamp = false;
      state.campCursor = null;
      addLog("CANCELLED");
      return;
    }
    state.craftMenuOpen = false;
    state.laborMenuOpen = false;
    state.gameMenuOpen = false;
    state.baseMenuOpen = false;
    state.systemMenuOpen = !state.systemMenuOpen;
    if (state.systemMenuOpen) systemMenuIndex = 0;
    if (state.systemMenuOpen) saveGame();
  }

  function toggleGameMenu() {
    if (!state || mode !== "playing") return;
    if (state.milestoneOverlay) return;
    state.systemMenuOpen = false;
    state.craftMenuOpen = false;
    state.baseMenuOpen = false;
    state.gameMenuOpen = !state.gameMenuOpen;
    if (state.gameMenuOpen) gameMenuIndex = 0;
  }

  function moveGameMenuSelection(delta) {
    gameMenuIndex = (gameMenuIndex + delta + getGameMenuOptions().length) % getGameMenuOptions().length;
  }

  function activateGameMenuSelection() {
    return;
  }

  function setTitleNotice(text) {
    titleNotice = text;
    titleNoticeUntil = performance.now() + 1600;
  }

  function moveTitleSelection(delta) {
    if (titlePanel) return;
    titleIndex = (titleIndex + delta + TITLE_OPTIONS.length) % TITLE_OPTIONS.length;
  }

  function activateTitleSelection() {
    if (mode !== "title" || state) return;
    if (titlePanel) {
      titlePanel = "";
      return;
    }
    const option = TITLE_OPTIONS[titleIndex];
    if (option === "NEW GAME") startNewGame();
    if (option === "CONTINUE") continueFromTitle();
    if (option === "HISTORY") titlePanel = "history";
    if (option === "SETTINGS") titlePanel = "settings";
  }

  function handleCanvasClick(event) {
    if (ignoreNextCanvasClick) {
      ignoreNextCanvasClick = false;
    }
    if (event && event.preventDefault) event.preventDefault();
  }

  function handleCanvasPointerDown(event) {
    const point = getCanvasPoint(event);
    if (mode === "title" && !state) {
      event.preventDefault();
      ignoreNextCanvasClick = true;
      const control = controlAt(point.x, point.y);
      input.pressedControl = control ? control.id : null;
      if (control) {
        if (control.id === "up" || control.id === "left") moveTitleSelection(-1);
        if (control.id === "down" || control.id === "right") moveTitleSelection(1);
        if (control.id === "action" || control.id === "start") activateTitleSelection();
        if (control.id === "menu") titlePanel = titlePanel ? "" : "settings";
      }
      return;
    }
    if (mode === "generation") {
      event.preventDefault();
      ignoreNextCanvasClick = true;
      const control = controlAt(point.x, point.y);
      input.pressedControl = control ? control.id : null;
      if (control) {
        if (control.id === "left" || control.id === "up") moveGenerationSelection(-1);
        if (control.id === "right" || control.id === "down") moveGenerationSelection(1);
        if (control.id === "action" || control.id === "start") activateGenerationSelection();
      }
      return;
    }
    if (mode === "death") {
      event.preventDefault();
      ignoreNextCanvasClick = true;
      return;
    }
    if (mode === "gameover") {
      event.preventDefault();
      ignoreNextCanvasClick = true;
      const control = controlAt(point.x, point.y);
      input.pressedControl = control ? control.id : null;
      if (control && (control.id === "action" || control.id === "start")) returnToTitle();
      return;
    }
    if (mode !== "playing") return;
    if (state && state.milestoneOverlay) {
      event.preventDefault();
      ignoreNextCanvasClick = true;
      return;
    }
    const control = controlAt(point.x, point.y);
    if (state && state.baseMenuOpen) {
      event.preventDefault();
      ignoreNextCanvasClick = true;
      input.pressedControl = control ? control.id : null;
      if (control) {
        if (control.id === "up" || control.id === "left") moveBaseMenuSelection(-1);
        if (control.id === "down" || control.id === "right") moveBaseMenuSelection(1);
        if (control.id === "action" || control.id === "start") activateBaseMenuSelection();
        if (control.id === "menu") state.baseMenuOpen = false;
      }
      return;
    }
    if (state && state.laborMenuOpen) {
      event.preventDefault();
      ignoreNextCanvasClick = true;
      input.pressedControl = control ? control.id : null;
      if (control) {
        if (control.id === "up") moveLaborMenuSelection(-1);
        if (control.id === "down") moveLaborMenuSelection(1);
        if (control.id === "left") adjustLaborJob(-1);
        if (control.id === "right") adjustLaborJob(1);
        if (control.id === "action" || control.id === "start" || control.id === "menu") state.laborMenuOpen = false;
      }
      return;
    }
    if (state && state.systemMenuOpen) {
      event.preventDefault();
      ignoreNextCanvasClick = true;
      input.pressedControl = control ? control.id : null;
      if (control) {
        if (control.id === "up" || control.id === "left") moveSystemMenuSelection(-1);
        if (control.id === "down" || control.id === "right") moveSystemMenuSelection(1);
        if (control.id === "action" || control.id === "start") activateSystemMenuSelection();
        if (control.id === "menu") state.systemMenuOpen = false;
      }
      return;
    }
    if (state && state.craftMenuOpen) {
      event.preventDefault();
      ignoreNextCanvasClick = true;
      input.pressedControl = control ? control.id : null;
      if (control) {
        if (control.id === "up") moveCraftMenuSelection(-1);
        if (control.id === "down") moveCraftMenuSelection(1);
        if (control.id === "left") { if (craftMenuIndex === 0 || craftMenuIndex === 1) cycleCraftSlot(craftMenuIndex, -1); else moveCraftMenuSelection(-1); }
        if (control.id === "right") { if (craftMenuIndex === 0 || craftMenuIndex === 1) cycleCraftSlot(craftMenuIndex, 1); else moveCraftMenuSelection(1); }
        if (control.id === "action" || control.id === "start") activateCraftMenuSelection();
        if (control.id === "menu") state.craftMenuOpen = false;
      }
      return;
    }
    if (state && state.gameMenuOpen) {
      event.preventDefault();
      ignoreNextCanvasClick = true;
      input.pressedControl = control ? control.id : null;
      if (control) {
        if (control.id === "up" || control.id === "left") moveGameMenuSelection(-1);
        if (control.id === "down" || control.id === "right") moveGameMenuSelection(1);
        if (control.id === "action" || control.id === "start") activateGameMenuSelection();
        if (control.id === "start") state.gameMenuOpen = false;
        if (control.id === "menu") {
          state.gameMenuOpen = false;
          showMenu();
        }
      }
      return;
    }
    if (!control) return;
    event.preventDefault();
    input.pressedControl = control.id;
    if (control.dir) {
      tryMove(control.dir[0], control.dir[1]);
      startHeldMove(control.dir[0], control.dir[1]);
      return;
    }
    if (control.id === "action") {
      doAction();
    }
    if (control.id === "menu") showMenu();
    if (control.id === "start") toggleGameMenu();
  }

  function handleCanvasPointerUp(event) {
    const wasDir = ["up", "left", "right", "down"].includes(input.pressedControl);
    input.pressedControl = null;
    if (wasDir) {
      input.mobileX = 0;
      input.mobileY = 0;
      stopHeldMove();
    }
    if (event && event.preventDefault) event.preventDefault();
  }

  function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = INTERNAL_W / rect.width;
    const scaleY = INTERNAL_H / rect.height;
    return {
      x: Math.floor((event.clientX - rect.left) * scaleX),
      y: Math.floor((event.clientY - rect.top) * scaleY),
    };
  }

  function controlAt(x, y) {
    const r = getControlRects();
    for (const part of getDpadTriangles(r)) {
      if (pointInTriangle(x, y, part.points)) return { id: part.id, dir: part.dir };
    }
    const controls = [r.menu, r.start, r.action];
    return controls.find((control) => x >= control.x && x <= control.x + control.w && y >= control.y && y <= control.y + control.h) || null;
  }

  function pointInTriangle(x, y, points) {
    const [a, b, c] = points;
    const area = triangleArea(a, b, c);
    const area1 = triangleArea([x, y], b, c);
    const area2 = triangleArea(a, [x, y], c);
    const area3 = triangleArea(a, b, [x, y]);
    return Math.abs(area - (area1 + area2 + area3)) <= 0.5;
  }

  function triangleArea(a, b, c) {
    return Math.abs((a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])) / 2);
  }

  function showHistory() {
    if (!state) {
      showOverlay("history", "まだ歴史はありません。");
      return;
    }
    showOverlay("history", "歴史帳");
    historyList.innerHTML = "";
    if (state.history.length === 0) {
      historyList.textContent = "まだ誰も祖先になっていません。";
      return;
    }
    for (const entry of state.history) {
      const card = document.createElement("div");
      card.className = "history-card";
      const face = makeFaceCanvas(entry.face);
      const text = document.createElement("div");
      text.innerHTML = `<strong>${entry.generation}代目 ${entry.name}</strong> 享年${entry.age}<br>${entry.reason} / 地点 ${entry.deathPlace}<br>${entry.achievements.join("、")}<br>遺品: ${entry.recovered ? "回収済み" : "未回収"}`;
      card.append(face, text);
      historyList.appendChild(card);
    }
  }

  function makeFaceCanvas(face) {
    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = 56;
    faceCanvas.height = 56;
    faceCanvas.className = "face-canvas";
    const faceCtx = faceCanvas.getContext("2d");
    faceCtx.fillStyle = "#f7f7f7";
    faceCtx.fillRect(0, 0, 56, 56);
    drawPixelPerson(faceCtx, 14, 7, face, 3);
    return faceCanvas;
  }

  function forEachNearbyTile(cx, cy, radius, callback) {
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(MAP_W - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(MAP_H - 1, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (manhattanDistance(cx, cy, x, y) <= radius) callback(x, y, state.map[y][x]);
      }
    }
  }

  function nearestBase(range) {
    return state.bases.find((base) => manhattanDistance(state.player.gridX, state.player.gridY, base.x, base.y) <= range);
  }

  function getPopCap() {
    if (!state || !state.bases) return 5;
    return state.bases.reduce((sum, b) => sum + (POP_CAP_BY_LEVEL[baseLevel(b) - 1] || 5), 0);
  }

  function getLaborAvailable() {
    return Math.max(0, (state.population || 0) - 1);
  }

  function getLaborTotal() {
    const l = state.labor;
    return (l.fruit || 0) + (l.stone || 0) + (l.branch || 0) + (l.hunt || 0);
  }

  function isLaborJobUnlocked(id) {
    if (id === "fruit")  return !!state.understoodStone;
    if (id === "stone")  return !!state.understoodBranch;
    if (id === "branch") return !!(state.discoveries && state.discoveries.craft_stone_knife);
    if (id === "hunt")   return !!state.huntingUnlocked;
    return false;
  }

  function clampLaborToPopulation() {
    if (!state) return;
    const avail = getLaborAvailable();
    for (const job of LABOR_JOBS) {
      const key = job.id;
      if ((state.labor[key] || 0) > avail) state.labor[key] = avail;
    }
    // clamp sequentially so total stays <= avail
    let remaining = avail;
    for (const job of LABOR_JOBS) {
      const key = job.id;
      const clamped = Math.min(state.labor[key] || 0, remaining);
      state.labor[key] = clamped;
      remaining -= clamped;
    }
  }

  function updateLaborYield() {
    if (!state || !state.laborUnlocked) return;
    if (state.turn - state.lastLaborTurn < LABOR_TURN_INTERVAL) return;
    state.lastLaborTurn = state.turn;
    const l = state.labor;
    let gained = [];
    // FRUIT workers
    const fruitWorkers = l.fruit || 0;
    if (fruitWorkers > 0) {
      const amt = fruitWorkers * 2;
      state.tribe.fruit = (state.tribe.fruit || 0) + amt;
      gained.push(`F+${amt}`);
    }
    // STONE workers
    const stoneWorkers = l.stone || 0;
    if (stoneWorkers > 0) {
      const amt = stoneWorkers;
      state.tribe.stone = (state.tribe.stone || 0) + amt;
      gained.push(`S+${amt}`);
    }
    // BRANCH workers
    const branchWorkers = l.branch || 0;
    if (branchWorkers > 0) {
      const amt = branchWorkers;
      state.tribe.wood = (state.tribe.wood || 0) + amt;
      gained.push(`W+${amt}`);
    }
    // HUNT workers (2 per yield)
    const huntWorkers = l.hunt || 0;
    const huntYield = Math.floor(huntWorkers / 2);
    if (huntYield > 0) {
      state.tribe.meat = (state.tribe.meat || 0) + huntYield;
      state.tribe.leather = (state.tribe.leather || 0) + huntYield;
      gained.push(`M+${huntYield} L+${huntYield}`);
    }
    if (gained.length > 0) {
      addLog("WORKERS RETURNED");
      addLog(gained.join(" "));
    }
  }

  function clampInventory() {
    const inv = state.player.inventory;
    while (inventoryTotal(inv) > getPlayerCapacity()) {
      if (inv.fruit > 0) inv.fruit -= 1;
      else if (inv.meat > 0) inv.meat -= 1;
      else if (inv.wood > 0) inv.wood -= 1;
      else if (inv.stone > 0) inv.stone -= 1;
      else if (inv.leather > 0) inv.leather -= 1;
      else if (inv.flint > 0) inv.flint -= 1;
      else break;
    }
  }

  function inventoryTotal(inv) {
    if (!inv) return 0;
    return (inv.fruit || 0) + (inv.meat || 0) + (inv.wood || 0) + (inv.stone || 0) + (inv.leather || 0) + (inv.flint || 0);
  }

  function distance(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function gridDistance(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function manhattanDistance(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  function randomFace() {
    const skins = ["#ddd", "#ccc", "#bbb", "#eee"];
    const hairs = ["#111", "#222", "#333", "#000"];
    const clothes = ["#444", "#555", "#666", "#777"];
    return {
      skin: skins[randomInt(0, skins.length - 1)],
      hair: hairs[randomInt(0, hairs.length - 1)],
      cloth: clothes[randomInt(0, clothes.length - 1)],
      mouth: "#111",
    };
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function cryptoRandomId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  window.addEventListener("resize", scheduleResizeCanvas);
  // orientation 変更直後は innerHeight/visualViewport の更新が遅れるため、
  // 即時 + 遅延の多段で再計算してズレを防ぐ。
  window.addEventListener("orientationchange", scheduleResizeCanvas);
  window.addEventListener("load", scheduleResizeCanvas);
  // スリープ→復帰時。resize/orientationchange が発火しないことがあるため、
  // タブが再表示されたタイミング（visibilitychange / pageshow / focus）でも
  // 再レイアウトしてズレを補正する。
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      scheduleResizeCanvas();
    }
  });
  window.addEventListener("pageshow", scheduleResizeCanvas);
  window.addEventListener("focus", scheduleResizeCanvas);
  // モバイルのツールバー表示/非表示・ピンチズームに追従する。
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleResizeCanvas);
    window.visualViewport.addEventListener("scroll", scheduleResizeCanvas);
  }
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (state && state.milestoneOverlay) {
      event.preventDefault();
      return;
    }
    if (mode === "title" && !state) {
      if (key === "arrowup" || key === "w" || key === "arrowleft" || key === "a") {
        event.preventDefault();
        moveTitleSelection(-1);
        return;
      }
      if (key === "arrowdown" || key === "s" || key === "arrowright" || key === "d") {
        event.preventDefault();
        moveTitleSelection(1);
        return;
      }
      if (key === " " || key === "enter") {
        event.preventDefault();
        activateTitleSelection();
        return;
      }
    }
    if (mode === "generation") {
      if (key === "arrowleft" || key === "a" || key === "arrowup" || key === "w") {
        event.preventDefault();
        moveGenerationSelection(-1);
        return;
      }
      if (key === "arrowright" || key === "d" || key === "arrowdown" || key === "s") {
        event.preventDefault();
        moveGenerationSelection(1);
        return;
      }
      if (key === " " || key === "enter") {
        event.preventDefault();
        activateGenerationSelection();
        return;
      }
    }
    if (mode === "death") {
      event.preventDefault();
      return;
    }
    if (mode === "gameover") {
      if (key === " " || key === "enter") {
        event.preventDefault();
        returnToTitle();
        return;
      }
    }
    if (mode === "playing" && state && state.gameMenuOpen) {
      if (key === "arrowup" || key === "w" || key === "arrowleft" || key === "a") {
        event.preventDefault();
        moveGameMenuSelection(-1);
        return;
      }
      if (key === "arrowdown" || key === "s" || key === "arrowright" || key === "d") {
        event.preventDefault();
        moveGameMenuSelection(1);
        return;
      }
      if (key === " " || key === "enter") {
        event.preventDefault();
        activateGameMenuSelection();
        return;
      }
      if (key === "i" || key === "tab" || key === "m" || key === "escape") {
        event.preventDefault();
        state.gameMenuOpen = false;
        return;
      }
    }
    if (mode === "playing" && state && state.baseMenuOpen) {
      if (key === "arrowup" || key === "w" || key === "arrowleft" || key === "a") {
        event.preventDefault();
        moveBaseMenuSelection(-1);
        return;
      }
      if (key === "arrowdown" || key === "s" || key === "arrowright" || key === "d") {
        event.preventDefault();
        moveBaseMenuSelection(1);
        return;
      }
      if (key === " " || key === "enter") {
        event.preventDefault();
        activateBaseMenuSelection();
        return;
      }
      if (key === "m" || key === "escape" || key === "tab") {
        event.preventDefault();
        state.baseMenuOpen = false;
        return;
      }
    }
    if (mode === "playing" && state && state.laborMenuOpen) {
      if (key === "arrowup" || key === "w") {
        event.preventDefault();
        moveLaborMenuSelection(-1);
        return;
      }
      if (key === "arrowdown" || key === "s") {
        event.preventDefault();
        moveLaborMenuSelection(1);
        return;
      }
      if (key === "arrowleft" || key === "a") {
        event.preventDefault();
        adjustLaborJob(-1);
        return;
      }
      if (key === "arrowright" || key === "d") {
        event.preventDefault();
        adjustLaborJob(1);
        return;
      }
      if (key === "m" || key === "escape" || key === "tab" || key === " " || key === "enter") {
        event.preventDefault();
        state.laborMenuOpen = false;
        return;
      }
    }
    if (mode === "playing" && state && state.craftMenuOpen) {
      if (key === "arrowup" || key === "w") {
        event.preventDefault();
        moveCraftMenuSelection(-1);
        return;
      }
      if (key === "arrowdown" || key === "s") {
        event.preventDefault();
        moveCraftMenuSelection(1);
        return;
      }
      if (key === "arrowleft" || key === "a") {
        event.preventDefault();
        if (craftMenuIndex === 0 || craftMenuIndex === 1) cycleCraftSlot(craftMenuIndex, -1);
        return;
      }
      if (key === "arrowright" || key === "d") {
        event.preventDefault();
        if (craftMenuIndex === 0 || craftMenuIndex === 1) cycleCraftSlot(craftMenuIndex, 1);
        return;
      }
      if (key === " " || key === "enter") {
        event.preventDefault();
        activateCraftMenuSelection();
        return;
      }
      if (key === "m" || key === "escape" || key === "tab") {
        event.preventDefault();
        state.craftMenuOpen = false;
        return;
      }
    }
    if (mode === "playing" && state && state.systemMenuOpen) {
      if (key === "arrowup" || key === "w" || key === "arrowleft" || key === "a") {
        event.preventDefault();
        moveSystemMenuSelection(-1);
        return;
      }
      if (key === "arrowdown" || key === "s" || key === "arrowright" || key === "d") {
        event.preventDefault();
        moveSystemMenuSelection(1);
        return;
      }
      if (key === " " || key === "enter") {
        event.preventDefault();
        activateSystemMenuSelection();
        return;
      }
      if (key === "m" || key === "escape") {
        event.preventDefault();
        state.systemMenuOpen = false;
        return;
      }
    }
    if (mode === "playing" && state && state.placingCamp) {
      if (key === "escape" || key === "m" || key === "tab") {
        event.preventDefault();
        state.placingCamp = false;
        state.campCursor = null;
        addLog("CANCELLED");
        return;
      }
    }
    const dir = getDirForKey(key);
    if (dir) {
      event.preventDefault();
      if (!input.keys.has(key)) {
        input.keys.add(key);
        tryMove(dir[0], dir[1]);
        startHeldMove(dir[0], dir[1]);
      }
      return;
    }
    if (key === " " && mode === "playing") {
      event.preventDefault();
      doAction();
    }
    if ((key === "i" || key === "tab") && mode === "playing") {
      event.preventDefault();
      toggleGameMenu();
      return;
    }
    if (key === "m" && mode === "playing") showMenu();
  });
  window.addEventListener("keyup", (event) => {
    input.keys.delete(event.key.toLowerCase());
    stopHeldMove();
  });
  canvas.addEventListener("click", handleCanvasClick);
  canvas.addEventListener("pointerdown", handleCanvasPointerDown);
  canvas.addEventListener("pointerup", handleCanvasPointerUp);
  canvas.addEventListener("pointercancel", handleCanvasPointerUp);
  canvas.addEventListener("pointerleave", handleCanvasPointerUp);

  const dirMap = {
    up: [0, -1],
    left: [-1, 0],
    right: [1, 0],
    down: [0, 1],
  };

  document.querySelectorAll("#dpad button").forEach((button) => {
    const setDir = () => {
      if (state && state.milestoneOverlay) return;
      const [x, y] = dirMap[button.dataset.dir];
      input.mobileX = x;
      input.mobileY = y;
      tryMove(x, y);
      startHeldMove(x, y);
    };
    const clearDir = () => {
      input.mobileX = 0;
      input.mobileY = 0;
      stopHeldMove();
    };
    button.addEventListener("pointerdown", setDir);
    button.addEventListener("pointerup", clearDir);
    button.addEventListener("pointerleave", clearDir);
  });

  function startHeldMove(x, y) {
    stopHeldMove();
    input.holdDir = [x, y];
    const repeat = () => {
      if (!input.holdDir) return;
      tryMove(input.holdDir[0], input.holdDir[1]);
      input.holdTimer = window.setTimeout(repeat, HOLD_MOVE_DELAY);
    };
    input.holdTimer = window.setTimeout(repeat, HOLD_MOVE_DELAY);
  }

  function stopHeldMove() {
    if (input.holdTimer) window.clearTimeout(input.holdTimer);
    input.holdTimer = null;
    input.holdDir = null;
  }

  document.getElementById("startButton").addEventListener("click", startNewGame);
  document.getElementById("loadButton").addEventListener("click", loadGame);
  document.getElementById("manualSaveButton").addEventListener("click", saveGame);
  document.getElementById("historyButton").addEventListener("click", showHistory);
  const statusButton = document.getElementById("statusButton");
  const menuButton = document.getElementById("menuButton");
  const actionButton = document.getElementById("actionButton");
  if (statusButton) statusButton.addEventListener("click", toggleGameMenu);
  if (menuButton) menuButton.addEventListener("click", showMenu);
  if (actionButton) {
    actionButton.addEventListener("click", () => {
      if (mode === "title" && !state) activateTitleSelection();
      else doAction();
    });
  }
  document.getElementById("closeOverlayButton").addEventListener("click", () => {
    mode = state ? "playing" : "title";
    hideOverlay();
  });
  document.getElementById("resetButton").addEventListener("click", resetSave);
  document.getElementById("debugWisdomButton").addEventListener("click", () => {
    if (!state) state = makeState();
    state.wisdom += 20;
    syncKnownMaterials();
    updateInventions();
    updateEvolution();
    revealVisibleTiles(state);
    addLog("DEBUG: 叡智 +20");
  });
  document.getElementById("debugFoodButton").addEventListener("click", () => {
    if (!state) state = makeState();
    migrateTurnState();
    state.tribe.fruit += 30;
    addLog("DEBUG: 果物 +30");
  });
  document.getElementById("debugDeathButton").addEventListener("click", () => {
    if (state) killPlayer("神の試練で倒れた", true);
  });

  function gameLoop(now) {
    draw();
    requestAnimationFrame(gameLoop);
  }

  resizeCanvas();
  hideOverlay();
  showPreviewFromQuery();
  requestAnimationFrame(gameLoop);
})();
