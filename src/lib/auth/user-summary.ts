import type { AccessRole } from "@/lib/auth/policy";

/**
 * The public shape of a user: enough to identify them in the UI, nothing about
 * their finances. Shared by the server that reads it and the client that
 * renders it, so the two can't drift.
 */
export type UserSummary = {
  id: string;
  name: string;
  email: string;
};

/** A user who still holds an access grant, and the authority it carries. */
export type GrantedUser = UserSummary & {
  role: AccessRole;
};
