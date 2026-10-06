const { OtpStore } = require('../src/utils/otpStore');

describe('OTP challenge store', () => {
  test('uses TTL-enforced memory storage when the development fallback is enabled', async () => {
    let now = 1_000;
    const client = { isReady: false };
    const store = new OtpStore({
      client,
      allowMemoryFallback: true,
      now: () => now
    });

    expect(store.getStatus()).toEqual({ available: true, mode: 'memory', durable: false });
    await expect(store.set('otp:email:user@example.com', { otp: '123456' }, 5))
      .resolves.toBe('memory');
    await expect(store.get('otp:email:user@example.com'))
      .resolves.toEqual({ otp: '123456' });

    now += 5_000;
    await expect(store.get('otp:email:user@example.com')).resolves.toBeNull();
  });

  test('fails closed without Redis when the fallback is disabled', async () => {
    const store = new OtpStore({ client: { isReady: false } });

    expect(store.getStatus()).toEqual({ available: false, mode: 'unavailable', durable: false });
    await expect(store.set('otp:key', { otp: '123456' }, 5))
      .rejects.toThrow('Redis is required');
    await expect(store.get('otp:key')).rejects.toThrow('Redis is required');
  });

  test('uses Redis when connected', async () => {
    const client = {
      isReady: true,
      setEx: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(JSON.stringify({ otp: '654321' })),
      del: jest.fn().mockResolvedValue(1)
    };
    const store = new OtpStore({ client, allowMemoryFallback: true });

    await expect(store.set('otp:key', { otp: '654321' }, 30)).resolves.toBe('redis');
    await expect(store.get('otp:key')).resolves.toEqual({ otp: '654321' });
    await store.delete('otp:key');

    expect(client.setEx).toHaveBeenCalledWith('otp:key', 30, JSON.stringify({ otp: '654321' }));
    expect(client.del).toHaveBeenCalledWith('otp:key');
  });
});
