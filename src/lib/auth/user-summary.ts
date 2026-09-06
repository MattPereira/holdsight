/**
 * The public shape of an approved user: enough to identify them in the UI,
 * nothing about their finances. Shared by the server that reads it and the
 * client that renders it, so the two can't drift.
 */
export type UserSummary = {
  id: string;
  name: string;
  email: string;
};
