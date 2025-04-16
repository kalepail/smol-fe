import type { APIRoute } from "astro";
import { Buffer } from "buffer";
import { Jimp, ResizeStrategy } from "jimp";

// TODO this is a very bad way to do this, but it works for now

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