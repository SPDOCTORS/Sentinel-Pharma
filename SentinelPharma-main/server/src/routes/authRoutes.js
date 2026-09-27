const express = require('express');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');

const { User } = require('../models');
const { cache, redisClient } = require('../utils/redis');
const { createToken, TOKEN_TTL_SECONDS } = require('../utils/authToken');
const { requireAuth, revokeToken, getTokenFromRequest } = require('../middleware/auth');
const { authFailuresTotal } = require('../utils/metrics');

const router = express.Router();

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeMobile = (mobile) => String(mobile || '').replace(/\D/g, '');
const DEFAULT_ROLE = 'researcher';
const ALLOWED_ROLES = new Set(['researcher', 'analyst', 'admin', 'viewer']);
const OTP_TTL_SECONDS = Number(process.env.AUTH_OTP_TTL_SECONDS || 300);
const OTP_MAX_ATTEMPTS = Number(process.env.AUTH_OTP_MAX_ATTEMPTS || 5);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID || undefined);

const maskEmail = (email = '') => {
  const [user = '', domain = ''] = email.split('@');
  if (!user || !domain) return '***';
  const safeUser = user.length <= 2 ? `${user[0] || '*'}*` : `${user.slice(0, 2)}***`;
  return `${safeUser}@${domain}`;
};

const maskMobile = (mobile = '') => {
  if (mobile.length < 4) return '***';
  return `${'*'.repeat(Math.max(0, mobile.length - 4))}${mobile.slice(-4)}`;
};

const getOtpKey = (channel, destination) => `otp:${channel}:${destination}`;
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const getUserByIdentifier = async ({ email, mobile, id }) => {
  if (id) return User.findById(id);
  const clauses = [];
  if (email) clauses.push({ email });
  if (mobile) clauses.push({ mobile });
  if (!clauses.length) return null;
  return User.findOne({ $or: clauses });
};

const toPublicUser = (user) => ({
  id: String(user._id || user.id),
  email: user.email || '',
  mobile: user.mobile || '',
  name: user.name,
  role: user.role,
  organization: user.organization || '',
  avatarUrl: user.avatarUrl || ''
});

const issueToken = (user) => createToken({
  sub: String(user._id),
  email: user.email || '',
  mobile: user.mobile || '',
  name: user.name,
  role: user.role
});

const saveOtpChallenge = async (key, challenge) => {
  if (!redisClient.isReady) {
    throw new Error('Redis is required for OTP storage but is not connected');
  }
  await cache.set(key, challenge, OTP_TTL_SECONDS);
};

router.post('/request-otp', async (req, res) => {
  const channel = String(req.body?.channel || '').trim().toLowerCase();
  const purpose = String(req.body?.purpose || 'signin').trim().toLowerCase();
  const email = normalizeEmail(req.body?.email);
  const mobile = normalizeMobile(req.body?.mobile);
  const name = String(req.body?.name || '').trim();
  const role = DEFAULT_ROLE;
  const organization = String(req.body?.organization || '').trim();

  if (!['email', 'sms'].includes(channel)) {
    return res.status(400).json({ success: false, error: 'Channel must be "email" or "sms"' });
  }

  const destination = channel === 'email' ? email : mobile;
  if (!destination) {
    return res.status(400).json({
      success: false,
      error: channel === 'email' ? 'Email is required' : 'Mobile number is required'
    });
  }

  const existing = await getUserByIdentifier({ email, mobile });
  if (purpose === 'signin' && !existing) {
    return res.status(404).json({
      success: false,
      error: 'Account not found. Please sign up first.'
    });
  }

  const otp = generateOtp();
  try {
    await saveOtpChallenge(getOtpKey(channel, destination), {
      otp,
      attempts: 0,
      purpose,
      profile: { name, role, organization, email, mobile }
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      error: 'OTP service unavailable',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Try again later'
    });
  }

  const maskedDestination = channel === 'email' ? maskEmail(destination) : maskMobile(destination);
  console.log(`[OTP:${channel.toUpperCase()}] challenge created for ${maskedDestination}`);

  return res.status(200).json({
    success: true,
    message: `OTP sent via ${channel === 'email' ? 'email' : 'SMS'}`,
    delivery: {
      channel,
      destination: maskedDestination,
      expiresIn: OTP_TTL_SECONDS,
      storage: 'redis-ttl'
    },
    otpPreview: process.env.NODE_ENV === 'development' && process.env.AUTH_EXPOSE_OTP_PREVIEW === 'true'
      ? otp
      : undefined
  });
});

router.post('/verify-otp', async (req, res) => {
  const channel = String(req.body?.channel || '').trim().toLowerCase();
  const purpose = String(req.body?.purpose || 'signin').trim().toLowerCase();
  const email = normalizeEmail(req.body?.email);
  const mobile = normalizeMobile(req.body?.mobile);
  const otp = String(req.body?.otp || '').trim();
  const name = String(req.body?.name || '').trim();
  const role = DEFAULT_ROLE;
  const organization = String(req.body?.organization || '').trim();

  if (!['email', 'sms'].includes(channel)) {
    return res.status(400).json({ success: false, error: 'Channel must be "email" or "sms"' });
  }
  if (!otp || otp.length < 4) {
    return res.status(400).json({ success: false, error: 'OTP is required' });
  }

  const destination = channel === 'email' ? email : mobile;
  if (!destination) {
    return res.status(400).json({
      success: false,
      error: channel === 'email' ? 'Email is required' : 'Mobile number is required'
    });
  }

  const challengeKey = getOtpKey(channel, destination);
  if (!redisClient.isReady) {
    return res.status(503).json({
      success: false,
      error: 'OTP service unavailable',
      message: 'Redis is not connected'
    });
  }

  const challenge = await cache.get(challengeKey);
  if (!challenge) {
    return res.status(400).json({ success: false, error: 'No OTP request found or OTP expired. Request a new OTP.' });
  }
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await cache.del(challengeKey);
    return res.status(429).json({ success: false, error: 'Too many failed attempts. Request a new OTP.' });
  }
  if (challenge.otp !== otp) {
    challenge.attempts += 1;
    await saveOtpChallenge(challengeKey, challenge);
    return res.status(401).json({ success: false, error: 'Invalid OTP' });
  }

  let user = await getUserByIdentifier({ email, mobile });
  if (!user && purpose === 'signin') {
    return res.status(404).json({ success: false, error: 'Account not found. Please sign up first.' });
  }

  if (!user) {
    user = new User({
      email: email || '',
      mobile: mobile || '',
      name: name || challenge.profile?.name || (email ? email.split('@')[0] : `user_${mobile.slice(-4)}`),
      role,
      organization: organization || challenge.profile?.organization || '',
      passwordHash: null,
      authProvider: 'otp'
    });
  } else {
    user.name = name || user.name;
    user.organization = organization || user.organization || '';
    if (!user.email && email) user.email = email;
    if (!user.mobile && mobile) user.mobile = mobile;
    if (purpose === 'signup') user.role = role || user.role;
    user.authProvider = user.authProvider || 'otp';
  }

  user.lastLogin = new Date();
  await user.save();
  await cache.del(challengeKey);

  const token = issueToken(user);
  return res.status(200).json({
    success: true,
    token,
    expiresIn: TOKEN_TTL_SECONDS,
    user: toPublicUser(user)
  });
});

router.post('/google', async (req, res) => {
  const credential = String(req.body?.credential || '').trim();
  const role = DEFAULT_ROLE;

  if (!credential) {
    return res.status(400).json({ success: false, error: 'Google credential is required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID || undefined
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      return res.status(400).json({ success: false, error: 'Google account email is not available' });
    }
    if (payload.email_verified === false) {
      return res.status(401).json({ success: false, error: 'Google email is not verified' });
    }

    const email = normalizeEmail(payload.email);
    let user = await getUserByIdentifier({ email });

    if (!user) {
      user = new User({
        email,
        mobile: '',
        name: String(payload.name || email.split('@')[0] || 'Google User').trim(),
        role,
        organization: '',
        passwordHash: null,
        authProvider: 'google',
        avatarUrl: String(payload.picture || '')
      });
    } else {
      user.name = String(payload.name || user.name).trim() || user.name;
      user.authProvider = 'google';
      if (payload.picture) user.avatarUrl = String(payload.picture);
    }

    user.lastLogin = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      token: issueToken(user),
      expiresIn: TOKEN_TTL_SECONDS,
      user: toPublicUser(user)
    });
  } catch (error) {
    authFailuresTotal.labels('invalid_google_token').inc();
    return res.status(401).json({ success: false, error: 'Google authentication failed' });
  }
});

router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const mobile = normalizeMobile(req.body?.mobile);
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim();
  const requestedRole = String(req.body?.role || DEFAULT_ROLE).trim() || DEFAULT_ROLE;
  const role = ALLOWED_ROLES.has(requestedRole) ? requestedRole : DEFAULT_ROLE;
  const organization = String(req.body?.organization || '').trim();

  if ((!email && !mobile) || !password) {
    authFailuresTotal.labels('missing_credentials').inc();
    return res.status(400).json({ success: false, error: 'Email or mobile and password are required' });
  }

  try {
    let user = await getUserByIdentifier({ email, mobile });

    if (user) {
      if (!user.passwordHash) {
        return res.status(400).json({
          success: false,
          error: 'This account uses OTP or Google login. Please continue with that method.'
        });
      }
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        authFailuresTotal.labels('invalid_credentials').inc();
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }
    } else {
      user = new User({
        email: email || '',
        mobile: mobile || '',
        name: name || (email ? email.split('@')[0] : `user_${mobile.slice(-4)}`),
        role,
        organization,
        passwordHash: await bcrypt.hash(password, 12),
        authProvider: 'password'
      });
    }

    user.lastLogin = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      token: issueToken(user),
      expiresIn: TOKEN_TTL_SECONDS,
      user: toPublicUser(user)
    });
  } catch (err) {
    authFailuresTotal.labels('auth_exception').inc();
    return res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? err.message : 'Authentication failed'
    });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await getUserByIdentifier({ id: req.user.id });
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  return res.status(200).json({
    success: true,
    user: toPublicUser(user)
  });
});

router.post('/logout', requireAuth, async (req, res) => {
  const token = req.authToken || getTokenFromRequest(req);
  await revokeToken(token);
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;
