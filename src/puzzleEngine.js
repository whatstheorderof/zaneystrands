import { BONUS_WORDS, STORY_TEMPLATES } from "./data/storySeeds.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ADJACENT = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1]
];

export function normalizeWord(word) {
  return word.toUpperCase().replace(/[^A-Z]/g, "");
}

export function displayWord(word) {
  return word
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function todayPuzzleId(date = new Date()) {
  const start = Date.UTC(2026, 0, 1);
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(0, Math.floor((current - start) / 86400000));
}

export function generateDailyPuzzle({ id = todayPuzzleId(), mode = "standard" } = {}) {
  const template = STORY_TEMPLATES[id % STORY_TEMPLATES.length];
  return generatePuzzleFromTemplate(template, {
    id,
    mode,
    seed: hashString(`${template.slug}:${mode}:${id}`)
  });
}

export function generatePuzzleFromInput({ title, theme, clue, spangram, words, goldenWord, size = 10 }) {
  const cleanWords = words.map(normalizeWord).filter((word) => word.length >= 3);
  const cleanSpangram = ensureMinimumSpangram(normalizeWord(spangram || cleanWords[0] || "STORYPATH"));
  const template = {
    slug: `custom-${hashString(`${title}:${cleanWords.join("-")}`)}`,
    title: title || "Custom Story",
    theme: theme || "Generated Puzzle",
    clue: clue || "Follow the trail to reveal the story.",
    spangram: cleanSpangram,
    words: cleanWords,
    kidsWords: cleanWords.slice(0, 5),
    expertWords: cleanWords,
    goldenWord: normalizeWord(goldenWord || cleanWords[cleanWords.length - 1] || cleanWords[0] || ""),
    narrative: [
      "The first discovery changes the scene.",
      "A second clue points deeper into the story.",
      "The hidden trail begins to make sense.",
      "The final word unlocks the ending."
    ],
    ending: "The story clicks into place.",
    badge: "Story Maker"
  };

  return generatePuzzleFromTemplate(template, {
    id: hashString(`${title}:${theme}:${Date.now()}`),
    mode: "generator",
    seed: hashString(`${template.slug}:${size}:${cleanWords.join("")}`),
    requestedSize: size
  });
}

export function generatePuzzleFromTemplate(template, options = {}) {
  const mode = options.mode || "standard";
  const wordList = getWordsForMode(template, mode);
  const spangram = normalizeWord(template.spangram);
  const targetSize = options.requestedSize || sizeForMode(mode, wordList, spangram);
  const baseSeed = options.seed || hashString(`${template.slug}:${mode}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const random = mulberry32(baseSeed + attempt * 101);
    const puzzle = tryBuildPuzzle({
      template,
      mode,
      id: options.id ?? baseSeed,
      size: Math.min(12, Math.min(spangram.length, targetSize + Math.floor(attempt / 22))),
      words: wordList,
      spangram,
      random,
      seed: baseSeed + attempt * 101
    });

    if (puzzle && validatePuzzle(puzzle).ok) {
      return puzzle;
    }
  }

  throw new Error(`Could not generate a valid puzzle for ${template.title}`);
}

function getWordsForMode(template, mode) {
  const source =
    mode === "kids"
      ? template.kidsWords
      : mode === "expert"
        ? template.expertWords
        : mode === "timed"
          ? template.words.slice(0, 5)
          : template.words;

  return [...new Set(source.map(normalizeWord))]
    .filter((word) => word.length >= 3)
    .sort((a, b) => b.length - a.length);
}

function sizeForMode(mode, words, spangram) {
  const totalLetters = words.join("").length + spangram.length;
  const minimum = Math.max(8, Math.ceil(Math.sqrt(totalLetters + 2)));
  const preferred = mode === "kids" ? 8 : mode === "expert" ? 11 : mode === "timed" ? 9 : 10;
  return Math.min(12, spangram.length, Math.max(minimum, preferred));
}

function tryBuildPuzzle({ template, mode, id, size, words, spangram, random, seed }) {
  const grid = Array.from({ length: size }, () => Array(size).fill(""));
  const entries = [];
  const totalLetters = words.join("").length + spangram.length;
  if (totalLetters > size * size || spangram.length < size) return null;

  const cells = buildTemplatePath(size, random);
  let cursor = 0;
  const spangramPath = cells.slice(cursor, cursor + spangram.length);
  cursor += spangram.length;

  writeWord(grid, spangram, spangramPath);
  entries.push(makeEntry(spangram, spangramPath, "spangram", template));

  for (const word of words) {
    const path = cells.slice(cursor, cursor + word.length);
    cursor += word.length;
    if (path.length !== word.length) return null;
    writeWord(grid, word, path);
    entries.push(makeEntry(word, path, "answer", template));
  }

  fillGrid(grid, random);

  const answerWords = entries.filter((entry) => entry.kind === "answer");
  const estimatedSolveTime = Math.round((answerWords.length * size * (mode === "expert" ? 28 : 20)) / 60);

  return {
    id,
    seed,
    size,
    mode,
    slug: template.slug,
    title: template.title,
    theme: template.theme,
    clue: template.clue,
    narrative: template.narrative,
    ending: template.ending,
    badge: template.badge,
    goldenWord: normalizeWord(template.goldenWord),
    estimatedSolveTime,
    completionRate: mode === "expert" ? 0.54 : mode === "kids" ? 0.92 : 0.74,
    averageHintUsage: mode === "expert" ? 3.2 : mode === "kids" ? 0.8 : 1.7,
    bonusWords: BONUS_WORDS.filter((word) => !answerWords.some((entry) => entry.word === word)).slice(0, 8),
    grid: grid.map((row) => row.join("")),
    entries
  };
}

function ensureMinimumSpangram(word) {
  let result = word || "STORYPATH";
  while (result.length < 8) result += "PATH";
  return result;
}

function buildTemplatePath(size, random) {
  const horizontal = random() > 0.5;
  const reverse = random() > 0.5;
  const cells = [];

  for (let major = 0; major < size; major += 1) {
    const forward = major % 2 === 0;
    for (let minorIndex = 0; minorIndex < size; minorIndex += 1) {
      const minor = forward ? minorIndex : size - 1 - minorIndex;
      cells.push(horizontal ? [major, minor] : [minor, major]);
    }
  }

  return reverse ? cells.reverse() : cells;
}

function makeEntry(word, path, kind, template) {
  return {
    word,
    label: displayWord(word),
    kind,
    path,
    golden: kind === "answer" && word === normalizeWord(template.goldenWord)
  };
}

function findPath({ grid, word, random, edgeMode }) {
  const size = grid.length;
  const starts = shuffledCells(size, random).filter(([row, col]) => {
    if (edgeMode === "vertical") return row === 0;
    if (edgeMode === "horizontal") return col === 0;
    return true;
  });

  for (const start of starts) {
    const path = searchPath(grid, word, start, random, edgeMode);
    if (path) return path;
  }
  return null;
}

function searchPath(grid, word, start, random, edgeMode) {
  const size = grid.length;
  const path = [];
  const used = new Set();

  function walk(row, col, index) {
    const key = cellKey(row, col);
    if (!canWrite(grid, row, col, word[index]) || used.has(key)) return false;

    path.push([row, col]);
    used.add(key);

    if (index === word.length - 1) {
      const touchesOpposite =
        edgeMode === "free" ||
        (edgeMode === "vertical" && row === size - 1) ||
        (edgeMode === "horizontal" && col === size - 1);
      if (touchesOpposite) return true;
    } else {
      const nextCells = shuffledNeighbors(row, col, size, random).sort((a, b) => {
        return edgeDistanceScore(a, edgeMode, size, word.length - index) - edgeDistanceScore(b, edgeMode, size, word.length - index);
      });

      for (const [nextRow, nextCol] of nextCells) {
        if (walk(nextRow, nextCol, index + 1)) return true;
      }
    }

    path.pop();
    used.delete(key);
    return false;
  }

  return walk(start[0], start[1], 0) ? [...path] : null;
}

function edgeDistanceScore([row, col], edgeMode, size, remaining) {
  if (edgeMode === "vertical") return Math.abs(size - 1 - row - remaining / 2);
  if (edgeMode === "horizontal") return Math.abs(size - 1 - col - remaining / 2);
  return 0;
}

function shuffledCells(size, random) {
  const cells = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) cells.push([row, col]);
  }
  return shuffle(cells, random);
}

function shuffledNeighbors(row, col, size, random) {
  return shuffle(
    ADJACENT.map(([rowDelta, colDelta]) => [row + rowDelta, col + colDelta]).filter(
      ([nextRow, nextCol]) => nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size
    ),
    random
  );
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function canWrite(grid, row, col, letter) {
  return grid[row][col] === "" || grid[row][col] === letter;
}

function writeWord(grid, word, path) {
  path.forEach(([row, col], index) => {
    grid[row][col] = word[index];
  });
}

function fillGrid(grid, random) {
  const weighted = "EEEEAAAARRRIIIOOOTTNNSSLLCCUUDDPPMMHHGGYYBBFFVVKKWWXZJQ";
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid.length; col += 1) {
      if (!grid[row][col]) {
        grid[row][col] = weighted[Math.floor(random() * weighted.length)] || ALPHABET[Math.floor(random() * ALPHABET.length)];
      }
    }
  }
}

export function validatePuzzle(puzzle) {
  const errors = [];
  const size = puzzle.grid.length;

  if (size < 8 || size > 12) errors.push("Grid size must be between 8 and 12.");
  if (!puzzle.entries.some((entry) => entry.kind === "spangram")) errors.push("Puzzle needs a spangram.");

  for (const entry of puzzle.entries) {
    if (!entry.path || entry.path.length !== entry.word.length) {
      errors.push(`${entry.word} path length does not match word length.`);
      continue;
    }

    const letters = entry.path.map(([row, col]) => puzzle.grid[row]?.[col]).join("");
    if (letters !== entry.word) errors.push(`${entry.word} path spells ${letters}.`);

    for (let index = 1; index < entry.path.length; index += 1) {
      const [row, col] = entry.path[index - 1];
      const [nextRow, nextCol] = entry.path[index];
      if (Math.max(Math.abs(row - nextRow), Math.abs(col - nextCol)) !== 1) {
        errors.push(`${entry.word} has a non-adjacent step.`);
      }
    }

    if (entry.kind === "spangram" && !connectsOppositeEdges(entry.path, size)) {
      errors.push(`${entry.word} spangram does not connect opposite edges.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function connectsOppositeEdges(path, size) {
  const rows = path.map(([row]) => row);
  const cols = path.map(([, col]) => col);
  return (rows.includes(0) && rows.includes(size - 1)) || (cols.includes(0) && cols.includes(size - 1));
}

function cellKey(row, col) {
  return `${row}:${col}`;
}

export function pathKey(path) {
  return path.map(([row, col]) => cellKey(row, col)).join("|");
}

export function pathToWord(grid, path) {
  return path.map(([row, col]) => grid[row]?.[col] || "").join("");
}

export function isSamePath(a, b) {
  if (a.length !== b.length) return false;
  const forward = a.every(([row, col], index) => row === b[index][0] && col === b[index][1]);
  const reverse = a.every(([row, col], index) => {
    const other = b[b.length - 1 - index];
    return row === other[0] && col === other[1];
  });
  return forward || reverse;
}
