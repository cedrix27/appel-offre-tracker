import { BREVO_ENDPOINT, BrevoMailProvider } from './brevo.provider';

describe('BrevoMailProvider', () => {
  const message = {
    to: ['a@example.com'],
    subject: 'Sujet',
    html: '<p>x</p>',
    text: 'x',
    category: 'VERIFY_EMAIL' as const,
  };
  const from = { name: 'SRC Digital', email: 'no-reply@example.com' };

  it('appelle l’API Brevo avec la clé et renvoie le messageId', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ messageId: '<abc@brevo>' }), {
        status: 201,
      }),
    );
    const provider = new BrevoMailProvider('cle-test', fetchFn);
    await expect(provider.send(message, from)).resolves.toEqual({
      messageId: '<abc@brevo>',
    });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(BREVO_ENDPOINT);
    expect((init.headers as Record<string, string>)['api-key']).toBe(
      'cle-test',
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      sender: from,
      to: [{ email: 'a@example.com' }],
      subject: 'Sujet',
    });
  });

  it('lève une erreur si Brevo refuse', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(new Response('unauthorized', { status: 401 }));
    const provider = new BrevoMailProvider('cle', fetchFn);
    await expect(provider.send(message, from)).rejects.toThrow(/401/);
  });
});
