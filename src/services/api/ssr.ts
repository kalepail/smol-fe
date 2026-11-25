/**
 * SSR API helpers bound to the Worker runtime; Astro pages import these. @astrojs/cloudflare 14
 * removed `Astro.locals.runtime.env`, so `SMOL_API` comes from `cloudflare:workers`. The pure
 * logic lives in `./server.ts` (no `cloudflare:workers` import, so Node unit tests load it).
 *
 * `astro dev` has no smol-workflow to bind to, so it skips the binding and calls PUBLIC_API_URL
 * over HTTP like the browser does.
 */
import { env } from 'cloudflare:workers';
import {
  serverApiFetch as fetchWith,
  serverApiFetchResult as fetchResultWith,
  type ServerApiFetchContext,
  type ServerApiFetchOptions,
  type ServerApiResult,
} from './server.ts';

export { sessionSubject } from './server.ts';

type PageContext = Omit<ServerApiFetchContext, 'env'>;

const withEnv = (page: PageContext): ServerApiFetchContext => ({
  request: page.request,
  cookies: page.cookies,
  response: page.response,
  env: import.meta.env.DEV ? undefined : { SMOL_API: env.SMOL_API },
});

export function serverApiFetch<T>(page: PageContext, path: string, options?: ServerApiFetchOptions): Promise<T | null> {
  return fetchWith<T>(withEnv(page), path, options);
}

export function serverApiFetchResult<T>(
  page: PageContext,
  path: string,
  options?: ServerApiFetchOptions,
): Promise<ServerApiResult<T>> {
  return fetchResultWith<T>(withEnv(page), path, options);
}
