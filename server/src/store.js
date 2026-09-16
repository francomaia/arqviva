/* Persistência em arquivo. Eventos em JSONL, estado em JSON. */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./config.js";

const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl");
const STATE_FILE = path.join(DATA_DIR, "state.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

/* Fila para não intercalar escritas concorrentes no mesmo arquivo. */
let writeChain = Promise.resolve();
function serialize(task) {
  const next = writeChain.then(task, task);
  writeChain = next.catch(() => {});
  return next;
}

async function writeAtomic(file, contents) {
  const tmp = file + "." + process.pid + ".tmp";
  await fsp.writeFile(tmp, contents, "utf8");
  await fsp.rename(tmp, file);
}

/* ---------- Eventos ---------- */

export function appendEvent(event) {
  const record = { received_at: new Date().toISOString(), ...event };
  return serialize(async () => {
    await fsp.appendFile(EVENTS_FILE, JSON.stringify(record) + "\n", "utf8");
    return record;
  });
}

export async function readEvents({ limit = 200, type = "" } = {}) {
  let raw;
  try {
    raw = await fsp.readFile(EVENTS_FILE, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const events = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (type && parsed.type !== type) continue;
      events.push(parsed);
    } catch {
      /* linha corrompida é ignorada em vez de derrubar o painel */
    }
  }
  return events.slice(-limit).reverse();
}

export async function countEventsByType({ since } = {}) {
  const all = await readEvents({ limit: Number.MAX_SAFE_INTEGER });
  const counts = {};
  for (const event of all) {
    if (since && new Date(event.received_at) < since) continue;
    counts[event.type] = (counts[event.type] || 0) + 1;
  }
  return counts;
}

/* ---------- Estado ---------- */

const DEFAULT_STATE = { queue: [], lastMessageByPhone: {}, optOut: [], recovered: [], abandoned: {} };

export async function readState() {
  try {
    const parsed = JSON.parse(await fsp.readFile(STATE_FILE, "utf8"));
    return { ...DEFAULT_STATE, ...parsed };
  } catch (error) {
    if (error.code === "ENOENT") return { ...DEFAULT_STATE };
    console.error("[store] state.json ilegível, recomeçando do zero:", error.message);
    return { ...DEFAULT_STATE };
  }
}

/* Lê, aplica a mutação e grava, tudo dentro da mesma fila. */
export function updateState(mutator) {
  return serialize(async () => {
    const state = await readState();
    const result = await mutator(state);
    await writeAtomic(STATE_FILE, JSON.stringify(state, null, 2));
    return result;
  });
}
