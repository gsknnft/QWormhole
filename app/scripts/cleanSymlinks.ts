import fs from "fs";
import path from "path";

function cleanupCircularSymlinks(baseDir: string) {
  console.log(`🧹 Scanning ${baseDir} for circular symlinks...`);
  const visited: string[] = [];

  function walk(dir: string) {
    if (visited.includes(dir)) return;
    visited.push(dir);

    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.lstatSync(full);

      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(full);
        const resolvedTarget = path.resolve(path.dirname(full), target);
        const resolvedSelf = path.resolve(full);

        if (resolvedTarget === resolvedSelf || resolvedTarget.startsWith(resolvedSelf)) {
          console.warn(`🚨 Circular link detected: ${full} → ${target}`);
          try {
            fs.unlinkSync(full);
            console.log(`✅ Removed ${full}`);
          } catch (e) {
            console.error(`❌ Failed to remove ${full}:`, e);
          }
        }
      } else if (stat.isDirectory()) {
        walk(full);
      }
    }
  }

  walk(baseDir);
}

cleanupCircularSymlinks(process.cwd());
