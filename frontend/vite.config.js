import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
function offlineShell() {
  return {name:'techtask-offline-shell',apply:'build',async closeBundle(){
    const dir=path.resolve('dist');
    const list=async(base='')=>(await Promise.all((await readdir(path.join(dir,base),{withFileTypes:true})).map(async e=>e.isDirectory()?list(path.join(base,e.name)):[path.join(base,e.name)]))).flat();
    const assets=(await list()).filter(file=>file!=='sw.js').map(file=>'/'+file.split(path.sep).join('/')).sort();
    const hash=createHash('sha256');
    for(const file of assets) hash.update(await readFile(path.join(dir,file)));
    const source=await readFile('public/sw.js','utf8');
    await writeFile(path.join(dir,'sw.js'),source.replace('/*__ASSETS__*/[]',JSON.stringify(assets)).replace('/*__VERSION__*/',hash.digest('hex').slice(0,16)));
  }};
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const key = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch {}
  if (key.startsWith('sb_secret_') || role === 'service_role') throw new Error('Use somente a chave pública no frontend.');
  return { plugins: [react(), offlineShell()] };
});
