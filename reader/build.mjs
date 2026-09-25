// Bundle the standalone reader into reader/index.html with the CROR 2025 document inside.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD || 'esbuild');
const { outputFiles } = await esbuild.build({ entryPoints: ['reader/src/main.js'], bundle: true, format: 'iife', target: 'es2020', minify: false, write: false, legalComments: 'none', loader: { '.json': 'json' } });
const script = outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const style = readFileSync('src/app/style.css', 'utf8') + '\n' + readFileSync('src/reader/reader.css', 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('base64');
const html = readFileSync('reader/index.src.html', 'utf8').replace('__SCRIPT_HASH__', sha(script)).replace('__STYLE_HASH__', sha(style)).replace('__STYLE__', () => style).replace('__SCRIPT__', () => script);
writeFileSync('reader/index.html', html);
console.log(`reader/index.html ${(html.length / 1024).toFixed(0)} KB`);
