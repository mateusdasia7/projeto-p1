import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useSession } from './SessionProvider';
import { passkeyError, supportsPasskeys } from './web-auth.mjs';

export default function PasskeySettings() {
  const { user, accessToken, touch } = useSession();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const alive = useRef(true);
  const ceremony = useRef(null);
  const supported = supportsPasskeys();
  useEffect(() => {
    alive.current = true;
    (async () => {
      try {
        await accessToken();
        const { data, error } = await supabase.auth.passkey.list();
        if (!alive.current) return;
        if (error) throw new Error(passkeyError(error, true));
        setKeys(data || []);
      } catch (error) { if (alive.current) setNotice(error.message); }
      finally { if (alive.current) setLoading(false); }
    })();
    return () => { alive.current = false; ceremony.current?.abort(); };
  }, [user.id, accessToken]);

  async function register() {
    if (busy || !supported) return;
    setBusy(true); setNotice('');
    const controller = new AbortController(); ceremony.current = controller;
    try {
      await accessToken();
      const { data, error } = await supabase.auth.registerPasskey({ options: { signal: controller.signal } });
      if (!alive.current || controller.signal.aborted) return;
      if (error || !data?.id) throw new Error(passkeyError(error, true));
      setKeys(previous => [...previous.filter(item => item.id !== data.id), data]);
      touch();
      setNotice('Chave de acesso cadastrada. Na próxima visita, escolha Entrar com chave de acesso.');
    } catch (error) { if (alive.current) setNotice(error.message || 'Não foi possível cadastrar a chave.'); }
    finally { if (alive.current) setBusy(false); ceremony.current = null; }
  }
  async function remove(key) {
    if (busy || !window.confirm('Remover esta chave de acesso? Você poderá entrar com e-mail ou outra chave cadastrada.')) return;
    setBusy(true); setNotice('');
    try {
      await accessToken();
      const { error } = await supabase.auth.passkey.delete({ passkeyId: key.id });
      if (!alive.current) return;
      if (error) throw new Error('Não foi possível remover a chave. Tente novamente.');
      setKeys(previous => previous.filter(item => item.id !== key.id));
      setNotice('Chave de acesso removida.');
    } catch (error) { if (alive.current) setNotice(error.message); }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="card" aria-label="Chaves de acesso">
    <h2>Entrar com o seu aparelho</h2>
    <p className="muted">Cadastre uma chave de acesso para voltar usando digital, Face ID, Windows Hello
      ou o desbloqueio oferecido pelo seu dispositivo. Sua digital e seu rosto não são enviados ao TechTask.</p>
    <button disabled={busy || loading || !supported} onClick={() => void register()}>
      {busy ? 'Aguarde a confirmação…' : 'Cadastrar chave de acesso'}</button>
    {!supported && <p className="muted small">Este navegador não oferece chaves de acesso. Você pode continuar usando e-mail e senha.</p>}
    {loading ? <p role="status">Consultando suas chaves…</p> : keys.length > 0
      ? <ul className="passkey-list">{keys.map(key => <li key={key.id}>
        <span>{key.friendly_name || 'Chave de acesso'}{key.created_at && <time dateTime={key.created_at}>
          Cadastrada em {new Date(key.created_at).toLocaleDateString('pt-BR')}</time>}</span>
        <button className="secondary" disabled={busy} onClick={() => void remove(key)}>Remover chave</button>
      </li>)}</ul> : <p className="muted small">Nenhuma chave de acesso cadastrada nesta conta.</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
  </section>;
}
