import type { APIRoute } from "astro";

export const POST: APIRoute = async (ctx) => {
  const { request, params } = ctx;
  const roomId = params.id || "";

  if (!roomId) return new Response("Room id required", { status: 400 });

  try {
    const textBody = await request.text();

    // Server-to-Server fetch bypasses browser CORS.
    // Proxy the request directly to the centralized kalefarm.xyz relay.
    const proxyRes = await fetch(
      `https://kalefarm.xyz/api/dungeon/rooms/${encodeURIComponent(roomId)}/join`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: textBody,
      }
    );

    const data = await proxyRes.text();

    return new Response(data, {
      status: proxyRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy Join failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
