// Local stand-in for the `smol-workflow` Worker behind the built smol-fe Worker's SMOL_API service
// binding (playwright.worker.config.ts). Forwards each request to the fixture API
// (tests/fixtures/api.mjs), tagged so the fixture records it as service-binding traffic. Never deployed.
export default {
  async fetch(request, env) {
    const { pathname, search } = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set('x-smol-service-binding', 'SMOL_API');
    return fetch(new URL(`${pathname}${search}`, env.FIXTURE_API_ORIGIN), {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
  },
};
