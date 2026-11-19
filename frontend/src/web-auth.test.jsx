import {test,expect,vi} from 'vitest';
import {passkeyError,supportsPasskeys} from './web-auth.mjs';
import {requestNotifications} from './notifications.mjs';
test('recurso indisponível e cancelamento têm mensagens sem depender de Google',()=>{
  expect(passkeyError({code:'passkey_disabled'})).toContain('e-mail e senha');
  expect(passkeyError({code:'ERROR_CEREMONY_ABORTED'})).toContain('cancelada');
  expect(passkeyError({},true)).toContain('não cadastrada');expect(typeof supportsPasskeys()).toBe('boolean');
});
test('notificações negadas ou canceladas não são anunciadas como ativadas',async()=>{
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{}});
  const denied={permission:'denied',requestPermission:vi.fn()};await expect(requestNotifications({Notification:denied})).rejects.toThrow('Permissão negada');expect(denied.requestPermission).not.toHaveBeenCalled();
  const cancelled={permission:'default',requestPermission:async()=>'default'};await expect(requestNotifications({Notification:cancelled})).rejects.toThrow('não concedida');
  delete navigator.serviceWorker;
});
