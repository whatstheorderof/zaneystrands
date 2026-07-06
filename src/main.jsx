import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  displayWord,
  generateDailyPuzzle,
  generatePuzzleFromInput,
  isSamePath,
  normalizeWord,
  pathKey,
  pathToWord,
  todayPuzzleId,
  validatePuzzle
} from "./puzzleEngine.js";
import "./styles.css";

const MODES = [
  { id: "standard", label: "Standard" },
  { id: "kids", label: "Kids" },
  { id: "expert", label: "Expert" },
  { id: "timed", label: "Timed" }
];

const STORAGE_KEY = "zaney-strands-profile";

function App() {
  const [route, setRoute] = useState(() => (window.location.hash === "#generator" ? "generator" : "play"));

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash === "#generator" ? "generator" : "play");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <main className="app-shell">
      <TopBar route={route} setRoute={setRoute} />
      {route === "generator" ? <GeneratorPage /> : <PlayPage />}
    </main>
  );
}

function TopBar({ route, setRoute }) {
  const go = (nextRoute) => {
    window.location.hash = nextRoute === "generator" ? "generator" : "";
    setRoute(nextRoute);
  };

  return (
    <header className="top-bar">
      <button className="brand-lockup" type="button" onClick={() => go("play")} aria-label="Open daily puzzle">
        <span className="brand-mark">ZS</span>
        <span>
          <strong>Zaney Strands</strong>
          <small>Find the hidden story.</small>
        </span>
      </button>
      <nav className="top-actions" aria-label="Main">
        <button className={route === "play" ? "active nav-button" : "nav-button"} type="button" onClick={() => go("play")}>
          Daily
        </button>
        <button
          className={route === "generator" ? "active nav-button" : "nav-button"}
          type="button"
          onClick={() => go("generator")}
        >
          Generator
        </button>
      </nav>
    </header>
  );
}

function PlayPage() {
  const [mode, setMode] = useState("standard");
  const [dailyOffset, setDailyOffset] = useState(0);
  const [foundKeys, setFoundKeys] = useState([]);
  const [bonusFound, setBonusFound] = useState([]);
  const [selectedPath, setSelectedPath] = useState([]);
  const [message, setMessage] = useState("Trace connected letters to reveal the story.");
  const [hintedWord, setHintedWord] = useState("");
  const [startedAt, setStartedAt] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [profile, setProfile] = useLocalProfile();

  const puzzle = useMemo(
    () => generateDailyPuzzle({ id: todayPuzzleId() + dailyOffset, mode }),
    [dailyOffset, mode]
  );

  const answerEntries = puzzle.entries.filter((entry) => entry.kind === "answer");
  const spangram = puzzle.entries.find((entry) => entry.kind === "spangram");
  const foundEntries = answerEntries.filter((entry) => foundKeys.includes(pathKey(entry.path)));
  const allFound = foundEntries.length === answerEntries.length && foundKeys.includes(pathKey(spangram.path));
  const meter = Math.round(((foundEntries.length + (foundKeys.includes(pathKey(spangram.path)) ? 1 : 0)) / puzzle.entries.length) * 100);
  const nextEntry = answerEntries.find((entry) => !foundKeys.includes(pathKey(entry.path)));

  useEffect(() => {
    setFoundKeys([]);
    setBonusFound([]);
    setSelectedPath([]);
    setMessage("Trace connected letters to reveal the story.");
    setHintedWord("");
    setStartedAt(Date.now());
    setElapsed(0);
  }, [puzzle.seed]);

  useEffect(() => {
    if (mode !== "timed" || allFound) return undefined;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [mode, startedAt, allFound]);

  useEffect(() => {
    if (!allFound) return;
    const perfect = bonusFound.length === 0 && hintedWord === "";
    const xp = 40 + (perfect ? 25 : 0) + (foundEntries.some((entry) => entry.golden) ? 15 : 0);
    setProfile((current) => {
      const badgeSet = new Set(current.badges);
      badgeSet.add(puzzle.badge);
      if (perfect) badgeSet.add("Perfect Run");
      return {
        xp: current.xp + xp,
        streak: current.lastSolved === puzzle.id ? current.streak : current.streak + 1,
        lastSolved: puzzle.id,
        badges: [...badgeSet].slice(-8)
      };
    });
    setMessage(`${puzzle.ending} Badge unlocked: ${puzzle.badge}.`);
  }, [allFound]);

  const submitPath = (path) => {
    if (path.length < 3) return;
    const selectedWord = pathToWord(puzzle.grid, path);
    const reversedWord = selectedWord.split("").reverse().join("");
    const matchedEntry = puzzle.entries.find((entry) => isSamePath(entry.path, path));

    if (matchedEntry) {
      const key = pathKey(matchedEntry.path);
      if (!foundKeys.includes(key)) {
        setFoundKeys((keys) => [...keys, key]);
        setMessage(
          matchedEntry.kind === "spangram"
            ? `Spangram found: ${displayWord(matchedEntry.word)}.`
            : `${matchedEntry.label} added to the story.`
        );
      }
      return;
    }

    const bonus = puzzle.bonusWords.find((word) => word === selectedWord || word === reversedWord);
    if (bonus && !bonusFound.includes(bonus)) {
      setBonusFound((words) => [...words, bonus]);
      setMessage(`Bonus word found: ${displayWord(bonus)}.`);
      return;
    }

    setMessage(`${selectedWord} is not part of this story.`);
  };

  const requestHint = () => {
    const target = nextEntry || spangram;
    if (!target) return;
    setHintedWord(target.word);
    const [row, col] = target.path[0];
    setMessage(`Hint: ${target.label} starts near row ${row + 1}, column ${col + 1}.`);
  };

  const share = async () => {
    const text = `Zaney Strands #${puzzle.id} - ${puzzle.title}\n${meter}% discovered in ${mode} mode\n${foundEntries.length}/${answerEntries.length} story words found`;
    if (navigator.share) {
      await navigator.share({ title: "Zaney Strands", text, url: window.location.href });
    } else {
      await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
      setMessage("Share result copied.");
    }
  };

  return (
    <section className="game-layout">
      <aside className="side-rail">
        <section className="mode-panel panel">
          <p className="section-label">Daily puzzle</p>
          <h1>{puzzle.title}</h1>
          <p className="clue-text">{puzzle.clue}</p>
          <div className="segmented-control" role="tablist" aria-label="Puzzle mode">
            {MODES.map((item) => (
              <button
                key={item.id}
                className={mode === item.id ? "selected" : ""}
                type="button"
                onClick={() => setMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mini-stats">
            <span>{puzzle.size}x{puzzle.size}</span>
            <span>{puzzle.estimatedSolveTime} min</span>
            <span>{Math.round(puzzle.completionRate * 100)}% finish</span>
          </div>
        </section>

        <section className="panel profile-panel">
          <p className="section-label">Profile</p>
          <div className="profile-row">
            <strong>{profile.xp} XP</strong>
            <span>{profile.streak} day streak</span>
          </div>
          <div className="badge-list" aria-label="Unlocked badges">
            {profile.badges.length ? profile.badges.map((badge) => <span key={badge}>{badge}</span>) : <span>First badge awaits</span>}
          </div>
        </section>

        <section className="panel compact-panel">
          <p className="section-label">Zaney Twist</p>
          <strong>{puzzle.goldenWord ? displayWord(puzzle.goldenWord) : "Golden Word"}</strong>
          <span className="muted-copy">Find the golden word before using a hint for a perfect-run badge.</span>
        </section>
      </aside>

      <section className="board-stage" aria-label="Puzzle board">
        <div className="board-toolbar">
          <div>
            <p className="section-label">Theme</p>
            <h2>{puzzle.theme}</h2>
          </div>
          <div className="toolbar-actions">
            {mode === "timed" && <span className="timer">{formatTime(elapsed)}</span>}
            <button type="button" onClick={requestHint} aria-label="Get hint">
              Hint
            </button>
            <button type="button" onClick={share} aria-label="Share result">
              Share
            </button>
          </div>
        </div>
        <WordBoard
          puzzle={puzzle}
          foundKeys={foundKeys}
          selectedPath={selectedPath}
          setSelectedPath={setSelectedPath}
          submitPath={submitPath}
          hintedWord={hintedWord}
        />
        <div className="message-strip">{message}</div>
        <div className="ad-reserve" aria-label="Reserved sponsor space">
          Future sponsor space
        </div>
      </section>

      <StoryPanel
        puzzle={puzzle}
        foundKeys={foundKeys}
        foundEntries={foundEntries}
        bonusFound={bonusFound}
        meter={meter}
        allFound={allFound}
        nextEntry={nextEntry}
      />

      <div className={allFound ? "ending-modal open" : "ending-modal"} aria-hidden={!allFound}>
        <div className="ending-card">
          <div className="reward-art" />
          <p className="section-label">Ending reward</p>
          <h2>{puzzle.ending}</h2>
          <p>You unlocked the {puzzle.badge} badge and completed today's hidden story.</p>
          <button type="button" onClick={share}>Share this run</button>
        </div>
      </div>
    </section>
  );
}

function WordBoard({ puzzle, foundKeys, selectedPath, setSelectedPath, submitPath, hintedWord }) {
  const boardRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const foundCells = useMemo(() => {
    const map = new Map();
    puzzle.entries.forEach((entry) => {
      if (foundKeys.includes(pathKey(entry.path))) {
        entry.path.forEach(([row, col]) => map.set(`${row}:${col}`, entry.kind));
      }
    });
    return map;
  }, [foundKeys, puzzle.entries]);

  const hintedCells = useMemo(() => {
    const entry = puzzle.entries.find((candidate) => candidate.word === hintedWord);
    return new Set(entry ? entry.path.slice(0, 2).map(([row, col]) => `${row}:${col}`) : []);
  }, [hintedWord, puzzle.entries]);

  const selectCell = (row, col) => {
    setSelectedPath((path) => {
      const key = `${row}:${col}`;
      const existingIndex = path.findIndex(([pathRow, pathCol]) => `${pathRow}:${pathCol}` === key);
      if (existingIndex >= 0) return path.slice(0, existingIndex + 1);
      const last = path[path.length - 1];
      if (last && Math.max(Math.abs(last[0] - row), Math.abs(last[1] - col)) !== 1) return path;
      return [...path, [row, col]];
    });
  };

  const finish = () => {
    if (!dragging) return;
    submitPath(selectedPath);
    setSelectedPath([]);
    setDragging(false);
  };

  const onPointerMove = (event) => {
    if (!dragging) return;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const cell = element?.closest?.("[data-cell]");
    if (!cell || !boardRef.current?.contains(cell)) return;
    selectCell(Number(cell.dataset.row), Number(cell.dataset.col));
  };

  const selectedKeys = new Set(selectedPath.map(([row, col]) => `${row}:${col}`));

  return (
    <div
      className="word-board"
      ref={boardRef}
      style={{ "--board-size": puzzle.size }}
      onPointerUp={finish}
      onPointerLeave={finish}
      onPointerMove={onPointerMove}
    >
      {puzzle.grid.map((row, rowIndex) =>
        row.split("").map((letter, colIndex) => {
          const key = `${rowIndex}:${colIndex}`;
          const foundKind = foundCells.get(key);
          const className = [
            "letter-cell",
            selectedKeys.has(key) ? "selected" : "",
            foundKind === "spangram" ? "spangram-cell" : "",
            foundKind === "answer" ? "found-cell" : "",
            hintedCells.has(key) ? "hint-cell" : ""
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              className={className}
              data-cell
              data-row={rowIndex}
              data-col={colIndex}
              key={key}
              type="button"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(true);
                setSelectedPath([[rowIndex, colIndex]]);
              }}
              onPointerEnter={() => dragging && selectCell(rowIndex, colIndex)}
            >
              {letter}
            </button>
          );
        })
      )}
      <svg className="path-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={pointsForPath(selectedPath, puzzle.size)} />
      </svg>
    </div>
  );
}

function StoryPanel({ puzzle, foundKeys, foundEntries, bonusFound, meter, allFound, nextEntry }) {
  const spangram = puzzle.entries.find((entry) => entry.kind === "spangram");
  const spangramFound = foundKeys.includes(pathKey(spangram.path));

  return (
    <aside className="story-panel panel">
      <div className="story-art">
        <div className="sun-disc" />
        <div className="wave-line" />
        <div className="castle-shape" />
      </div>
      <p className="section-label">Discovery meter</p>
      <div className="meter-heading">
        <h2>{puzzle.theme}</h2>
        <strong>{meter}%</strong>
      </div>
      <div className="meter-track">
        <span style={{ width: `${meter}%` }} />
      </div>
      <div className="found-list">
        {puzzle.entries
          .filter((entry) => entry.kind === "answer")
          .map((entry, index) => {
            const found = foundEntries.some((foundEntry) => foundEntry.word === entry.word);
            return (
              <div className={found ? "found-item complete" : "found-item"} key={entry.word}>
                <span>{found ? entry.label : index === foundEntries.length ? "?????" : "Hidden"}</span>
                {entry.golden && <i>Golden</i>}
              </div>
            );
          })}
        <div className={spangramFound ? "found-item complete spangram-row" : "found-item spangram-row"}>
          <span>{spangramFound ? displayWord(spangram.word) : "Spangram"}</span>
          <i>Edge to edge</i>
        </div>
      </div>

      <div className="narrative-box">
        <p>{puzzle.narrative[Math.min(foundEntries.length, puzzle.narrative.length - 1)]}</p>
        <span>Next discovery: {nextEntry ? "?????" : allFound ? "Ending unlocked" : "Spangram"}</span>
      </div>

      <div className="reward-row">
        <div>
          <p className="section-label">Collectibles</p>
          <strong>{puzzle.badge}</strong>
          <span className="muted-copy">{bonusFound.length} bonus words found</span>
        </div>
        <div className="perfect-badge">Perfect</div>
      </div>
    </aside>
  );
}

function GeneratorPage() {
  const [form, setForm] = useState({
    title: "Cloud Kitchen",
    theme: "Dinner in the sky",
    clue: "A tiny restaurant floats above the block.",
    spangram: "SKYTABLE",
    words: "APRON, MENU, NOODLES, TEACUP, CHOPSTICKS, DUMPLING",
    goldenWord: "DUMPLING",
    size: 10
  });
  const [generated, setGenerated] = useState(() => {
    const puzzle = generatePuzzleFromInput({
      ...form,
      words: form.words.split(",")
    });
    return { puzzle, validation: validatePuzzle(puzzle) };
  });
  const [bulkResult, setBulkResult] = useState("");

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const generate = () => {
    const puzzle = generatePuzzleFromInput({
      ...form,
      size: Number(form.size),
      words: form.words.split(",")
    });
    setGenerated({ puzzle, validation: validatePuzzle(puzzle) });
  };

  const verifyMany = () => {
    const modes = ["standard", "kids", "expert", "timed"];
    let checked = 0;
    for (let id = 0; id < 5000; id += 1) {
      for (const mode of modes) {
        const puzzle = generateDailyPuzzle({ id, mode });
        const result = validatePuzzle(puzzle);
        if (!result.ok) {
          setBulkResult(`Stopped at puzzle ${id} (${mode}): ${result.errors.join(" ")}`);
          return;
        }
        checked += 1;
      }
    }
    setBulkResult(`Validated ${checked.toLocaleString()} generated puzzles with explicit word paths.`);
  };

  return (
    <section className="generator-layout">
      <div className="generator-copy">
        <p className="section-label">Puzzle workshop</p>
        <h1>Build a story puzzle that can prove it is finishable.</h1>
        <p>
          Every answer is placed as an adjacent path before the grid is filled. The validator checks spelling,
          adjacency, edge-to-edge spangram rules, and grid size.
        </p>
      </div>
      <form className="generator-form panel" onSubmit={(event) => event.preventDefault()}>
        <label>
          Title
          <input value={form.title} onChange={(event) => update("title", event.target.value)} />
        </label>
        <label>
          Theme
          <input value={form.theme} onChange={(event) => update("theme", event.target.value)} />
        </label>
        <label>
          Theme clue
          <input value={form.clue} onChange={(event) => update("clue", event.target.value)} />
        </label>
        <label>
          Spangram
          <input value={form.spangram} onChange={(event) => update("spangram", event.target.value)} />
        </label>
        <label>
          Story words
          <textarea value={form.words} onChange={(event) => update("words", event.target.value)} rows={4} />
        </label>
        <div className="form-grid">
          <label>
            Golden word
            <input value={form.goldenWord} onChange={(event) => update("goldenWord", event.target.value)} />
          </label>
          <label>
            Grid size
            <input
              min="8"
              max="12"
              type="number"
              value={form.size}
              onChange={(event) => update("size", event.target.value)}
            />
          </label>
        </div>
        <div className="form-actions">
          <button type="button" onClick={generate}>Generate validated puzzle</button>
          <button type="button" className="secondary" onClick={verifyMany}>Verify 5,000 daily IDs</button>
        </div>
        {bulkResult && <p className="validation-note">{bulkResult}</p>}
      </form>

      <div className="generator-preview panel">
        <div className="preview-board" style={{ "--board-size": generated.puzzle.size }}>
          {generated.puzzle.grid.map((row, rowIndex) =>
            row.split("").map((letter, colIndex) => <span key={`${rowIndex}:${colIndex}`}>{letter}</span>)
          )}
        </div>
        <div>
          <p className="section-label">Validation</p>
          <h2>{generated.validation.ok ? "Ready to publish" : "Needs work"}</h2>
          <p>{generated.validation.ok ? "All paths are adjacent, spelled correctly, and completable." : generated.validation.errors.join(" ")}</p>
          <pre>{JSON.stringify(compactPuzzle(generated.puzzle), null, 2)}</pre>
        </div>
      </div>
    </section>
  );
}

function compactPuzzle(puzzle) {
  return {
    title: puzzle.title,
    theme: puzzle.theme,
    size: puzzle.size,
    spangram: puzzle.entries.find((entry) => entry.kind === "spangram")?.word,
    words: puzzle.entries.filter((entry) => entry.kind === "answer").map((entry) => entry.word),
    goldenWord: normalizeWord(puzzle.goldenWord),
    validation: validatePuzzle(puzzle)
  };
}

function useLocalProfile() {
  const [profile, setProfileState] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || { xp: 0, streak: 0, lastSolved: null, badges: [] };
    } catch {
      return { xp: 0, streak: 0, lastSolved: null, badges: [] };
    }
  });

  const setProfile = (updater) => {
    setProfileState((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return [profile, setProfile];
}

function pointsForPath(path, size) {
  if (path.length === 0) return "";
  return path
    .map(([row, col]) => {
      const step = 100 / size;
      return `${col * step + step / 2},${row * step + step / 2}`;
    })
    .join(" ");
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

createRoot(document.getElementById("root")).render(<App />);
