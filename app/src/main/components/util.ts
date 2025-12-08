import { join } from 'node:path';
import { format } from 'node:url';

export function resolveHtmlPath(htmlFileName: string): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return `${process.env.VITE_DEV_SERVER_URL}${htmlFileName}`;
  }
  
  return format({
    pathname: join(__dirname, `../renderer/${htmlFileName}`),
    protocol: 'file:',
    slashes: true,
  });
}
