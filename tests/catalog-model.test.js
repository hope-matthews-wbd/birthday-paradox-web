const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function extractWorker(id) {
  const pattern = new RegExp(
    `<script id="${id}" type="javascript\\/worker">([\\s\\S]*?)<\\/script>`
  );
  const match = html.match(pattern);
  assert.ok(match, `Worker script ${id} should exist`);
  return match[1];
}

function runWorker(source, catalog, batchSize, numSimulations = 200) {
  let result;
  const context = {
    Array,
    Float64Array,
    Int32Array,
    Map,
    Math,
    Set,
    postMessage(message) {
      if (message.type === "done") result = message;
    },
  };

  vm.createContext(context);
  vm.runInContext(source, context);
  context.onmessage({
    data: {
      catalog,
      batchSize,
      numSimulations,
      lookback: 3,
      seed: 42,
    },
  });
  assert.ok(result, "Worker should return a done result");
  return result;
}

function catalogTotals(catalog) {
  return catalog.reduce(
    (totals, row) => ({
      titles: totals.titles + row.titleCount,
      clips: totals.clips + row.titleCount * row.clipsPerTitle,
    }),
    { titles: 0, clips: 0 }
  );
}

const defaultCatalog = [
  { clipsPerTitle: 6, titleCount: 10 },
  { clipsPerTitle: 5, titleCount: 9 },
  { clipsPerTitle: 4, titleCount: 20 },
  { clipsPerTitle: 3, titleCount: 25 },
  { clipsPerTitle: 2, titleCount: 132 },
  { clipsPerTitle: 1, titleCount: 283 },
];

const scenarios = [
  { name: "default", catalog: defaultCatalog, batchSize: 25 },
  {
    name: "added row",
    catalog: [{ clipsPerTitle: 7, titleCount: 50 }, ...defaultCatalog],
    batchSize: 25,
  },
  { name: "wide", catalog: [{ clipsPerTitle: 1, titleCount: 100 }], batchSize: 10 },
  { name: "deep", catalog: [{ clipsPerTitle: 10, titleCount: 30 }], batchSize: 10 },
];

const exactWorker = extractWorker("worker");
const titleWorker = extractWorker("worker-titles");
const results = new Map();

for (const scenario of scenarios) {
  const totals = catalogTotals(scenario.catalog);
  assert.ok(totals.clips >= scenario.batchSize, `${scenario.name}: catalog should fit session`);

  const exact = runWorker(exactWorker, scenario.catalog, scenario.batchSize);
  const titles = runWorker(titleWorker, scenario.catalog, scenario.batchSize);

  for (const overlaps of [exact.biasedOverlaps, exact.uniformOverlaps]) {
    assert.equal(overlaps.length, 200, `${scenario.name}: exact output length`);
    assert.ok(
      overlaps.every((value) => value >= 0 && value <= scenario.batchSize),
      `${scenario.name}: exact overlap bounds`
    );
  }

  for (const prefix of ["biased", "uniform"]) {
    const distinct = titles[`${prefix}DistinctArr`];
    const within = titles[`${prefix}WithinRepeatsArr`];
    const cross = titles[`${prefix}Overlaps`];

    assert.equal(distinct.length, 200, `${scenario.name}: distinct output length`);
    assert.equal(within.length, 200, `${scenario.name}: within output length`);
    assert.equal(cross.length, 200, `${scenario.name}: cross output length`);

    for (let index = 0; index < 200; index++) {
      assert.equal(
        distinct[index] + within[index],
        scenario.batchSize,
        `${scenario.name}: distinct + within should equal session size`
      );
      assert.ok(
        cross[index] >= 0 && cross[index] <= distinct[index],
        `${scenario.name}: cross-session overlap bounds`
      );
    }
  }

  results.set(scenario.name, { exact, titles });
}

assert.notEqual(
  results.get("default").exact.biasedMean,
  results.get("added row").exact.biasedMean,
  "Adding a catalog row should change the personalized exact-duplicate result"
);
assert.notEqual(
  results.get("default").titles.biasedMean,
  results.get("added row").titles.biasedMean,
  "Adding a catalog row should change the personalized title-overlap result"
);
assert.equal(
  results.get("wide").titles.biasedWithinRepeats,
  0,
  "One clip per title cannot create within-session title repeats"
);
assert.ok(
  results.get("deep").titles.biasedWithinRepeats > 0,
  "Multi-clip titles should be able to create within-session title repeats"
);

console.log("Catalog model tests passed for default, added-row, wide, and deep catalogs.");
