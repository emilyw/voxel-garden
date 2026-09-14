import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../voxel-garden.html", import.meta.url), "utf8");
const script = html.match(/<script id="garden-model">([\s\S]*?)<\/script>/)?.[1];

function model() {
  const context = { window: {}, console };
  vm.runInNewContext(script, context, { filename: "garden-model" });
  return context.window.GardenModel;
}

test("migrates a valid v2 save without changing progress or numeric ids", () => {
  const M = model();
  const legacy = {
    version: 2,
    season: "autumn",
    weather: "rain",
    sound: true,
    elapsed: 431.5,
    nextId: 42,
    userBlocks: [{ id: 7, type: "soil", x: 2, y: 0, z: 3 }],
    templates: [{ id: 19, type: "raisedBed", x: 8, y: 0, z: -6, rotation: 1 }],
    plants: [{
      id: 31, species: "tomato", x: 8, y: 1, z: -6, stage: 6,
      progress: 152.25, moisture: 0.75, pollinated: true,
    }],
  };
  const migrated = M.migrateLegacyState(legacy);

  assert.deepEqual(JSON.parse(JSON.stringify(migrated)), {
    ...legacy,
    version: 3,
    layoutId: "legacy",
    layoutVersion: 1,
    removedFeatureIds: [],
  });
  assert.equal(M.isValidLegacyState(legacy), true);
  assert.equal(M.isValidState(migrated), true);
});

test("preset states are distinct and empty grounds is genuinely blank", () => {
  const M = model();
  const empty = M.createPresetState("empty");
  const cottage = M.createPresetState("cottage");
  const meadow = M.createPresetState("meadow");

  assert.equal(empty.version, 3);
  assert.equal(empty.layoutId, "empty");
  assert.deepEqual(JSON.parse(JSON.stringify(empty.userBlocks)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(empty.templates)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(empty.plants)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(empty.removedFeatureIds)), []);
  assert.equal(M.activeFeatures(empty).length, 0);
  assert.ok(cottage.templates.length > 0);
  assert.ok(cottage.plants.length > 0);
  assert.ok(M.activeFeatures(cottage).some((f) => f.kind === "building"));
  assert.ok(M.activeFeatures(meadow).some((f) => f.kind === "tree"));
  assert.notDeepEqual(M.activeFeatures(cottage), M.activeFeatures(meadow));
});

test("empty grounds opens ready for building while populated layouts open ready for gardening", () => {
  const M = model();
  assert.deepEqual(JSON.parse(JSON.stringify(M.activationDefaults("empty"))), { mode: "build", tool: "soil" });
  assert.deepEqual(JSON.parse(JSON.stringify(M.activationDefaults("cottage"))), { mode: "garden", tool: "sunflower" });
  assert.deepEqual(JSON.parse(JSON.stringify(M.activationDefaults("legacy"))), { mode: "garden", tool: "sunflower" });
});

test("feature removal is reducer state, supports undo snapshots, and survives validation", () => {
  const M = model();
  const before = M.createPresetState("cottage");
  const feature = M.activeFeatures(before).find((f) => f.kind === "building");
  const removed = M.reduce(before, { type: "deleteFeature", id: feature.id });

  assert.equal(removed.changed, true);
  assert.ok(removed.state.removedFeatureIds.includes(feature.id));
  assert.equal(M.activeFeatures(removed.state).some((f) => f.id === feature.id), false);
  assert.equal(M.isValidState(removed.state), true);
  assert.deepEqual(M.activeFeatures(before).map((f) => f.id), M.activeFeatures(
    M.cloneState(before),
  ).map((f) => f.id));
});

test("placement checks full footprints and releases deleted scenery", () => {
  const M = model();
  const cottage = M.createPresetState("cottage");
  assert.equal(M.canPlace(cottage, {
    type: "placeTemplate", templateType: "gazebo", x: 10, y: 0, z: -7,
  }), false);
  const building = M.activeFeatures(cottage).find((f) => f.id === "cottage-house");
  const open = M.reduce(cottage, { type: "deleteFeature", id: building.id }).state;
  assert.equal(M.canPlace(open, {
    type: "placeTemplate", templateType: "gazebo", x: 10, y: 0, z: -7,
  }), true);
  for (const [x, z] of [[-1, -4], [-10, 7], [10, -7], [12, 7], [-11, -7], [14, 0]]) {
    const result = M.reduce(M.createPresetState("empty"), {
      type: "placeBlock", blockType: "soil", x, y: 0, z,
    });
    assert.equal(result.changed, true, `expected ${x},${z} to be usable`);
  }
});

test("rain waters exposed plants but not plants under an active roof", () => {
  const M = model();
  let exposed = M.createPresetState("empty");
  exposed = M.reduce(exposed, { type: "placeBlock", blockType: "soil", x: 0, y: 0, z: 0 }).state;
  exposed = M.reduce(exposed, { type: "plant", species: "tomato", x: 0, y: 1, z: 0 }).state;
  exposed = { ...exposed, weather: "rain" };
  assert.equal(M.update(exposed, 1).plants[0].moisture, 1);

  let covered = M.createPresetState("empty");
  covered = M.reduce(covered, { type: "placeBlock", blockType: "soil", x: 0, y: 0, z: 0 }).state;
  covered = M.reduce(covered, { type: "plant", species: "tomato", x: 0, y: 1, z: 0 }).state;
  covered = M.reduce(covered, { type: "placeBlock", blockType: "roof", x: 0, y: 2, z: 0 }).state;
  covered = { ...covered, weather: "rain" };
  assert.equal(M.update(covered, 1).plants[0].moisture, 0);
});
