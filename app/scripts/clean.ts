import { rimrafSync } from 'rimraf';
import fs from 'fs';
import webpackPaths from '../scripts/paths';

const foldersToRemove = [
  webpackPaths.distPath,
  webpackPaths.buildPath
];

foldersToRemove.forEach((folder) => {
  if (fs.existsSync(folder)) rimrafSync(folder);
});
