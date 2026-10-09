/**
 * PollinationsKeyPrompt — asks for the Pollinations API key right after login
 * when the account has none saved. The key is stored encrypted on the server
 * (per account), so once saved it is never asked for again.
 */
import { useEffect, useState } from 'react';
import { Button, Field, Input, Modal, toast } from './ui';
import { getSettings, saveProviderCredential, toApiError } from '../lib/api';

const DISMISSED_KEY = 'cg_pollinations_key_prompted';

export default function PollinationsKeyPrompt() {
  const [open, setOpen] = useState(false);
  const [signupUrl, setSignupUrl] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [keyError, setKeyError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (sessionStorage.getItem(DISMISSED_KEY)) return;
    getSettings().then(
      (s) => {
        if (cancelled) return;
        // An empty provider list means the list call failed (it never
        // legitimately returns zero providers) — stay quiet rather than
        // asking for a key the user may already have saved.
        if (s.providers.length === 0) return;
        const pollinations = s.providers.find((p) => p.id === 'pollinations');
        if (pollinations?.connected) {
          sessionStorage.setItem(DISMISSED_KEY, '1');
          return;
        }
        setSignupUrl(pollinations?.signupUrl ?? null);
        setOpen(true);
      },
      () => {
        // If settings fail to load, stay quiet — never prompt for a key
        // when we simply couldn't verify whether one is already stored.
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setOpen(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim().length < 8) {
      setKeyError('Enter a valid API key');
      return;
    }
    setKeyError(undefined);
    setSaving(true);
    try {
      await saveProviderCredential('pollinations', apiKey.trim());
      toast('Pollinations key saved', { tone: 'success' });
      dismiss();
    } catch (err) {
      setKeyError(toApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title="Connect Pollinations"
      footer={
        <>
          <Button variant="ghost" onClick={dismiss}>
            Skip for now
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save key
          </Button>
        </>
      }
    >
      <form onSubmit={handleSave} className="space-y-4">
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Evaluations run on Pollinations models. Add your API key once — it&apos;s encrypted and
          saved to your account, so you won&apos;t be asked again.
        </p>
        {signupUrl && (
          <a
            href={signupUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400"
          >
            Get a free key — no credit card
          </a>
        )}
        <Field label="Pollinations API key" error={keyError} htmlFor="onboarding-pollinations-key">
          <Input
            id="onboarding-pollinations-key"
            type="password"
            autoComplete="off"
            placeholder="Paste your key (sk_…)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            aria-invalid={!!keyError}
          />
        </Field>
      </form>
    </Modal>
  );
}
