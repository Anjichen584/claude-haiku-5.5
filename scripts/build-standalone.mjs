// 把 dist/ 中的入口脚本内联进 HTML，生成单个可离线双击打开的文件。
// 直接用 file:// 打开时浏览器会拦截外部模块脚本，内联后不受影响。
// 运行：npm run build:standalone（先执行 npm run build）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dist = 'dist';
const outDir = 'dist-standalone';
const outFile = join(outDir, 'rift-chronicles.html');

let html = readFileSync(join(dist, 'index.html'), 'utf8');
const tag = /<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/;
const match = html.match(tag);
if (!match) throw new Error('未找到入口脚本标签，请检查 dist/index.html');

const js = readFileSync(join(dist, match[1]), 'utf8').replace(/<\/script/gi, '<\\/script');
html = html.replace(tag, () => `<script type="module">\n${js}\n</script>`);

// 不应残留外部脚本或样式引用
if (/<script[^>]+src=/.test(html) || /<link[^>]+rel="stylesheet"/.test(html)) {
  throw new Error('产物中仍有外部引用，无法单文件离线运行');
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
console.log(`单文件产物：${outFile}（${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB）`);
