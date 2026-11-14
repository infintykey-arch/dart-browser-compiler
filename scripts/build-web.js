import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'www');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of ['index.html', 'styles.css', 'src', 'assets', 'examples']) {
  await cp(resolve(root, entry), resolve(output, entry), { recursive: true });
}

console.log('Prepared local web assets in www/ for the Android WebView.');
