import { copyFile, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = new URL("src/", root);
const output = new URL("dist/", root);
const files = ["index.js", "index.d.ts"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(files.map((file) => copyFile(new URL(file, source), new URL(file, output))));

console.log(`Built ${files.length} SDK files in dist/`);
