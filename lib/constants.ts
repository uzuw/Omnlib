// Single-user-first: no auth yet, but every query is user-scoped so multi-user
// is just "set CURRENT_USER_ID from a session" later.
export const CURRENT_USER_ID = 1;
