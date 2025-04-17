import type { APIRoute } from "astro";
import { Buffer } from "buffer";
import { Jimp, ResizeStrategy } from "jimp";

// TODO this is a very bad way to do this, but it works for now
// We should be saving all gens to R2, KV and even SQL

export const GET: APIRoute = async ({ params, url }) => {
	const scale = url.searchParams.get('scale');
	const id = params.id;
	const data = id
		? await fetch(
			`https://smol-workflow.sdf-ecosystem.workers.dev?id=${id}`,
		).then(async (res) => {
			if (res.ok) return res.json();
			return null;
		})
		: null;

	if (!data?.do?.image_base64) {
		return new Response(null, {
			status: 404,
			headers: {
				"Cache-Control": "no-store",
			}
		});
	}

	let img: Buffer = Buffer.from(data.do.image_base64, 'base64');

	if (scale) {
		const image = await Jimp.fromBuffer(img);

		image.resize({
			w: image.width * parseInt(scale),
			h: image.height * parseInt(scale),
			mode: ResizeStrategy.NEAREST_NEIGHBOR,
		});

		img = await image.getBuffer('image/png')
	}

	return new Response(img, {
		status: 200,
		headers: {
			"Content-Type": "image/png",
			"Cache-Control": "public, max-age=2419200, immutable",
		}
	});
}