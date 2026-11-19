export function supportsPasskeys() {
  return typeof window !== 'undefined' && window.isSecureContext !== false
    && typeof window.PublicKeyCredential === 'function'
    && typeof navigator.credentials?.get === 'function';
}

export function passkeyError(error, registering = false) {
  if (error?.code === 'passkey_disabled') return 'A entrada com chave de acesso está indisponível no momento. Use e-mail e senha.';
  if (error?.code === 'webauthn_credential_exists') return 'Esta chave de acesso já foi cadastrada.';
  if (error?.code === 'too_many_passkeys') return 'Você já atingiu o limite de chaves de acesso desta conta.';
  return registering ? 'Chave não cadastrada. Confirme no aparelho para concluir ou tente novamente.'
    : 'A confirmação da chave foi cancelada ou não pôde ser concluída. Tente novamente ou use outra forma de entrar.';
}
