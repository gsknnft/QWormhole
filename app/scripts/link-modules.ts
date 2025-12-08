import fs from 'fs';

import paths from './paths';

const { srcNodeModulesPath, appNodeModulesPath } =
  paths;

if (fs.existsSync(appNodeModulesPath)) {
  if (!fs.existsSync(srcNodeModulesPath)) {
    fs.symlinkSync(appNodeModulesPath, srcNodeModulesPath, 'junction');
  }
}
