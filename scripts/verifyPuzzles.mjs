import { generateDailyPuzzle, validatePuzzle } from "../src/puzzleEngine.js";

const modes = ["standard", "kids", "expert", "timed"];
const limit = Number.parseInt(process.argv[2] || "5000", 10);
const failures = [];
const started = Date.now();

for (let id = 0; id < limit; id += 1) {
  for (const mode of modes) {
    try {
      const puzzle = generateDailyPuzzle({ id, mode });
      const result = validatePuzzle(puzzle);
      if (!result.ok) failures.push({ id, mode, errors: result.errors });
    } catch (error) {
      failures.push({ id, mode, errors: [error.message] });
    }
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify(failures.slice(0, 10), null, 2));
  console.error(`Failed ${failures.length} puzzle builds.`);
  process.exit(1);
}

const elapsed = ((Date.now() - started) / 1000).toFixed(2);
console.log(`Validated ${limit.toLocaleString()} daily IDs across ${modes.length} modes (${(limit * modes.length).toLocaleString()} puzzles) in ${elapsed}s.`);
