const crypto = require('crypto');

const TOKEN_HEADER = { alg: 'HS256', typ: 'JWT' };
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.AUTH_TOKEN_SECRET) {
  throw new Error('AUTH_TOKEN_SECRET must be set when NODE_ENV=production');
}

const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'sentinelpharma-dev-secret';
const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 12);


const toBase64Url = (input) => {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

const fromBase64Url = (input) => {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  return Buffer.from(padded, 'base64').toString('utf8');
};

const signData = (data) => {
  return crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

const createToken = (payload) => {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  };

  const encodedHeader = toBase64Url(JSON.stringify(TOKEN_HEADER));
  const encodedPayload = toBase64Url(JSON.stringify(fullPayload));
  const signature = signData(`${encodedHeader}.${encodedPayload}`);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

const verifyToken = (token) => {
  if (!token || typeof token !== 'string') {
    throw new Error('Token is required');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed token');
  }

  const [encodedHeader, encodedPayload, providedSignature] = parts;
  const expectedSignature = signData(`${encodedHeader}.${encodedPayload}`);

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload));
  const now = Math.floor(Date.now() / 1000);

  if (!payload?.exp || payload.exp < now) {
    throw new Error('Token expired');
  }

  return payload;
};

module.exports = {
  createToken,
  verifyToken,
  TOKEN_TTL_SECONDS
};
