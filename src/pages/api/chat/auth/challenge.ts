import type { APIRoute } from 'astro';
import { buildChallenge } from '../../../../lib/the-vip/auth';

export const POST: APIRoute = async (context) => {
    const { request, locals } = context;
    try {
        const body = await request.json() as { address: string };
        if (!body.address) {
            return new Response(JSON.stringify({ error: 'Address required' }), { status: 400 });
        }

        const env = (locals as any).runtime?.env;
        const serverSecret = env?.CHAT_SERVER_SECRET || process.env.CHAT_SERVER_SECRET;
        if (!serverSecret) {
            return new Response(JSON.stringify({ error: 'Missing CHAT_SERVER_SECRET' }), { status: 500 });
        }

        const networkPassphrase =
            env?.PUBLIC_NETWORK_PASSPHRASE ||
            process.env.PUBLIC_NETWORK_PASSPHRASE ||
            'Public Global Stellar Network ; September 2015';

        const challengeTx = buildChallenge(serverSecret, body.address, networkPassphrase);

        return new Response(JSON.stringify({
            xdr: challengeTx
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e: any) {
        console.error(e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
