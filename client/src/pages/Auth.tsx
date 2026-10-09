/**
 * Auth screens: login / register / forgot-password / reset-password.
 * Restyled on the Astryx `login-split` template: a two-pane split card —
 * a form section on one side, a brand pane on the other.
 *
 * All auth logic (4 modes, validation, handlers, API calls, redirects,
 * error handling) is unchanged from the previous revision; this file is
 * styling/structure only.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
// Astryx building blocks, per the login-split template.
import { VStack } from '@astryxdesign/core/Layout';
import { Center } from '@astryxdesign/core/Center';
import { Text } from '@astryxdesign/core/Text';
import { Icon as AstryxIcon } from '@astryxdesign/core/Icon';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button as AstryxButton } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
// Lucide glyphs double as Astryx TextInput startIcon components (the prop
// accepts any SVG component) and as the circular social buttons.
import { Lock, Mail, User as UserIcon } from 'lucide-react';
// App pieces: custom form controls and shared helpers stay as-is.
import { Input, Field, ErrorState, Icon, toast } from '../components/ui';
import { PageTransition } from '../components/PageTransition';
import { fadeOnly, springDefault, usePrefersReducedMotion } from '../lib/motion';
import { useAuth } from '../context/AuthContext';
import { authApi, toApiError } from '../lib/api';
// NOTE: from src/pages/ the logo asset resolves as '../assets/logo.svg'
// (AppShell's '../../assets/logo.svg' is relative to src/components/layout/).
import logoUrl from '../assets/logo.svg';

type AuthProps = { mode: 'login' | 'register' | 'forgot' | 'reset' };

// ------------------------------------------------- template layout pieces --
const pageStyle: CSSProperties = {
  minHeight: '100%',
  backgroundColor: 'var(--color-background-body)',
};
const pageWrap: CSSProperties = {
  width: '100%',
  maxWidth: 1180,
  marginInline: 'auto',
};

// The container query lives in a plain <style> tag so it needs NO CSS compiler.
// Below ~900px the brand panel drops away and the form takes the full width.
const AUTH_SPLIT_CSS = `
.auth-split {
  container-type: inline-size;
  container-name: auth-split;
  width: 100%;
  max-width: 1120px;
  margin-inline: auto;
}
@container auth-split (max-width: 899px) {
  .auth-brand-panel {
    display: none;
  }
}
`;

// ------------------------------------------------------------------ icons --
function EyeIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function EyeOffIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
}

// -------------------------------------------------------------- validation -
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_CHECKS: { id: string; label: string; test: (v: string) => boolean }[] = [
  { id: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'One number', test: (v) => /[0-9]/.test(v) },
  { id: 'special', label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const passwordError = (v: string): string | null => PASSWORD_CHECKS.find((c) => !c.test(v))?.label ?? null;

function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="mt-2 space-y-1" aria-live="polite">
      {PASSWORD_CHECKS.map((c) => {
        const ok = c.test(value);
        return (
          <li key={c.id} className={`flex items-center gap-2 text-xs ${ok ? 'text-[#374c36] dark:text-emerald-400' : 'text-stone-500 dark:text-stone-400'}`}>
            <Icon name={ok ? 'check' : 'x'} className="h-3.5 w-3.5" />
            {c.label}
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------- brand pane --
// Brand pane: dark rounded panel with the robot-shield mark, a welcome
// headline, product copy, and a floating glass stat card. No fabricated
// social proof — everything shown is the product's real positioning.
function BrandPane() {
  return (
    <div className="auth-brand-panel relative min-h-[640px] overflow-hidden rounded-[28px] bg-[#131316] text-white">
      {/* soft radial glow behind the mark */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 right-[-80px] h-[420px] w-[420px] rounded-full opacity-25"
        style={{ background: 'radial-gradient(circle, #3a3a44 0%, transparent 70%)' }}
      />
      <div className="relative flex h-full flex-col p-10 lg:p-12">
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="Consistency Guard logo" className="h-12 w-12 rounded-2xl object-cover shadow-lg" />
          <span className="font-display text-xl font-bold tracking-tight">Consistency Guard</span>
        </div>

        <h2 className="mt-16 font-display text-[42px] font-bold leading-[1.08] tracking-tight text-white">
          Welcome to
          <br />
          Consistency Guard
        </h2>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-stone-400">
          Consistency Guard measures AI reliability with consistency testing across models and evidence-backed fact
          verification, so you can ship AI features you actually trust.
        </p>

        <div className="mt-auto pt-10">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.06] p-7 backdrop-blur-sm">
            <p className="font-display text-[26px] font-bold leading-snug tracking-tight text-white">
              Evaluate. Compare.
              <br />
              Trust AI.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-stone-400">
              Cross-model consistency scoring, evidence-backed fact verification, and prompt quality intelligence — in
              one live platform.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ form pieces --
function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border border-[#ebcec9] bg-[#f9dcd7] px-4 py-3 text-sm text-[#58413e] dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
      {message}
    </div>
  );
}

// Circular social sign-in buttons (reference design). OAuth is not wired in
// this build: clicking toasts an honest "not configured" note and the
// aria-label says coming soon — never a fake working button.
function GoogleGlyph({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.61z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function GitHubGlyph({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function MicrosoftGlyph({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022" />
      <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00" />
      <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900" />
    </svg>
  );
}

function SocialButton({ name, onClick, children }: { name: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${name} sign-in (coming soon)`}
      title={`${name} (coming soon)`}
      className="cg-press flex h-14 w-14 items-center justify-center rounded-full bg-white text-stone-800 shadow-sm ring-1 ring-black/[0.06] transition hover:shadow-md dark:bg-stone-900 dark:text-stone-200 dark:ring-white/10"
    >
      {children}
    </button>
  );
}

function SocialRow({ onOAuth }: { onOAuth: () => void }) {
  return (
    <div className="flex items-center gap-5">
      <SocialButton name="Google" onClick={onOAuth}>
        <GoogleGlyph />
      </SocialButton>
      <SocialButton name="GitHub" onClick={onOAuth}>
        <GitHubGlyph />
      </SocialButton>
      <SocialButton name="Microsoft" onClick={onOAuth}>
        <MicrosoftGlyph />
      </SocialButton>
    </div>
  );
}

// Password field with show/hide toggle. Kept as the app's custom control
// (Field + Input) rather than Astryx TextInput: TextInput has no trailing
// toggle slot, and an absolutely-positioned overlay would collide with its
// error status icon.
function PasswordInput({
  id,
  label,
  value,
  onChange,
  error,
  autoComplete,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete: string;
  describedBy?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} error={error} htmlFor={id}>
      <div className="relative">
        <Lock
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-stone-400 dark:text-stone-500"
        />
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="pl-11"
        />
        <button
          type="button"
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={() => setShow((v) => !v)}
          className="hit-pad absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </Field>
  );
}

// ------------------------------------------------------------------- login -
function LoginFormView() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email';
    if (!password) next.password = 'Password is required';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setFormError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password, remember);
      const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      const apiError = toApiError(err);
      setFormError(
        apiError.status === 429
          ? 'Too many attempts — account temporarily locked. Try again shortly.'
          : apiError.message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const oauthSoon = () => toast('OAuth is not configured in this build', { tone: 'info' });

  return (
    <VStack gap={5} hAlign="stretch" width="100%">
      <Text type="display-1" as="h1">
        Sign in
      </Text>

      <FormError message={formError} />

      <form onSubmit={onSubmit} noValidate>
        <VStack gap={4} hAlign="stretch" width="100%">
          <TextInput
            label="Email Address"
            type="email"
            placeholder="Johndoe@gmail.com"
            value={email}
            onChange={setEmail}
            size="lg"
            autoComplete="email"
            startIcon={Mail}
            status={errors.email ? { type: 'error', message: errors.email } : undefined}
          />

          <PasswordInput
            id="login-password"
            label="Password"
            value={password}
            onChange={setPassword}
            error={errors.password}
            autoComplete="current-password"
          />

          <CheckboxInput label="Remember me" value={remember} onChange={(checked) => setRemember(checked)} />

          <AstryxButton label="Sign in" variant="primary" size="lg" type="submit" isLoading={submitting} width="100%" />
        </VStack>
      </form>

      <VStack gap={1} hAlign="stretch" width="100%">
        <Text type="supporting" color="secondary">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-stone-900 hover:underline dark:text-stone-100">
            Sign up
          </Link>
        </Text>
        <Link to="/forgot-password" className="text-sm font-medium text-stone-900 hover:underline dark:text-stone-100">
          Forgot Password
        </Link>
      </VStack>

      <SocialRow onOAuth={oauthSoon} />
    </VStack>
  );
}

// ---------------------------------------------------------------- register -
function RegisterFormView() {
  const { register: signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = 'Name must be at least 2 characters';
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email';
    const pwErr = passwordError(password);
    if (pwErr) next.password = `Password must have ${pwErr.toLowerCase()}`;
    if (confirm !== password) next.confirm = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setFormError(null);
    setSubmitting(true);
    try {
      await signup(name.trim(), email.trim(), password, confirm);
      toast('Account created', { tone: 'success' });
      navigate('/evaluate/models', { replace: true });
    } catch (err) {
      setFormError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const oauthSoon = () => toast('OAuth is not configured in this build', { tone: 'info' });

  return (
    <VStack gap={4} hAlign="stretch" width="100%">
      <VStack gap={1}>
        <Text type="display-1" as="h1">
          Create your account
        </Text>
        <Text type="body" color="secondary" size="sm">
          Start evaluating AI reliability in minutes.
        </Text>
      </VStack>

      <FormError message={formError} />

      <form onSubmit={onSubmit} noValidate>
        <VStack gap={4} hAlign="stretch" width="100%">
          <TextInput
            label="Full name"
            type="text"
            placeholder="Ada Lovelace"
            value={name}
            onChange={setName}
            size="lg"
            autoComplete="name"
            startIcon={UserIcon}
            status={errors.name ? { type: 'error', message: errors.name } : undefined}
          />

          <TextInput
            label="Email Address"
            type="email"
            placeholder="Johndoe@gmail.com"
            value={email}
            onChange={setEmail}
            size="lg"
            autoComplete="email"
            startIcon={Mail}
            status={errors.email ? { type: 'error', message: errors.email } : undefined}
          />

          <VStack gap={1} hAlign="stretch" width="100%">
            <PasswordInput
              id="register-password"
              label="Password"
              value={password}
              onChange={setPassword}
              error={errors.password}
              autoComplete="new-password"
              describedBy="password-requirements"
            />
            <div id="password-requirements">
              <PasswordChecklist value={password} />
            </div>
          </VStack>

          <TextInput
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            size="lg"
            autoComplete="new-password"
            status={errors.confirm ? { type: 'error', message: errors.confirm } : undefined}
          />

          <AstryxButton label="Create account" variant="primary" size="lg" type="submit" isLoading={submitting} width="100%" />
        </VStack>
      </form>

      <SocialRow onOAuth={oauthSoon} />

      <Text type="supporting" color="secondary">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-stone-900 hover:underline dark:text-stone-100">
          Sign in
        </Link>
      </Text>
    </VStack>
  );
}

// ----------------------------------------------------------------- forgot -
function ForgotFormView() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Enter a valid email');
      return;
    }
    setEmailError(undefined);
    setFormError(null);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setFormError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <VStack gap={4} hAlign="center" width="100%">
        <EmptyState
          title="Check your inbox"
          description="If an account exists for that email, we've sent a password reset link. It expires in 60 minutes."
          icon={<AstryxIcon icon={CheckCircleIcon} size="lg" />}
        />
        <Link to="/login" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
          Back to login
        </Link>
      </VStack>
    );
  }

  return (
    <VStack gap={4} hAlign="stretch" width="100%">
      <VStack gap={1}>
        <Text type="display-1" as="h1">
          Reset your password
        </Text>
        <Text type="body" color="secondary" size="sm">
          Enter your account email and we&apos;ll send you a reset link.
        </Text>
      </VStack>

      <FormError message={formError} />

      <form onSubmit={onSubmit} noValidate>
        <VStack gap={4} hAlign="stretch" width="100%">
          <TextInput
            label="Email Address"
            type="email"
            placeholder="Johndoe@gmail.com"
            value={email}
            onChange={setEmail}
            size="lg"
            autoComplete="email"
            startIcon={Mail}
            status={emailError ? { type: 'error', message: emailError } : undefined}
          />
          <AstryxButton label="Send reset link" variant="primary" size="lg" type="submit" isLoading={submitting} width="100%" />
        </VStack>
      </form>

      <Text type="supporting" color="secondary">
        <Link to="/login" className="font-medium text-stone-900 hover:underline dark:text-stone-100">
          Back to login
        </Link>
      </Text>
    </VStack>
  );
}

// ------------------------------------------------------------------ reset -
function ResetFormView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <VStack gap={4} hAlign="center" width="100%">
        <ErrorState message="This password reset link is missing or invalid. Request a new one." />
        <Link to="/forgot-password" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
          Request a new reset link
        </Link>
      </VStack>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const pwErr = passwordError(password);
    if (pwErr) next.password = `Password must have ${pwErr.toLowerCase()}`;
    if (confirm !== password) next.confirm = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setFormError(null);
    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setFormError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <VStack gap={4} hAlign="center" width="100%">
        <EmptyState
          title="Password updated"
          description="Your password has been reset. You can now sign in."
          icon={<AstryxIcon icon={CheckCircleIcon} size="lg" />}
        />
        <AstryxButton label="Sign in" variant="primary" size="lg" onClick={() => navigate('/login')} />
      </VStack>
    );
  }

  return (
    <VStack gap={4} hAlign="stretch" width="100%">
      <VStack gap={1}>
        <Text type="display-1" as="h1">
          Choose a new password
        </Text>
        <Text type="body" color="secondary" size="sm">
          Pick a strong password for your account.
        </Text>
      </VStack>

      <FormError message={formError} />

      <form onSubmit={onSubmit} noValidate>
        <VStack gap={4} hAlign="stretch" width="100%">
          <VStack gap={1} hAlign="stretch" width="100%">
            <PasswordInput
              id="reset-password"
              label="New password"
              value={password}
              onChange={setPassword}
              error={errors.password}
              autoComplete="new-password"
              describedBy="reset-password-requirements"
            />
            <div id="reset-password-requirements">
              <PasswordChecklist value={password} />
            </div>
          </VStack>

          <TextInput
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            size="lg"
            autoComplete="new-password"
            status={errors.confirm ? { type: 'error', message: errors.confirm } : undefined}
          />

          <AstryxButton label="Reset password" variant="primary" size="lg" type="submit" isLoading={submitting} width="100%" />
        </VStack>
      </form>
    </VStack>
  );
}

// --------------------------------------------------------------------- page -
// Auth is standalone (NOT inside AppShell): the template's full-page Center
// layout is used directly. data-astryx-theme="stone" activates the Stone theme
// scope (@astryxdesign/theme-stone) for the Astryx components on this page —
// without it they render in the core default (blue) theme.
export default function Auth({ mode }: AuthProps) {
  const { user, loading } = useAuth();
  const reducedMotion = usePrefersReducedMotion();

  if (!loading && user && (mode === 'login' || mode === 'register')) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div data-astryx-theme="stone" data-astryx-media="dark" className="min-h-screen">
      <Center axis="both" padding={6} style={pageStyle}>
        <style>{AUTH_SPLIT_CSS}</style>
        <motion.div
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98, filter: 'blur(8px)' }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          transition={reducedMotion ? fadeOnly : springDefault}
          style={pageWrap}
        >
          <div className="auth-split grid items-stretch gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
            {/* Form column — plain surface, vertically dead-center like the reference */}
            <div className="relative flex min-h-[640px] flex-col justify-center px-2 py-16 sm:px-10 lg:px-6">
              <div className="w-full max-w-[430px]">
                <PageTransition routeKey={mode}>
                  {mode === 'login' && <LoginFormView />}
                  {mode === 'register' && <RegisterFormView />}
                  {mode === 'forgot' && <ForgotFormView />}
                  {mode === 'reset' && <ResetFormView />}
                </PageTransition>
              </div>
              <p className="absolute bottom-6 left-2 text-xs text-stone-400 dark:text-stone-500 sm:left-10 lg:left-6">
                © 2026 Consistency Guard
              </p>
            </div>

            {/* Brand panel — its own dark rounded card */}
            <BrandPane />
          </div>
        </motion.div>
      </Center>
    </div>
  );
}
