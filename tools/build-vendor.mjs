import {build} from 'esbuild';
import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
await mkdir('vendor',{recursive:true});
await build({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'eof',outfile:'vendor/supabase.js'});
await copyFile('node_modules/@supabase/supabase-js/LICENSE','vendor/SUPABASE-LICENSE');
const licenses=['@supabase/supabase-js/LICENSE','@supabase/auth-js/LICENSE','@supabase/functions-js/LICENSE','@supabase/postgrest-js/LICENSE','@supabase/realtime-js/LICENSE','@supabase/storage-js/LICENSE','@supabase/phoenix/LICENSE.md','iceberg-js/LICENSE','tslib/LICENSE.txt','tslib/CopyrightNotice.txt'];
await writeFile('vendor/THIRD-PARTY-NOTICES.txt',(await Promise.all(licenses.map(async file=>`${file}\n\n${await readFile('node_modules/'+file,'utf8')}`))).join('\n\n--------------------\n\n'));
