import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../voxel-garden.html", import.meta.url), "utf8");
const modelScript = html.match(/<script id="garden-model">([\s\S]*?)<\/script>/)?.[1];
const storageScript = html.match(/<script id="garden-storage">([\s\S]*?)<\/script>/)?.[1];

function api() {
  const context = { window: {}, console };
  vm.runInNewContext(modelScript, context, { filename: "garden-model" });
  vm.runInNewContext(storageScript, context, { filename: "garden-storage" });
  return { M: context.window.GardenModel, S: context.window.GardenStorage };
}

class FakeStorage {
  constructor(entries = {}) { this.entries = new Map(Object.entries(entries)); this.failGet = false; this.failSet = false; }
  getItem(key) { if (this.failGet) throw new Error("read failed"); return this.entries.has(key) ? this.entries.get(key) : null; }
  setItem(key, value) { if (this.failSet) throw new Error("quota exceeded"); this.entries.set(key, String(value)); }
}

test("migrates legacy storage once and leaves the original bytes unchanged", () => {
  const { M, S } = api();
  const legacy = {
    version: 2,
    season: "autumn",
    weather: "rain",
    sound: true,
    elapsed: 987.25,
    nextId: 44,
    userBlocks: [
      { id: 7, type: "soil", x: 2, y: 0, z: 3 },
      { id: 8, type: "roof", x: 2, y: 2, z: 3 },
    ],
    templates: [{ id: 19, type: "raisedBed", x: 8, y: 0, z: -6, rotation: 1 }],
    plants: [{
      id: 31, species: "tomato", x: 8, y: 1, z: -6, stage: 6,
      progress: 152.25, moisture: 0.75, pollinated: true,
    }],
  };
  const legacyRaw = JSON.stringify(legacy);
  const storage = new FakeStorage({ "moss-marrow-3d-v2": legacyRaw });
  const result = S.readLibrary(storage, { now: 100, idFactory: () => "garden-legacy" });

  assert.equal(result.status, "loaded");
  assert.equal(result.migrated, true);
  assert.equal(storage.getItem("moss-marrow-3d-v2"), legacyRaw);
  assert.equal(result.library.activeGardenId, "garden-legacy");
  assert.equal(result.library.gardens[0].name, "My Garden");
  assert.equal(result.library.gardens[0].state.layoutId, "legacy");
  assert.equal(result.library.gardens[0].state.nextId, legacy.nextId);
  assert.deepEqual(JSON.parse(JSON.stringify(result.library.gardens[0].state.userBlocks)), legacy.userBlocks);
  assert.deepEqual(JSON.parse(JSON.stringify(result.library.gardens[0].state.plants)), legacy.plants);
  const second = S.readLibrary(storage, { now: 101, idFactory: () => "garden-duplicate" });
  assert.equal(second.status, "loaded");
  assert.equal(second.migrated, false);
  assert.equal(second.library.gardens.length, 1);
  assert.equal(second.library.gardens[0].id, "garden-legacy");
});

test("failed create keeps the current library and dirty state available for retry", () => {
  const { M, S } = api();
  const storage = new FakeStorage();
  const initial = S.createGarden(storage, S.readLibrary(storage).library, {
    presetId: "empty", name: "Home", state: M.createPresetState("empty"), now: 1, idFactory: () => "g-1",
  });
  const current = initial.library;
  const dirty = M.createPresetState("empty");
  dirty.elapsed = 12;
  storage.failSet = true;
  const failed = S.createGarden(storage, current, {
    presetId: "meadow", name: "Wild", state: M.createPresetState("meadow"), latestState: dirty,
    now: 2, idFactory: () => "g-2", expectedRaw: initial.raw,
  });

  assert.equal(failed.status, "unavailable");
  assert.equal(failed.library, current);
  assert.equal(failed.candidate.gardens.length, 2);
  assert.equal(failed.candidate.gardens[0].state.elapsed, 12);
  storage.failSet = false;
  const retry = S.writeLibrary(storage, failed.candidate, failed.expectedRaw);
  assert.equal(retry.status, "saved");
  assert.equal(S.readLibrary(storage).library.gardens.length, 2);
});

test("switch retries do not duplicate gardens and stale external writes are blocked", () => {
  const { M, S } = api();
  const storage = new FakeStorage();
  const first = S.createGarden(storage, S.readLibrary(storage).library, {
    presetId: "empty", name: "Empty", state: M.createPresetState("empty"),
    now: 1, idFactory: () => "g-1",
  });
  const created = S.createGarden(storage, first.library, {
    presetId: "cottage", name: "Cottage", state: M.createPresetState("cottage"),
    now: 2, idFactory: () => "g-2", expectedRaw: first.raw,
  });
  const library = created.library;
  const raw = storage.getItem(S.STORAGE_KEY);
  const switched = S.switchGarden(storage, library, "g-1", M.createPresetState("empty"), raw);
  assert.equal(switched.status, "saved");
  assert.equal(switched.library.gardens.length, 2);

  storage.setItem(S.STORAGE_KEY, JSON.stringify({ ...switched.library, activeGardenId: "g-2" }));
  const stale = S.writeLibrary(storage, switched.library, raw);
  assert.equal(stale.status, "stale");
  assert.equal(S.readLibrary(storage).library.gardens.length, 2);
});

test("corrupt or future libraries are recovery errors, never starter replacements", () => {
  const { S } = api();
  const corrupt = new FakeStorage({ [S.STORAGE_KEY]: "{not json" });
  assert.equal(S.readLibrary(corrupt).status, "invalid");
  assert.equal(corrupt.getItem(S.STORAGE_KEY), "{not json");

  const future = new FakeStorage({ [S.STORAGE_KEY]: JSON.stringify({ version: 99 }) });
  assert.equal(S.readLibrary(future).status, "invalid");
  assert.equal(future.getItem(S.STORAGE_KEY), JSON.stringify({ version: 99 }));
});
