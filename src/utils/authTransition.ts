/**
 * In-tab auth generation guard (PURE: no SDK, no DOM, no store).
 *
 * Every interactive login / signup and every logout starts a new generation.
 * A passkey ceremony (or POST /login) that resolves after a newer one started
 * is stale: it must not commit user state or the session cookie, and a
 * logout's redirect home is skipped once a newer login has started.
 *
 * The session cookie is shared with other tabs; those only need to hear about
 * a transition (`notifyAuthTransition`) and re-read the cookie.
 */
export class AuthGeneration {
  #current = 0;
  /** The last session this tab committed: a token, `null` after logout, `undefined` if none yet. */
  #committed: string | null | undefined = undefined;
  #pendingLogout: Promise<unknown> = Promise.resolve();

  /** Start a login / signup: every older one becomes stale. */
  begin(): number {
    return ++this.#current;
  }

  isCurrent(ticket: number): boolean {
    return ticket === this.#current;
  }

  /** A login / signup committed `token` as this tab's session. */
  commit(token: string): void {
    this.#committed = token;
  }

  /**
   * Start a logout: every in-flight login / signup becomes stale. `request`
   * (POST /logout) is tracked so a later POST /login can wait for it, and its
   * cookie deletion never lands after the newer login's cookie.
   */
  signOut(request: () => Promise<unknown>): { ticket: number; done: Promise<void> } {
    const ticket = ++this.#current;
    this.#committed = null;
    const done = Promise.resolve()
      .then(request)
      .then(
        () => undefined,
        () => undefined
      );
    this.#pendingLogout = done;
    return { ticket, done };
  }

  /** Resolves once this tab's latest POST /logout has settled. */
  logoutSettled(): Promise<unknown> {
    return this.#pendingLogout;
  }

  /** The session a stale POST /login response must not replace (see `useAuthentication`). */
  get committed(): string | null | undefined {
    return this.#committed;
  }
}

export type LoginOutcome = { committed: boolean };
