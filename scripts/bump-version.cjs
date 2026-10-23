const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const file = resolve(__dirname, "../app.json");
const app = JSON.parse(readFileSync(file, "utf8"));
const current = app.expo.version;

if (!/^\d+\.\d+\.\d+$/.test(current)) {
  throw new Error("Version must have format major.minor.patch");
}

const parts = current.split(".").map(Number);
parts[2] += 1;

if (!parts.every(Number.isSafeInteger)) {
  throw new Error("Invalid version number");
}

const next = parts.join(".");
const code = app.expo.android.versionCode;

if (!Number.isInteger(code) || code < 1 || code >= 2100000000) {
  throw new Error("Invalid Android versionCode");
}

console.log("Version: " + current + " -> " + next);
console.log("versionCode: " + code + " -> " + (code + 1));

if (!process.argv.includes("--dry-run")) {
  app.expo.version = next;
  app.expo.android.versionCode = code + 1;
  writeFileSync(file, JSON.stringify(app, null, 2) + "\n");
}
