import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, Activity, FlaskConical, Lock, ShieldAlert } from 'lucide-react';

import { useAuth } from '../context/AuthContext';

const THERAPY_ARTWORK_SOURCES = [
  '/auth/therapy-icon.png',
  '/auth/therapy-icon.webp',
  '/auth/therapy-icon.jpg',
  '/auth/therapy-icon.jpeg',
  '/auth/therapy-icon.svg'
];

const DISEASE_ARTWORK_SOURCES = [
  '/auth/disease-risk-icon.png',
  '/auth/disease-risk-icon.webp',
  '/auth/disease-risk-icon.jpg',
  '/auth/disease-risk-icon.jpeg',
  '/auth/disease-risk-icon.svg'
];

const TherapyGlyph = () => (
  <svg viewBox="0 0 240 170" className="w-full h-full" aria-hidden="true">
    <g fill="#0f172a">
      <circle cx="72" cy="52" r="20" />
      <circle cx="104" cy="75" r="20" />
      <rect x="126" y="36" width="42" height="20" rx="10" />
      <rect x="154" y="98" width="18" height="54" rx="3" transform="rotate(45 163 125)" />
      <rect x="141" y="86" width="20" height="54" rx="3" transform="rotate(45 151 113)" />
      <rect x="130" y="122" width="22" height="4" rx="2" transform="rotate(45 141 124)" fill="#f8fafc" />
      <rect x="122" y="114" width="22" height="4" rx="2" transform="rotate(45 133 116)" fill="#f8fafc" />
      <rect x="114" y="106" width="22" height="4" rx="2" transform="rotate(45 125 108)" fill="#f8fafc" />
      <line x1="60" y1="39" x2="84" y2="64" stroke="#f8fafc" strokeWidth="4" />
      <line x1="92" y1="62" x2="116" y2="88" stroke="#f8fafc" strokeWidth="4" />
    </g>
  </svg>
);

const DiseaseRiskGlyph = () => (
  <svg viewBox="0 0 240 170" className="w-full h-full" aria-hidden="true">
    <g fill="none" stroke="#0f172a" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="74" cy="58" r="28" />
      <line x1="74" y1="20" x2="74" y2="10" />
      <line x1="74" y1="106" x2="74" y2="116" />
      <line x1="36" y1="58" x2="26" y2="58" />
      <line x1="112" y1="58" x2="122" y2="58" />
      <line x1="47" y1="31" x2="40" y2="24" />
      <line x1="101" y1="31" x2="108" y2="24" />
      <line x1="47" y1="85" x2="40" y2="92" />
      <line x1="101" y1="85" x2="108" y2="92" />
      <circle cx="74" cy="58" r="10" />
      <circle cx="89" cy="68" r="3" fill="#0f172a" />
      <circle cx="60" cy="47" r="3" fill="#0f172a" />
      <path d="M152 122l30-52a6 6 0 0 1 10 0l30 52a6 6 0 0 1-5 9h-60a6 6 0 0 1-5-9z" />
      <line x1="187" y1="86" x2="187" y2="112" />
      <circle cx="187" cy="120" r="2.8" fill="#0f172a" />
      <ellipse cx="146" cy="46" rx="11" ry="7" />
      <ellipse cx="160" cy="86" rx="8" ry="5" />
      <ellipse cx="132" cy="95" rx="6" ry="4" />
    </g>
  </svg>
);

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, googleLogin, isLoading } = useAuth();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [infoMessage, setInfoMessage] = useState('');
  const [error, setError] = useState('');

  const [therapyImageIdx, setTherapyImageIdx] = useState(0);
  const [diseaseImageIdx, setDiseaseImageIdx] = useState(0);
  const [therapyImageMissing, setTherapyImageMissing] = useState(false);
  const [diseaseImageMissing, setDiseaseImageMissing] = useState(false);

  const ensureGoogleScript = useCallback(() => new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.querySelector('script[data-google-identity="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google sign-in script')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google sign-in script'));
    document.head.appendChild(script);
  }), []);

  const handleGoogleLogin = useCallback(async () => {
    try {
      setError('');
      setInfoMessage('');

      if (!googleClientId) {
        throw new Error('Google OAuth is not configured. Set VITE_GOOGLE_CLIENT_ID.');
      }

      await ensureGoogleScript();

      if (!window.google?.accounts?.id) {
        throw new Error('Google sign-in is unavailable in this browser.');
      }

      await new Promise((resolve, reject) => {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            try {
              await googleLogin({
                credential: response?.credential,
                role: 'researcher',
                rememberMe
              });
              resolve();
            } catch (authError) {
              reject(authError);
            }
          }
        });

        window.google.accounts.id.prompt((notification) => {
          if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
            reject(new Error('Google sign-in prompt was dismissed. Try again.'));
          }
        });
      });

      navigate('/');
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Google login failed');
    }
  }, [ensureGoogleScript, googleClientId, googleLogin, navigate, rememberMe]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    try {
      await login({
        email,
        password,
        name: isSignup ? name : '',
        role: 'researcher',
        rememberMe
      });
      navigate('/');
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Unable to sign in');
    }
  };

  const handleForgotPassword = () => {
    if (!email.trim()) {
      setError('Enter your email first to receive a reset link.');
      setInfoMessage('');
      return;
    }
    setError('');
    setInfoMessage(`Password reset link sent to ${email.trim()}.`);
  };

  const theme = useMemo(() => ({
    section: 'bg-slate-950/45 border-r border-cyan-300/20',
    badge: 'border-cyan-300/30 bg-slate-900/45 text-cyan-100',
    title: 'text-cyan-50',
    subtitle: 'text-cyan-100/75',
    toggleWrap: 'border-cyan-300/25 bg-slate-900/35',
    toggleActive: 'bg-cyan-500/25 text-cyan-50 border border-cyan-300/35',
    toggleInactive: 'text-cyan-100/70 hover:text-cyan-50',
    label: 'text-cyan-100/85',
    input: 'border-cyan-300/30 bg-slate-900/55 text-cyan-50 placeholder:text-cyan-100/35 focus:ring-cyan-300/60',
    hint: 'text-cyan-100/80',
    forgot: 'text-cyan-100/80 hover:text-cyan-50',
    info: 'border-cyan-300/35 bg-cyan-500/15 text-cyan-100',
    error: 'border-rose-300/35 bg-rose-500/15 text-rose-100',
    submit: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950',
    google: 'border-cyan-300/30 bg-slate-900/35 text-cyan-100 hover:bg-slate-800/60',
    footerText: 'text-cyan-100/75',
    footerLink: 'text-cyan-50',
    notes: 'border-cyan-300/25 bg-slate-900/45 text-cyan-100/80',
    notesTitle: 'text-cyan-50',
    notesIcon: 'text-cyan-300',
    panelBadge: 'bg-slate-900/70 text-emerald-200 border-emerald-300/40',
    panelShell: 'bg-slate-900/35 border-cyan-300/25',
    panelStat: 'bg-slate-900/55 border-cyan-300/25',
    panelStatTitle: 'text-cyan-100/80',
    panelStatText: 'text-cyan-50',
    panelStatSub: 'text-cyan-100/65',
    panelCallout: 'bg-slate-900/60 border-cyan-300/25 text-cyan-50',
    panelCalloutIcon: 'text-emerald-300',
    panelAlert: 'border-rose-300/35 bg-rose-500/15 text-rose-100'
  }), []);

  return (
    <div className="auth-shell min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-6xl auth-card rounded-[28px] overflow-hidden grid lg:grid-cols-2">
        <section className={`px-6 md:px-12 py-10 md:py-14 ${theme.section}`}>
          <div className="max-w-md mx-auto">
            <div className={`inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wide ${theme.badge}`}>
              <FlaskConical className="w-3.5 h-3.5 text-cyan-200" />
              SentinelPharma Access
            </div>

            <h1 className={`text-4xl md:text-5xl font-extrabold tracking-tight ${theme.title}`}>Welcome Back</h1>
            <p className={`mt-4 text-base leading-relaxed ${theme.subtitle}`}>
              Enter your email and password to access your account.
            </p>

            <div className={`mt-6 grid grid-cols-2 gap-2 rounded-full border p-1 ${theme.toggleWrap}`}>
              <button
                type="button"
                onClick={() => {
                  setIsSignup(false);
                  setError('');
                  setInfoMessage('');
                }}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition ${!isSignup ? theme.toggleActive : theme.toggleInactive}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignup(true);
                  setError('');
                  setInfoMessage('');
                }}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition ${isSignup ? theme.toggleActive : theme.toggleInactive}`}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="login-email" className={`text-sm font-medium ${theme.label}`}>Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className={`mt-2 w-full rounded-2xl border px-5 py-3.5 focus:outline-none focus:ring-2 ${theme.input}`}
                  required
                />
              </div>

              {isSignup && (
                <div>
                  <label htmlFor="login-name" className={`text-sm font-medium ${theme.label}`}>Name</label>
                  <input
                    id="login-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className={`mt-2 w-full rounded-2xl border px-5 py-3.5 focus:outline-none focus:ring-2 ${theme.input}`}
                    required={isSignup}
                  />
                </div>
              )}

              <div>
                <label htmlFor="login-password" className={`text-sm font-medium ${theme.label}`}>Password</label>
                <div className="relative mt-2">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className={`w-full rounded-2xl border px-5 py-3.5 pr-12 focus:outline-none focus:ring-2 ${theme.input}`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-100/60 hover:text-cyan-100"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className={`inline-flex items-center gap-2 cursor-pointer ${theme.hint}`}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-cyan-300/40 bg-slate-900/50 text-cyan-300 focus:ring-cyan-300/50"
                  />
                  Remember me
                </label>
                <button type="button" onClick={handleForgotPassword} className={theme.forgot}>
                  Forgot Password
                </button>
              </div>

              {infoMessage && (
                <div className={`rounded-xl border px-4 py-2 text-sm ${theme.info}`}>
                  {infoMessage}
                </div>
              )}

              {error && (
                <div className={`rounded-xl border px-4 py-2 text-sm ${theme.error}`}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full rounded-2xl py-3.5 font-semibold transition-colors disabled:opacity-60 ${theme.submit}`}
              >
                {isLoading ? 'Please wait...' : isSignup ? 'Sign Up' : 'Sign In'}
              </button>

              <button
                type="button"
                className={`w-full rounded-2xl border py-3.5 font-medium transition-colors ${theme.google}`}
                onClick={handleGoogleLogin}
              >
                Sign In with Google
              </button>
            </form>

            <p className={`mt-8 text-sm text-center ${theme.footerText}`}>
              {isSignup ? 'Already have an account?' : 'Don\'t have an account?'}{' '}
              <button
                type="button"
                onClick={() => setIsSignup((v) => !v)}
                className={`font-semibold ${theme.footerLink}`}
              >
                {isSignup ? 'Sign In' : 'Sign Up'}
              </button>
            </p>

            <div className={`mt-6 rounded-xl border p-3.5 text-xs ${theme.notes}`}>
              <p className={`inline-flex items-center gap-1.5 font-semibold ${theme.notesTitle}`}>
                <Lock className={`w-3.5 h-3.5 ${theme.notesIcon}`} />
                Enterprise Security Notes
              </p>
              <p className="mt-1.5">Session traffic is authenticated using signed bearer tokens. {rememberMe ? 'Persistent session is enabled.' : 'Session persists for this tab lifecycle.'}</p>
            </div>
          </div>
        </section>

        <section className="relative auth-visual-panel p-6 md:p-10 flex items-center justify-center">
          <div className={`absolute top-6 right-6 px-3 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1 ${theme.panelBadge}`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            Secure Pharma Login
          </div>

          <div className={`w-full max-w-xl rounded-[26px] border p-6 md:p-8 shadow-inner ${theme.panelShell}`}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className={`rounded-2xl border p-3 ${theme.panelStat}`}>
                <p className={`text-[11px] uppercase tracking-wide font-semibold ${theme.panelStatTitle}`}>Therapy Signals</p>
                <p className={`text-sm font-semibold mt-1 ${theme.panelStatText}`}>Portfolio ready</p>
                <p className={`text-xs ${theme.panelStatSub}`}>Curated molecule workspace is available</p>
              </div>
              <div className={`rounded-2xl border p-3 ${theme.panelStat}`}>
                <p className={`text-[11px] uppercase tracking-wide font-semibold ${theme.panelStatTitle}`}>Risk Alerts</p>
                <p className={`text-sm font-semibold mt-1 ${theme.panelStatText}`}>Monitoring active</p>
                <p className={`text-xs ${theme.panelStatSub}`}>Disease warning intelligence is enabled</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="auth-glyph-card">
                <div className="auth-glyph-frame">
                  {!therapyImageMissing ? (
                    <img
                      src={THERAPY_ARTWORK_SOURCES[therapyImageIdx]}
                      alt="Therapy assets icon"
                      className="max-h-full max-w-full object-contain p-3"
                      onError={() => {
                        const next = therapyImageIdx + 1;
                        if (next < THERAPY_ARTWORK_SOURCES.length) {
                          setTherapyImageIdx(next);
                          return;
                        }
                        setTherapyImageMissing(true);
                      }}
                    />
                  ) : (
                    <TherapyGlyph />
                  )}
                </div>
                <h3 className="auth-glyph-title">Therapy Assets</h3>
                <p className="auth-glyph-copy">Tablet and injectable treatment modalities in one discovery stack.</p>
              </div>

              <div className="auth-glyph-card">
                <div className="auth-glyph-frame">
                  {!diseaseImageMissing ? (
                    <img
                      src={DISEASE_ARTWORK_SOURCES[diseaseImageIdx]}
                      alt="Disease risk icon"
                      className="max-h-full max-w-full object-contain p-3"
                      onError={() => {
                        const next = diseaseImageIdx + 1;
                        if (next < DISEASE_ARTWORK_SOURCES.length) {
                          setDiseaseImageIdx(next);
                          return;
                        }
                        setDiseaseImageMissing(true);
                      }}
                    />
                  ) : (
                    <DiseaseRiskGlyph />
                  )}
                </div>
                <h3 className="auth-glyph-title">Disease Risk Signals</h3>
                <p className="auth-glyph-copy">Pathogen and adverse-risk cues mapped for smarter repurposing decisions.</p>
              </div>
            </div>

            <div className={`mt-5 rounded-2xl border p-4 text-center ${theme.panelCallout}`}>
              <div className="inline-flex items-center gap-2 font-semibold"><Activity className={`w-4 h-4 ${theme.panelCalloutIcon}`} /> Make discovery faster with SentinelPharma</div>
            </div>

            <div className={`mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${theme.panelAlert}`}>
              <ShieldAlert className="w-3.5 h-3.5" />
              Disease warning intelligence integrated with therapy screening
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
