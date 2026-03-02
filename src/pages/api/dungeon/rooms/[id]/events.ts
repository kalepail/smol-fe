import type { APIRoute } from "astro";

export const GET: APIRoute = async (ctx) => {
  const { request, params } = ctx;
  const roomId = params.id || "";

  if (!roomId) return new Response("Room id required", { status: 400 });

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || "0";
  const token = request.headers.get("Authorization") || "";

  try {
    const proxyRes = await fetch(
      `https://kalefarm.xyz/api/dungeon/rooms/${encodeURIComponent(roomId)}/events?cursor=${encodeURIComponent(cursor)}`,
      {
        method: "GET",
        headers: { "Authorization": token },
      }
    );

    const data = await proxyRes.text();

    return new Response(data, {
      status: proxyRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy GET events failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const POST: APIRoute = async (ctx) => {
  const { request, params } = ctx;
  const roomId = params.id || "";

  if (!roomId) return new Response("Room id required", { status: 400 });

  const token = request.headers.get("Authorization") || "";

  try {
    const textBody = await request.text();

    const proxyRes = await fetch(
      `https://kalefarm.xyz/api/dungeon/rooms/${encodeURIComponent(roomId)}/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token
        },
        body: textBody,
      }
    );

    const data = await proxyRes.text();

    return new Response(data, {
      status: proxyRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy POST events failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
