import { connect } from 'net';
import { OAuth2Client } from 'google-auth-library';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAuthUrl, escapeHtml, startLoopbackReceiver, type LoopbackReceiver } from '../../src/cli/init.js';

const STATE = 'expected-state';
let receiver: LoopbackReceiver | undefined;

afterEach(() => {
    receiver?.close();
    receiver = undefined;
});

/** Send a callback request; returns the status and HTML the browser would see. */
async function callback(params: Record<string, string>, path = '/callback') {
    const url = new URL(path, receiver!.redirectUri);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const res = await fetch(url);
    return { status: res.status, body: await res.text() };
}

describe('buildAuthUrl', () => {
    it('uses PKCE (S256), the given state, offline access and the loopback redirect', async () => {
        const client = new OAuth2Client({ clientId: 'id.apps.googleusercontent.com', clientSecret: 'secret', redirectUri: 'http://127.0.0.1:5555/callback' });
        const { authUrl, codeVerifier } = await buildAuthUrl(client, 'readonly', STATE);
        const params = new URL(authUrl).searchParams;

        expect(params.get('state')).toBe(STATE);
        expect(params.get('code_challenge_method')).toBe('S256');
        expect(params.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
        expect(params.get('code_challenge')).not.toBe(codeVerifier);
        expect(params.get('access_type')).toBe('offline');
        expect(params.get('redirect_uri')).toBe('http://127.0.0.1:5555/callback');
        expect(params.get('scope')).toBe('https://www.googleapis.com/auth/webmasters.readonly');
    });
});

describe('startLoopbackReceiver', () => {
    it('listens on 127.0.0.1 with a /callback redirect URI', async () => {
        receiver = await startLoopbackReceiver({ state: STATE });
        expect(receiver.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    });

    it('resolves with the code when the state matches', async () => {
        receiver = await startLoopbackReceiver({ state: STATE });
        const code = receiver.waitForCode();
        const res = await callback({ code: 'auth-code', state: STATE });
        expect(res.status).toBe(200);
        await expect(code).resolves.toBe('auth-code');
    });

    it('rejects a callback with the wrong state', async () => {
        receiver = await startLoopbackReceiver({ state: STATE });
        const code = receiver.waitForCode();
        const res = await callback({ code: 'auth-code', state: 'forged' });
        expect(res.status).toBe(400);
        await expect(code).rejects.toThrow(/state mismatch/i);
    });

    it('rejects a callback without a state', async () => {
        receiver = await startLoopbackReceiver({ state: STATE });
        const code = receiver.waitForCode();
        await callback({ code: 'auth-code' });
        await expect(code).rejects.toThrow(/state mismatch/i);
    });

    it('HTML-escapes the error value in the callback page', async () => {
        receiver = await startLoopbackReceiver({ state: STATE });
        const code = receiver.waitForCode();
        const res = await callback({ error: '<script>alert(1)</script>', state: STATE });
        expect(res.status).toBe(400);
        expect(res.body).not.toContain('<script>');
        expect(res.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        await expect(code).rejects.toThrow('OAuth error: <script>alert(1)</script>');
    });

    it('ignores other paths and requests without a code', async () => {
        receiver = await startLoopbackReceiver({ state: STATE });
        expect((await callback({ code: 'x', state: STATE }, '/favicon.ico')).status).toBe(404);
        expect((await callback({ state: STATE })).status).toBe(404);
        // still waiting for the real callback
        const code = receiver.waitForCode();
        await callback({ code: 'later', state: STATE });
        await expect(code).resolves.toBe('later');
    });

    it('times out', async () => {
        receiver = await startLoopbackReceiver({ state: STATE, timeoutMs: 20 });
        await expect(receiver.waitForCode()).rejects.toThrow(/timed out/i);
    });

    it('close() stops the server and drops open connections, so the CLI can exit', async () => {
        receiver = await startLoopbackReceiver({ state: STATE, timeoutMs: 60_000 });
        const { port } = new URL(receiver.redirectUri);
        // A connection with a request still in flight (headers not finished), which server.close()
        // alone would wait for
        const socket = connect(Number(port), '127.0.0.1');
        socket.on('error', () => undefined); // the server resetting it is the point
        await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
        socket.write('GET /callback HTTP/1.1\r\nHost: 127.0.0.1\r\n');
        await new Promise((resolve) => setTimeout(resolve, 20));
        const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));

        receiver.close();
        receiver = undefined;
        await closed;
        await expect(fetch(`http://127.0.0.1:${port}/callback?code=x&state=${STATE}`)).rejects.toThrow();
    });
});

describe('escapeHtml', () => {
    it('escapes HTML metacharacters', () => {
        expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    });
});
