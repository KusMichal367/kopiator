import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_IGNORES, parseList, processZipArchive } from "../docs/archive.mjs";

const encoder = new TextEncoder();
function archive(entries) {
    return { files: Object.fromEntries(Object.entries(entries).map(([name, content]) => [name, {
        name,
        dir: name.endsWith("/"),
        async: async () => typeof content === "string" ? encoder.encode(content) : content
    }])) };
}
function filters(defaultIgnores = {}, custom = {}) {
    return { excludedFiles: new Set(), excludedFolders: new Set(), excludedExtensions: new Set(), defaultIgnores, ...custom };
}
function paths(result) {
    return [...result.markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
}
const fixtures = {
    "project/src/index.js": "console.log('hello');",
    "project/node_modules/lib/index.js": "dependency content",
    "__MACOSX/metadata.txt": "archive metadata",
    "project/.DS_Store": "finder metadata",
    "project/._index.js": "resource fork",
    "project/.env": "ENV_SECRET=hidden",
    "project/.env.local": "LOCAL_SECRET=hidden",
    "project/config/.env.production": "PRODUCTION_SECRET=hidden",
    "project/config/staging.env": "STAGING_SECRET=hidden",
    "project/logo.png": new Uint8Array([137, 80, 78, 71, 0, 1]),
    "project/data.unknown": new Uint8Array([0, 1, 2, 3])
};

test("all default rules are enabled; only source content is included", async () => {
    assert.ok(Object.values(DEFAULT_IGNORES).every(Boolean));
    const result = await processZipArchive(archive(fixtures), "project.zip", "report", filters());
    assert.deepEqual(paths(result), ["project/src/index.js"]);
    assert.equal(result.stats.files, 1);
    assert.equal(result.stats.skippedFiles, 10);
    assert.doesNotMatch(result.markdown, /ENV_SECRET|LOCAL_SECRET|PRODUCTION_SECRET|STAGING_SECRET/);
});

for (const [rule, expected] of [
    ["nodeModules", ["project/node_modules/lib/index.js"]],
    ["macosx", ["__MACOSX/metadata.txt"]],
    ["dsStore", ["project/.DS_Store"]],
    ["appleDouble", ["project/._index.js"]],
    ["env", ["project/.env", "project/.env.local", "project/config/.env.production", "project/config/staging.env"]],
    ["binary", ["project/data.unknown", "project/logo.png"]]
]) {
    test(`turning off ${rule} includes that group independently`, async () => {
        const result = await processZipArchive(archive(fixtures), "project.zip", "report", filters({ [rule]: false }));
        assert.deepEqual(paths(result).sort(), [...expected, "project/src/index.js"].sort());
        assert.equal(result.stats.files, 1 + expected.length);
    });
}

test("all rules can be turned off together; binary content has a readable marker", async () => {
    const result = await processZipArchive(archive(fixtures), "project.zip", "report",
        filters(Object.fromEntries(Object.keys(DEFAULT_IGNORES).map((key) => [key, false]))));
    assert.equal(result.stats.files, Object.keys(fixtures).length);
    assert.equal(result.stats.skippedFiles, 0);
    assert.match(result.markdown, /Domyślne ignorowanie \(włączone\): brak/);
    assert.match(result.markdown, /Plik binarny \(6 B\)/);
    assert.ok(!result.markdown.includes("\u0000"));
});

for (const scope of ["report", "all"]) {
    test(`structure (${scope}) honors default switches, including env and binary rules`, async () => {
        const result = await processZipArchive(archive(fixtures), "project.zip", "structure", filters(), scope);
        const tree = result.markdown.split("```text\n")[1];
        assert.match(tree, /index\.js/);
        assert.doesNotMatch(tree, /node_modules|__MACOSX|\.DS_Store|\._index|\.env|logo\.png|data\.unknown/);
        assert.equal(result.stats.files, 1);
        const envResult = await processZipArchive(archive(fixtures), "project.zip", "structure", filters({ env: false }), scope);
        assert.equal(envResult.stats.files, 5);
        assert.match(envResult.markdown.split("```text\n")[1], /\.env\.production/);
    });
}

test("custom file filters are skipped only for the all-files structure scope", async () => {
    const entries = archive({ "src/main.js": "code", "README.md": "docs", "debug.log": "log", "dist/bundle.js": "build" });
    const custom = filters({}, { excludedFiles: new Set(["readme.md"]), excludedExtensions: new Set([".log"]), excludedFolders: new Set(["dist"]) });
    const report = await processZipArchive(entries, "project.zip", "report", custom);
    assert.deepEqual(paths(report), ["src/main.js"]);
    const structure = await processZipArchive(entries, "project.zip", "structure", custom, "all");
    assert.equal(structure.stats.files, 3);
    assert.doesNotMatch(structure.markdown.split("```text\n")[1], /dist|bundle/);
});

test("custom exclusions still apply when a default switch is off", async () => {
    const result = await processZipArchive(archive(fixtures), "project.zip", "report", filters({ env: false }, { excludedFiles: new Set([".env.local", "project/config/staging.env"]) }));
    assert.ok(paths(result).includes("project/.env"));
    assert.ok(!paths(result).includes("project/.env.local"));
    assert.ok(!paths(result).includes("project/config/staging.env"));
});

test("default matching handles case and nested paths without matching unrelated names", async () => {
    const result = await processZipArchive(archive({
        "nested/NODE_MODULES/lib.js": "skip", "nested/.ENV.LOCAL": "skip", "nested/.DS_STORE": "skip",
        "src/environment.js": "keep", "src/.envrc": "keep", "src/node_modules_notes.txt": "keep"
    }), "project.zip", "report", filters());
    assert.deepEqual(paths(result), ["src/.envrc", "src/environment.js", "src/node_modules_notes.txt"]);
});

test("metadata records only enabled rules", async () => {
    const result = await processZipArchive(archive({ "file.js": "code" }), "project.zip", "report", filters({ env: false, nodeModules: false }));
    const metadata = result.markdown.split("\n").find((line) => line.startsWith("- Domyślne ignorowanie"));
    assert.doesNotMatch(metadata, /\.env|node_modules/);
    assert.match(metadata, /__MACOSX/);
});

test("filter input supports commas, newlines, normalized paths and extensions", () => {
    assert.deepEqual([...parseList("README.md,\n./src/Temp/\r\ndocs\\draft.md", false)], ["readme.md", "src/temp", "docs/draft.md"]);
    assert.deepEqual([...parseList("LOG,\n.tmp\r\n.cache", true)], [".log", ".tmp", ".cache"]);
});

test("empty archives still produce valid Markdown and accurate zero counts", async () => {
    const result = await processZipArchive(archive({}), "empty.zip", "report", filters());
    assert.equal(result.stats.files, 0);
    assert.equal(result.stats.directories, 0);
    assert.equal(result.stats.skippedFiles, 0);
    assert.match(result.markdown, /Brak plików tekstowych/);
});

test("embedded code fences cannot break the generated document", async () => {
    const result = await processZipArchive(archive({ "README.md": "```js\nexample\n```\n" }), "project.zip", "report", filters());
    assert.match(result.markdown, /````markdown\n```js\nexample\n```\n````/);
});
