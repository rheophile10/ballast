// Bundle src/app/main.js into one index.html with a CSP that pins the script and stylesheet by hash.
// esbuild is only used to concatenate ES modules into one IIFE; the output is plain ES2020.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD || 'esbuild');

const { outputFiles } = await esbuild.build({ entryPoints: ['src/app/main.js'], bundle: true, format: 'iife', target: 'es2020', minify: false, write: false, legalComments: 'none' });
const script = outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const style = readFileSync('src/app/style.css', 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('base64');
const html = readFileSync('index.src.html', 'utf8').replace('__SCRIPT_HASH__', sha(script)).replace('__STYLE_HASH__', sha(style)).replace('__STYLE__', () => style).replace('__SCRIPT__', () => script);
writeFileSync('index.html', html);
console.log(`index.html ${(html.length / 1024).toFixed(0)} KB  sha256 ${createHash('sha256').update(html).digest('hex')}`);
