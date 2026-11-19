import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('mobile.config.public.json', root), 'utf8'));
if (!config.supabaseUrl?.startsWith('https://') || !config.publishableKey?.startsWith('sb_publishable_')
  || !config.apiUrl?.startsWith('https://')) {
  throw new Error('A configuração pública do aplicativo está inválida.');
}
const file = new URL('.env', root);
try {
  await access(file);
  console.log('Arquivo .env existente preservado.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(file, [
    '# Somente configuração pública; não contém senha nem chave administrativa.',
    'EXPO_PUBLIC_SUPABASE_URL=' + config.supabaseUrl,
    'EXPO_PUBLIC_SUPABASE_ANON_KEY=' + config.publishableKey,
    'EXPO_PUBLIC_P1_API_URL=' + config.apiUrl,
    'EXPO_PUBLIC_EAS_PROJECT_ID=',
    'EXPO_PUBLIC_LIBRAS_VIDEO_URL=',
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log('Conexão do aplicativo preparada com configuração pública.');
}
console.log('Pasta do aplicativo: ' + fileURLToPath(root));
console.log('Use Expo Go compatível com o SDK 58 no Android. Teste a digital, o modo offline e notificações locais.');
