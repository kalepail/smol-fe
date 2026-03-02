
import { describe, it, expect } from 'vitest';

const API_URL = 'http://localhost:4321/api/chat/auth/verify';

describe('ZK Auth API', () => {
    it('should reject missing session key', async () => {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ zkProof: { proof: [], publicInputs: [] } })
        });

        if (!res.ok) {
            const text = await res.text();
            console.log('Missing Session Key Test Response:', res.status, text.slice(0, 500)); // Log first 500 chars
            try {
                const data = JSON.parse(text);
                expect(res.status).toBe(400);
                expect(data.error).toContain('Session Key required');
            } catch (e) {
                // If not JSON, it's likely a 500 HTML error page
                console.error('Server returned non-JSON error:', text.slice(0, 200));
                // We want to fail here if it's 500
                expect(res.status).toBe(400);
            }
        } else {
            const data = await res.json();
            // Should not be ok
            expect(res.status).toBe(400);
        }
    });

    it('should reject mismatching session key / invalid proof', async () => {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                zkProof: { proof: [1, 2, 3], publicInputs: ['0x1', '0xsession', '0x2'] },
                sessionKey: 'mismatch'
            })
        });
        const text = await res.text();
        console.log('Invalid Proof Test Response:', res.status, text.slice(0, 200));

        expect([401, 500]).toContain(res.status);
    });
});
