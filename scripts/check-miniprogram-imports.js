const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const PKG_DIR = path.join(ROOT, "packages");

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function checkSourceFile(file, issues) {
  const code = read(file);
  const patterns = [
    /\bimport\s+[^'"]*from\s+['"]([^'"]+)['"]/g,
    /\bexport\s+\*\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const reg of patterns) {
    let m;
    while ((m = reg.exec(code))) {
      const spec = m[1];
      if (!spec.startsWith(".")) continue;
      if (spec.endsWith("/index")) continue;
      if (/\.[a-z]+$/i.test(spec)) continue;

      const abs = path.resolve(path.dirname(file), spec);
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        issues.push({
          type: "SOURCE_DIR_IMPORT",
          file,
          spec,
          suggestion: `${spec}/index`,
        });
      }
    }
  }
}

function checkDistFile(file, issues) {
  const code = read(file);
  const reg = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = reg.exec(code))) {
    const spec = m[1];
    if (!spec.startsWith(".")) continue;
    const base = path.resolve(path.dirname(file), spec);
    const ok =
      fs.existsSync(`${base}.js`) ||
      fs.existsSync(path.join(base, "index.js")) ||
      fs.existsSync(base);
    if (!ok) {
      issues.push({
        type: "DIST_MISSING_REQUIRE_TARGET",
        file,
        spec,
      });
    }
  }
}

const issues = [];

// 1) 源码层
const srcFiles = walk(PKG_DIR, [".ts", ".js"]).filter((f) =>
  f.includes(`${path.sep}src${path.sep}`),
);
srcFiles.forEach((f) => checkSourceFile(f, issues));

// 2) 构建产物层
const distFiles = walk(PKG_DIR, [".js"]).filter((f) =>
  f.includes(`${path.sep}dist${path.sep}`),
);
distFiles.forEach((f) => checkDistFile(f, issues));

if (issues.length === 0) {
  console.log("✅ No potential miniprogram module resolution issues found.");
  process.exit(0);
}

console.log(`❌ Found ${issues.length} potential issues:\n`);
for (const it of issues) {
  console.log(`[${it.type}] ${it.file}`);
  console.log(`  spec: ${it.spec}`);
  if (it.suggestion) console.log(`  suggest: ${it.suggestion}`);
  console.log("");
}
process.exit(1);
