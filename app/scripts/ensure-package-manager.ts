// .erb/scripts/ensure-package-manager.ts
import fs from "node:fs";
import path from "node:path";

const appPkgPath = path.resolve(
  __dirname,
  "../../src/apps/electron-apps/electron-react/app/package.json"
);

if (fs.existsSync(appPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(appPkgPath, "utf8"));
  if (!pkg.packageManager || !pkg.packageManager.includes("pnpm")) {
    pkg.packageManager = "pnpm@10.18.0";
    fs.writeFileSync(appPkgPath, JSON.stringify(pkg, null, 2));
    console.log("✅ Added packageManager=pnpm@10.18.0 to release/app/package.json");
  } else {
    console.log("ℹ️ packageManager already set to pnpm.");
  }
}
