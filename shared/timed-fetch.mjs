// Evita manter login/logout bloqueados indefinidamente quando a rede cai.
export async function timedFetch(input, init = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  else init.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 15000);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', cancel);
  }
}
