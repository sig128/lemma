// Exports the TypeScript registry (single source of truth) to JSON for the Python engine.
// usage: node --experimental-strip-types scripts/export-registry.mjs
import { writeFileSync, mkdirSync } from "node:fs";
const { SOURCES } = await import("../lib/registry/sources.ts");
const { PROBLEMS, ARCHIVE, EXTENSIONS } = await import("../lib/registry/problems.ts");
mkdirSync("public/data/registry", { recursive: true });
writeFileSync("public/data/registry/sources.json", JSON.stringify({ exported_at: new Date().toISOString(), sources: SOURCES }, null, 1));
writeFileSync("public/data/registry/problems.json", JSON.stringify({ exported_at: new Date().toISOString(), problems: PROBLEMS, archive: ARCHIVE, extensions: EXTENSIONS }, null, 1));
console.log("sources", SOURCES.length, "problems", PROBLEMS.length);
