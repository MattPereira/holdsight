/**
 * The code an admission failure travels under. Kept out of `access-error.ts`
 * because that module is `server-only` and the sign-in screens that read this
 * code render on the client.
 */
export const EMAIL_NOT_ALLOWED = "EMAIL_NOT_ALLOWED";
