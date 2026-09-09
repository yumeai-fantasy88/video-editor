import {build} from 'esbuild';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
await mkdir('docs',{recursive:true});
await build({entryPoints:['src/app.js'],bundle:true,format:'esm',target:['safari17.4','chrome120'],outfile:'docs/app.js',minify:true,legalComments:'eof'});
await copyFile('src/index.html','docs/index.html');await copyFile('src/style.css','docs/style.css');await writeFile('docs/.nojekyll','');
await copyFile('node_modules/mediabunny/LICENSE','docs/mediabunny-LICENSE.txt');
await copyFile('node_modules/@mediabunny/aac-encoder/LICENSE','docs/aac-encoder-LICENSE.txt');
console.log('GitHub Pages output: docs/');
