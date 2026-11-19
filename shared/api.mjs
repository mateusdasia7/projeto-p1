export function createApi({ base = '', accessToken, onExpired = () => {}, fetcher = globalThis.fetch }) {
  return async(path,options={}) => {
    const token = await accessToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),18000);
    let response;
    try {
      response = await fetcher(base.replace(/\/+$/,'')+path,{
        ...options,cache:'no-store',signal:controller.signal,
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      });
    } catch { throw new Error('Conexão indisponível. Sua alteração local será reenviada.'); }
    finally { clearTimeout(timer); }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = Object.assign(new Error(data?.error || 'Serviço indisponível.'),{
        status:response.status,code:data?.code,current:data?.current,
      });
      if (response.status===401) onExpired('Entre novamente. Suas alterações pendentes estão guardadas neste aparelho.');
      throw error;
    }
    return data;
  };
}
