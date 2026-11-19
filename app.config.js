module.exports = ({ config }) => {
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch {}
  if (key.startsWith('sb_secret_') || role === 'service_role') throw new Error('Use somente a chave pública no aplicativo.');
  return ({
  ...config,
  extra: {
    ...config.extra,
    ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
      ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } } : {}),
  },
  });
};
