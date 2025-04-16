import type { APIRoute } from "astro";
import { Buffer } from "buffer";

// TODO this is a very bad way to do this, but it works for now

export const GET: APIRoute = async ({ params }) => {
	const id = params.id;
	const data = id
		? await fetch(
			`https://smol-workflow.sdf-ecosystem.workers.dev?id=${id}`,
		).then(async (res) => {
			if (res.ok) return res.json();
			return null;
		})
		: null;

	return new Response(Buffer.from(data.do.image_base64, 'base64'), {
		status: 200,
		headers: {
			"Content-Type": "image/png",
			"Cache-Control": "public, max-age=2419200, immutable",
		}
	});
}