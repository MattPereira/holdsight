type AccountWrite = Record<string, unknown> & { idToken?: unknown };

/** Better Auth 1.6.18 does not encrypt ID tokens despite its option docs. */
export function withoutPersistedIdToken<T extends AccountWrite>(data: T) {
  return { ...data, idToken: null };
}
