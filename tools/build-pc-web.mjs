// PCのブラウザ用（Web版）を、サーバーに置くフォルダの形で作る
//   node tools/build-pc-web.mjs                → build/pc-web/dance-pc-test （テスト用：検索除け付き）
//   node tools/build-pc-web.mjs dance-pc --prod → build/pc-web/dance-pc      （本番用）
// 中身は www と同じ。ファイル名の後ろにバージョンを付けて、更新した時に古いファイルが使われないようにする。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const prod = args.includes('--prod');
const name = args.find(a => !a.startsWith('--')) || (prod ? 'dance-pc' : 'dance-pc-test');
const ver = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const out = path.join(root, 'build', 'pc-web', name);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'www'), out, { recursive: true });
fs.copyFileSync(path.join(root, 'icon-512.png'), path.join(out, 'icon.png'));

// index.html
const idxPath = path.join(out, 'index.html');
let html = fs.readFileSync(idxPath, 'utf8');
if (!html.includes('バージョン ' + ver)) throw new Error('www/index.html のバージョン表示が ' + ver + ' になっていません');
html = html.replace(/(<script src="[^"?]+\.js)(")/g, '$1?v=' + ver + '$2');
html = html.replace(/(<link rel="stylesheet" href="[^"?]+\.css)(")/g, '$1?v=' + ver + '$2');
const head = [
  '<meta name="description" content="Rainbow Dance Studio：曲を選ぶと振付を自動で作り、Rainbow Stickを音楽に合わせて動かします（PC版：Chrome / Edge）">',
  '<link rel="icon" href="icon.png">',
  '<link rel="apple-touch-icon" href="icon.png">',
  prod ? '' : '<meta name="robots" content="noindex,nofollow">',
  // Bluetooth・USB は https のページでしか使えないので、http で開いたら https へ
  '<script>if(location.protocol==="http:"&&!/^(localhost|127\\.)/.test(location.hostname))location.replace("https://"+location.host+location.pathname+location.search);</script>'
].filter(Boolean).join('\n');
html = html.replace('<title>Rainbow Dance Studio</title>', '<title>Rainbow Dance Studio</title>\n' + head);
fs.writeFileSync(idxPath, html);

// サーバーの設定（Apache の .htaccess。このフォルダだけに効く）
fs.writeFileSync(path.join(out, '.htaccess'), [
  '# Rainbow Dance Studio（PC版）の設定。このフォルダだけに効きます',
  'DirectoryIndex index.html',
  'AddType text/javascript .js',
  'AddType text/css .css',
  'AddType audio/mpeg .mp3',
  'AddType font/woff2 .woff2',
  '<IfModule mod_headers.c>',
  '  # index.html は毎回サーバーに確認する（更新がすぐお客様に届くように）',
  '  <FilesMatch "\\.html$">',
  '    Header set Cache-Control "no-cache"',
  '  </FilesMatch>',
  '  # プログラムと文字のデータは、バージョン付きで読み込むので長く覚えてよい',
  '  <FilesMatch "\\.(js|css|woff2|png)$">',
  '    Header set Cache-Control "public, max-age=2592000"',
  '  </FilesMatch>',
  '  <FilesMatch "\\.txt$">',
  '    Header set Cache-Control "no-cache"',
  '  </FilesMatch>',
  '</IfModule>',
  ''
].join('\n'));
fs.writeFileSync(path.join(out, 'version.txt'), ver + '\n');

// 大きさ
let n = 0, bytes = 0;
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else { n++; bytes += fs.statSync(p).size; } } })(out);
console.log(`作成：${out}（${prod ? '本番用' : 'テスト用・検索除け付き'}）バージョン ${ver}、${n} ファイル、${(bytes / 1048576).toFixed(1)} MB`);
