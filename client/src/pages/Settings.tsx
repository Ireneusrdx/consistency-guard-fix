/**
 * Settings page restyled on the Astryx `settings-sidebar` template:
 * a secondary in-page nav (sidebar list) switches content panels, with
 * in-place row editing for profile and preference rows.
 *
 * All settings state, save handlers, validation, and API calls are unchanged
 * from the previous revision — this file is styling/structure only.
 */
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import {
  VStack,
  HStack,
  StackItem,
  Layout,
  LayoutContent,
  LayoutPanel,
} from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Button as AstryxButton } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Divider } from '@astryxdesign/core/Divider';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Badge as AstryxBadge } from '@astryxdesign/core/Badge';
import { Icon as AstryxIcon } from '@astryxdesign/core/Icon';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import {
  UserIcon,
  LockClosedIcon,
  CpuChipIcon,
  AdjustmentsHorizontalIcon,
  ChartBarIcon,
  BellIcon,
  ShieldExclamationIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  ComputerDesktopIcon,
  ArrowDownTrayIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';
// App pieces: behavior-bearing controls and shared helpers stay as-is.
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Field,
  Icon,
  Input,
  LoadingState,
  Modal,
  Slider,
  toast,
} from '../components/ui';
import {
  changePassword,
  deleteAccount,
  exportUserData,
  getSettings,
  listSessions,
  removeProviderCredential,
  revokeAllSessions,
  revokeSession,
  saveProviderCredential,
  testProviderConnection,
  updateSettings,
} from '../lib/api';
import type { ProviderInfo, ScoringWeights, SessionInfo, UserSettings } from '../lib/api';
import { DOMAINS } from '../lib/options';
import { downloadTextFile, formatDateTime } from '../lib/utils';

// ------------------------------------------------------- template pieces ---
const rowPadding: CSSProperties = {
  paddingBlock: 'var(--spacing-4)',
};
const sideNavPadding: CSSProperties = {
  paddingBlock: 'var(--spacing-4)',
  paddingInline: 'var(--spacing-3)',
};
const sideNavHeading: CSSProperties = {
  marginInline: 'var(--spacing-4)',
};

const NAV_ITEMS = [
  { label: 'Profile', icon: UserIcon },
  { label: 'Security', icon: LockClosedIcon },
  { label: 'Pollinations', icon: CpuChipIcon },
  { label: 'Evaluation preferences', icon: AdjustmentsHorizontalIcon },
  { label: 'Scoring weights', icon: ChartBarIcon },
  { label: 'Notifications', icon: BellIcon },
  { label: 'Data & privacy', icon: ShieldExclamationIcon },
];

// Section title shown beside the mobile back button (matches each section's
// in-content heading, which is hidden on mobile to avoid a duplicate).
const SECTION_TITLES: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((i) => [i.label, i.label]),
);

interface InfoRow {
  label: string;
  value: string;
}

function InfoRowItem({ label, value }: InfoRow) {
  return (
    <>
      <HStack hAlign="between" vAlign="start" style={rowPadding}>
        <VStack gap={0}>
          <Text type="body" weight="semibold" display="block">
            {label}
          </Text>
          <Text type="supporting" color="secondary" display="block">
            {value}
          </Text>
        </VStack>
      </HStack>
      <Divider />
    </>
  );
}

interface ExpandableRowProps {
  label: string;
  value: string;
  children: ReactNode;
  isExpanded: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}

function ExpandableRow({
  label,
  value,
  children,
  isExpanded,
  onEdit,
  onCancel,
  onSave,
}: ExpandableRowProps) {
  return (
    <>
      {isExpanded ? (
        <VStack gap={4} style={rowPadding}>
          <Text type="body" weight="semibold" display="block">
            {label}
          </Text>
          {children}
          <HStack gap={2}>
            <AstryxButton label="Save" variant="primary" onClick={onSave} />
            <AstryxButton label="Cancel" variant="ghost" onClick={onCancel} />
          </HStack>
        </VStack>
      ) : (
        <HStack hAlign="between" vAlign="start" style={rowPadding}>
          <VStack gap={0}>
            <Text type="body" weight="semibold" display="block">
              {label}
            </Text>
            <Text type="supporting" color="secondary" display="block">
              {value}
            </Text>
          </VStack>
          <AstryxButton
            label="Edit"
            variant="ghost"
            size="sm"
            onClick={onEdit}
          />
        </HStack>
      )}
      <Divider />
    </>
  );
}

// ------------------------------------------------------------------ helpers
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'An unexpected error occurred.';
}

// ------------------------------------------------------------------ profile
function ProfilePanel({
  initial,
  onSaved,
}: {
  initial: UserSettings['profile'];
  onSaved: (s: UserSettings) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [saving, setSaving] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateSettings({ profile: { name: name.trim(), email: initial.email } });
      onSaved(updated);
      toast('Profile updated', { tone: 'success' });
      setExpandedRow(null);
    } catch (e) {
      toast('Failed to save profile', { desc: errMsg(e), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <VStack gap={6}>
      <Heading level={2}>Profile</Heading>
      <VStack gap={0}>
        <ExpandableRow
          label="Display name"
          value={name || 'Not provided'}
          isExpanded={expandedRow === 'name'}
          onEdit={() => setExpandedRow('name')}
          onCancel={() => {
            setName(initial.name);
            setExpandedRow(null);
          }}
          onSave={save}
        >
          <TextInput
            label="Display name"
            isLabelHidden
            value={name}
            onChange={setName}
            autoComplete="name"
          />
        </ExpandableRow>
        <InfoRowItem
          label="Email"
          value={`${initial.email} — your sign-in email cannot be changed here.`}
        />
      </VStack>
      {saving && (
        <Text type="supporting" color="secondary" role="status">
          Saving…
        </Text>
      )}
    </VStack>
  );
}

// ----------------------------------------------------------------- security
function SecurityPanel() {
  const [activeTab, setActiveTab] = useState('password');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessLoading, setSessLoading] = useState(true);
  const [revokeTarget, setRevokeTarget] = useState<SessionInfo | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [revokeAllSaving, setRevokeAllSaving] = useState(false);

  const loadSessions = async () => {
    setSessLoading(true);
    try {
      setSessions(await listSessions());
    } catch (e) {
      toast('Failed to load sessions', { desc: errMsg(e), tone: 'error' });
    } finally {
      setSessLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handlePassword = async () => {
    if (next.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setPwError('New passwords do not match.');
      return;
    }
    setPwError(null);
    setPwSaving(true);
    try {
      await changePassword(current, next);
      toast('Password changed', { tone: 'success' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e) {
      setPwError(errMsg(e));
    } finally {
      setPwSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeSession(revokeTarget.id);
      toast('Session revoked', { tone: 'success' });
      setRevokeTarget(null);
      await loadSessions();
    } catch (e) {
      toast('Failed to revoke session', { desc: errMsg(e), tone: 'error' });
    } finally {
      setRevoking(false);
    }
  };

  const handleRevokeAll = async () => {
    setRevokeAllSaving(true);
    try {
      await revokeAllSessions();
      toast('All other sessions logged out', { tone: 'success' });
      setRevokeAllOpen(false);
      await loadSessions();
    } catch (e) {
      toast('Failed to log out sessions', { desc: errMsg(e), tone: 'error' });
    } finally {
      setRevokeAllSaving(false);
    }
  };

  return (
    <VStack gap={6}>
      <Heading level={2}>Security</Heading>

      <TabList value={activeTab} onChange={setActiveTab} hasDivider>
        <Tab value="password" label="Password" />
        <Tab value="sessions" label="Sessions" />
      </TabList>

      {activeTab === 'password' && (
        <VStack gap={4} hAlign="stretch">
          <VStack gap={0}>
            <Heading level={3}>Change password</Heading>
            <Divider />
            <VStack gap={4} style={{ ...rowPadding, maxWidth: '28rem' }}>
              <TextInput
                label="Current password"
                type="password"
                value={current}
                onChange={setCurrent}
                autoComplete="current-password"
              />
              <TextInput
                label="New password"
                type="password"
                value={next}
                onChange={setNext}
                autoComplete="new-password"
                status={pwError ? { type: 'error', message: pwError } : undefined}
              />
              <TextInput
                label="Confirm new password"
                type="password"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
              />
              <HStack>
                <AstryxButton
                  label="Change password"
                  variant="primary"
                  onClick={handlePassword}
                  isLoading={pwSaving}
                />
              </HStack>
            </VStack>
          </VStack>
        </VStack>
      )}

      {activeTab === 'sessions' && (
        <VStack gap={0}>
          <Heading level={3}>Active sessions</Heading>
          <Divider />
          {sessLoading ? (
            <VStack style={rowPadding}>
              <LoadingState label="Loading sessions…" rows={2} />
            </VStack>
          ) : sessions.length === 0 ? (
            <VStack style={rowPadding}>
              <Text type="supporting" color="secondary">
                No active sessions.
              </Text>
            </VStack>
          ) : (
            sessions.map((s) => (
              <HStack key={s.id} gap={3} vAlign="start" style={rowPadding}>
                <AstryxIcon icon={ComputerDesktopIcon} />
                <StackItem size="fill">
                  <VStack gap={0}>
                    <HStack gap={2} vAlign="center">
                      <Text type="body" weight="semibold">
                        {s.device}
                      </Text>
                      {s.current && <AstryxBadge label="This device" />}
                    </HStack>
                    <Text type="supporting" color="secondary" display="block">
                      {s.ip} · Last active {formatDateTime(s.lastActive)}
                    </Text>
                  </VStack>
                </StackItem>
                {!s.current && (
                  <AstryxButton
                    label="Revoke"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevokeTarget(s)}
                  />
                )}
              </HStack>
            ))
          )}
          <Divider />
          <VStack style={rowPadding}>
            <HStack>
              <AstryxButton
                label="Log out all other sessions"
                variant="secondary"
                size="sm"
                onClick={() => setRevokeAllOpen(true)}
              />
            </HStack>
          </VStack>
        </VStack>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title="Revoke session"
        description={`Revoke the session on "${revokeTarget?.device ?? ''}"? That device will be signed out immediately.`}
        confirmLabel="Revoke"
        loading={revoking}
      />
      <ConfirmDialog
        open={revokeAllOpen}
        onClose={() => setRevokeAllOpen(false)}
        onConfirm={handleRevokeAll}
        title="Log out all other sessions"
        description="This will sign you out of every device except this one. Continue?"
        confirmLabel="Log out all"
        loading={revokeAllSaving}
      />
    </VStack>
  );
}

// ----------------------------------------------------------------- providers
function ProvidersPanel({
  providers,
  refresh,
}: {
  providers: ProviderInfo[];
  refresh: () => Promise<void>;
}) {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ProviderInfo | null>(null);
  const [removing, setRemoving] = useState(false);
  const [keyFor, setKeyFor] = useState<ProviderInfo | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [keySaving, setKeySaving] = useState(false);

  const handleTest = async (p: ProviderInfo) => {
    setTestingId(p.id);
    try {
      const res = await testProviderConnection(p.id);
      toast(res.ok ? 'Connection successful' : 'Connection failed', {
        desc: res.message,
        tone: res.ok ? 'success' : 'error',
      });
    } catch (e) {
      toast('Connection test failed', { desc: errMsg(e), tone: 'error' });
    } finally {
      setTestingId(null);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeProviderCredential(removeTarget.id);
      toast('API key removed', { tone: 'success' });
      setRemoveTarget(null);
      await refresh();
    } catch (e) {
      toast('Failed to remove API key', { desc: errMsg(e), tone: 'error' });
    } finally {
      setRemoving(false);
    }
  };

  const handleSaveKey = async () => {
    if (!keyFor) return;
    if (!apiKey.trim()) {
      toast('API key is required', { tone: 'error' });
      return;
    }
    setKeySaving(true);
    try {
      await saveProviderCredential(keyFor.id, apiKey.trim());
      toast('API key saved', { tone: 'success' });
      setKeyFor(null);
      setApiKey('');
      await refresh();
    } catch (e) {
      toast('Failed to save API key', { desc: errMsg(e), tone: 'error' });
    } finally {
      setKeySaving(false);
    }
  };

  return (
    <VStack gap={6}>
      <Heading level={2}>Pollinations</Heading>
      <Text type="body" color="secondary">
        Your Pollinations API key powers every evaluation. It is stored
        encrypted on your account — once saved, you never need to enter it again.
      </Text>

      {providers.length === 0 && (
        <Text type="body" color="secondary">
          Pollinations is unavailable right now. Please try again in a moment.
        </Text>
      )}

      <VStack gap={0}>
        <Divider />
        {providers.map((p) => (
          <HStack key={p.id} gap={3} vAlign="start" style={rowPadding}>
            <AstryxIcon icon={KeyIcon} />
            <StackItem size="fill">
              <VStack gap={1}>
                <HStack gap={2} vAlign="center">
                  <Text type="body" weight="semibold">
                    {p.name}
                  </Text>
                  {p.freeTier && <AstryxBadge variant="success" label="Free" />}
                  <AstryxBadge
                    variant={p.connected ? 'success' : 'neutral'}
                    label={p.connected ? 'Connected' : 'Not connected'}
                  />
                  <a
                    href={p.signupUrl ?? p.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {p.freeTier ? 'Get a free key' : 'Docs'}
                  </a>
                </HStack>
                <Text type="supporting" color="secondary" display="block">
                  {p.maskedKey ?? 'No key stored'}
                </Text>
              </VStack>
            </StackItem>
            <HStack gap={1}>
              <AstryxButton
                label="Test"
                variant="ghost"
                size="sm"
                onClick={() => handleTest(p)}
                isLoading={testingId === p.id}
              />
              <AstryxButton
                label="Add/Update key"
                variant="secondary"
                size="sm"
                onClick={() => setKeyFor(p)}
              />
              <Button
                variant="ghost"
                size="sm"
                className="text-[#58413e] hover:bg-[#f9dcd7] hover:text-[#58413e] dark:hover:bg-red-950/40"
                onClick={() => setRemoveTarget(p)}
              >
                Remove
              </Button>
            </HStack>
          </HStack>
        ))}
        <Divider />
      </VStack>

      <Modal
        open={keyFor !== null}
        onClose={() => {
          setKeyFor(null);
          setApiKey('');
        }}
        title={keyFor ? `${keyFor.name} API key` : 'API key'}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setKeyFor(null);
                setApiKey('');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveKey} loading={keySaving}>
              Save key
            </Button>
          </>
        }
      >
        <Field
          label="API key"
          htmlFor="provider-api-key"
          hint="Stored encrypted server-side; never displayed again."
        >
          <Input
            id="provider-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your API key"
            autoComplete="off"
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title="Remove API key"
        description={`Remove the stored API key for ${removeTarget?.name ?? ''}? Evaluations will no longer use this provider.`}
        confirmLabel="Remove"
        loading={removing}
      />
    </VStack>
  );
}

// -------------------------------------------------------------- preferences
const MODES = ['quick', 'consistency', 'deep', 'adversarial'] as const;
const MODE_OPTIONS = MODES.map((m) => ({
  label: m.charAt(0).toUpperCase() + m.slice(1),
  value: m,
}));

function PreferencesPanel({
  initial,
  onSaved,
}: {
  initial: UserSettings['preferences'];
  onSaved: (s: UserSettings) => void;
}) {
  const [runs, setRuns] = useState(initial.defaultRuns);
  const [mode, setMode] = useState(initial.defaultMode);
  const [domains, setDomains] = useState<string[]>(initial.defaultDomains);
  const [saving, setSaving] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggleDomain = (d: string) => {
    setDomains((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const save = async () => {
    const clampedRuns = Math.min(10, Math.max(1, Math.round(Number(runs) || 1)));
    setRuns(clampedRuns);
    setSaving(true);
    try {
      const updated = await updateSettings({
        preferences: { defaultRuns: clampedRuns, defaultMode: mode, defaultDomains: domains },
      });
      onSaved(updated);
      toast('Preferences saved', { tone: 'success' });
      setExpandedRow(null);
    } catch (e) {
      toast('Failed to save preferences', { desc: errMsg(e), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <VStack gap={6}>
      <Heading level={2}>Evaluation preferences</Heading>
      <Text type="body" color="secondary">
        Defaults applied to new evaluations.
      </Text>

      <VStack gap={0}>
        <ExpandableRow
          label="Default runs"
          value={`${runs} — repeated runs per model (1–10).`}
          isExpanded={expandedRow === 'runs'}
          onEdit={() => setExpandedRow('runs')}
          onCancel={() => {
            setRuns(initial.defaultRuns);
            setExpandedRow(null);
          }}
          onSave={save}
        >
          {/* Astryx TextInput only supports text/password/email; the themed
              app Input preserves the number-control behavior here. */}
          <Field label="Default runs" htmlFor="pref-runs" hint="Number of repeated runs per model (1–10).">
            <Input
              id="pref-runs"
              type="number"
              min={1}
              max={10}
              value={runs}
              onChange={(e) => setRuns(e.target.valueAsNumber)}
              className="max-w-32"
            />
          </Field>
        </ExpandableRow>
        <ExpandableRow
          label="Default mode"
          value={MODE_OPTIONS.find((o) => o.value === mode)?.label ?? mode}
          isExpanded={expandedRow === 'mode'}
          onEdit={() => setExpandedRow('mode')}
          onCancel={() => {
            setMode(initial.defaultMode);
            setExpandedRow(null);
          }}
          onSave={save}
        >
          <Selector
            label="Default mode"
            isLabelHidden
            size="lg"
            value={mode}
            onChange={setMode}
            options={MODE_OPTIONS}
          />
        </ExpandableRow>
      </VStack>

      <VStack gap={2}>
        <Text type="body" weight="semibold" display="block">
          Default domains
        </Text>
        <VStack gap={1}>
          {DOMAINS.map((d) => (
            <CheckboxInput
              key={d}
              label={d}
              value={domains.includes(d)}
              onChange={() => toggleDomain(d)}
            />
          ))}
        </VStack>
      </VStack>

      <HStack>
        <AstryxButton
          label="Save preferences"
          variant="primary"
          onClick={save}
          isLoading={saving}
        />
      </HStack>
    </VStack>
  );
}

// ------------------------------------------------------------------- weights
const WEIGHT_FIELDS: { key: keyof ScoringWeights; label: string }[] = [
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'relevance', label: 'Relevance' },
  { key: 'completeness', label: 'Completeness' },
  { key: 'grounding', label: 'Grounding' },
  { key: 'instructionFollowing', label: 'Instruction following' },
];

function WeightsPanel({
  initial,
  onSaved,
}: {
  initial: ScoringWeights;
  onSaved: (s: UserSettings) => void;
}) {
  const [weights, setWeights] = useState<ScoringWeights>(initial);
  const [saving, setSaving] = useState(false);

  const total = WEIGHT_FIELDS.reduce((a, f) => a + weights[f.key], 0);
  const valid = total === 100;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const updated = await updateSettings({ scoringWeights: weights });
      onSaved(updated);
      toast('Scoring weights saved', { tone: 'success' });
    } catch (e) {
      toast('Failed to save scoring weights', { desc: errMsg(e), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <VStack gap={6}>
      <Heading level={2}>Scoring weights</Heading>
      <Text type="body" color="secondary">
        How each dimension contributes to the overall reliability score.
      </Text>

      <VStack gap={4}>
        {WEIGHT_FIELDS.map((f) => (
          <VStack key={f.key} gap={1.5}>
            <HStack hAlign="between" vAlign="center">
              <label
                htmlFor={`weight-${f.key}`}
                className="text-sm font-medium text-stone-700 dark:text-stone-200"
              >
                {f.label}
              </label>
              <span className="font-mono text-sm text-stone-900 dark:text-white">{weights[f.key]}%</span>
            </HStack>
            {/* The template has no slider; the themed app Slider is kept. */}
            <Slider
              id={`weight-${f.key}`}
              min={0}
              max={100}
              step={1}
              value={weights[f.key]}
              onChange={(e) => setWeights({ ...weights, [f.key]: Number(e.target.value) })}
              aria-label={`${f.label} weight`}
            />
          </VStack>
        ))}
      </VStack>

      <HStack hAlign="between" vAlign="center" style={rowPadding}>
        <Text type="body" weight="semibold">
          Total
        </Text>
        <span
          className={`font-mono text-sm font-semibold ${valid ? 'text-stone-900 dark:text-white' : 'text-[#58413e] dark:text-red-400'}`}
        >
          {total}%
        </span>
      </HStack>
      <Divider />
      {!valid && (
        <p className="text-sm text-[#58413e] dark:text-red-400" role="alert">
          Weights must total 100% (currently {total}%)
        </p>
      )}
      <HStack>
        <AstryxButton
          label="Save weights"
          variant="primary"
          onClick={save}
          isLoading={saving}
          isDisabled={!valid}
        />
      </HStack>
    </VStack>
  );
}

// ------------------------------------------------------------- notifications
function NotificationsPanel({
  initial,
  onSaved,
}: {
  initial: UserSettings['notifications'];
  onSaved: (s: UserSettings) => void;
}) {
  const [emailOnComplete, setEmailOnComplete] = useState(initial.emailOnComplete);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateSettings({
        notifications: { emailOnComplete, emailOnConflict: false, weeklyDigest: false },
      });
      onSaved(updated);
      toast('Notifications saved', { tone: 'success' });
    } catch (e) {
      toast('Failed to save notifications', { desc: errMsg(e), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <VStack gap={6}>
      <Heading level={2}>Notifications</Heading>
      <Text type="body" color="secondary">
        Choose what you want to be notified about.
      </Text>

      <VStack style={rowPadding}>
        <Switch
          label="Email on completion"
          description="Get notified when an evaluation finishes."
          value={emailOnComplete}
          onChange={setEmailOnComplete}
          labelPosition="start"
          labelSpacing="spread"
        />
      </VStack>
      <Divider />
      <HStack>
        <AstryxButton
          label="Save notifications"
          variant="primary"
          onClick={save}
          isLoading={saving}
        />
      </HStack>
    </VStack>
  );
}

// --------------------------------------------------------------------- data
function DataPanel() {
  const [exporting, setExporting] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delSaving, setDelSaving] = useState(false);
  const [delPassword, setDelPassword] = useState('');
  const [delError, setDelError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const json = await exportUserData();
      downloadTextFile('consistency-guard-export.json', json, 'application/json');
      toast('Data exported', { tone: 'success' });
    } catch (e) {
      toast('Export failed', { desc: errMsg(e), tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!delPassword) {
      setDelError('Enter your password to confirm.');
      return;
    }
    setDelError(null);
    setDelSaving(true);
    try {
      await deleteAccount(delPassword);
      toast('Account deleted', { tone: 'success' });
      setDelOpen(false);
      setDelPassword('');
    } catch (e) {
      setDelError(errMsg(e));
    } finally {
      setDelSaving(false);
    }
  };

  return (
    <VStack gap={6}>
      <Heading level={2}>Data &amp; privacy</Heading>
      <Text type="body" color="secondary">
        Export a copy of your data or delete your account.
      </Text>

      <VStack gap={0}>
        <HStack hAlign="between" vAlign="start" style={rowPadding}>
          <VStack gap={0}>
            <Text type="body" weight="semibold" display="block">
              Export my data
            </Text>
            <Text type="supporting" color="secondary" display="block">
              Download a JSON archive of your evaluations, reports, and
              settings.
            </Text>
          </VStack>
          <AstryxButton
            label="Export my data"
            variant="secondary"
            size="sm"
            icon={<AstryxIcon icon={ArrowDownTrayIcon} size="sm" />}
            onClick={handleExport}
            isLoading={exporting}
          />
        </HStack>
        <Divider />
        <HStack hAlign="between" vAlign="start" style={rowPadding}>
          <VStack gap={0}>
            <Text type="body" weight="semibold" display="block">
              Delete account
            </Text>
            <Text type="supporting" color="secondary" display="block">
              Permanently delete your account and all associated data. This
              cannot be undone.
            </Text>
          </VStack>
          <Button variant="danger" size="sm" onClick={() => setDelOpen(true)}>
            <Icon name="trash" className="h-4 w-4" /> Delete account
          </Button>
        </HStack>
        <Divider />
      </VStack>

      <Modal
        open={delOpen}
        onClose={() => {
          setDelOpen(false);
          setDelPassword('');
          setDelError(null);
        }}
        title="Delete account"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setDelOpen(false);
                setDelPassword('');
                setDelError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={delSaving}>
              Delete account
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-600 dark:text-stone-300">
            This permanently deletes your account and all associated data — evaluations, reports,
            benchmarks, and settings. This cannot be undone.
          </p>
          <Field label="Confirm with your password" htmlFor="del-password">
            <Input
              id="del-password"
              type="password"
              value={delPassword}
              onChange={(e) => setDelPassword(e.target.value)}
              placeholder="Your current password"
              autoComplete="current-password"
            />
          </Field>
          {delError && <p className="text-sm text-[#58413e] dark:text-red-400">{delError}</p>}
        </div>
      </Modal>
    </VStack>
  );
}

// -------------------------------------------------------------------- page
export default function Settings() {
  const isNarrow = useMediaQuery('(max-width: 768px)');
  // Mobile is a master→detail drill-down: 'nav' shows the menu, 'detail' shows
  // the selected section with a back button. Desktop shows both side-by-side.
  const [mobileView, setMobileView] = useState<'nav' | 'detail'>('nav');
  const [activeNav, setActiveNav] = useState('Profile');

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await getSettings());
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const refresh = async () => {
    try {
      setSettings(await getSettings());
    } catch (e) {
      toast('Failed to refresh settings', { desc: errMsg(e), tone: 'error' });
    }
  };

  // Selecting a nav item also drills into the detail view on mobile.
  const selectNav = (label: string) => {
    setActiveNav(label);
    setMobileView('detail');
  };

  const navList = (
    <VStack gap={4} style={sideNavPadding}>
      <Heading level={2} style={sideNavHeading}>
        Account settings
      </Heading>
      <List density="spacious">
        {NAV_ITEMS.map((item) => (
          <ListItem
            key={item.label}
            label={item.label}
            startContent={<AstryxIcon icon={item.icon} />}
            endContent={
              isNarrow ? (
                <AstryxIcon icon={ChevronRightIcon} size="sm" color="secondary" />
              ) : undefined
            }
            isSelected={!isNarrow && activeNav === item.label}
            onClick={() => selectNav(item.label)}
          />
        ))}
      </List>
    </VStack>
  );

  const panelContent = settings && (
    <>
      {activeNav === 'Profile' && (
        <ProfilePanel initial={settings.profile} onSaved={setSettings} />
      )}
      {activeNav === 'Security' && <SecurityPanel />}
      {activeNav === 'Pollinations' && (
        <ProvidersPanel
          providers={settings.providers.filter((p) => p.id === 'pollinations')}
          refresh={refresh}
        />
      )}
      {activeNav === 'Evaluation preferences' && (
        <PreferencesPanel initial={settings.preferences} onSaved={setSettings} />
      )}
      {activeNav === 'Scoring weights' && (
        <WeightsPanel initial={settings.scoringWeights} onSaved={setSettings} />
      )}
      {activeNav === 'Notifications' && (
        <NotificationsPanel initial={settings.notifications} onSaved={setSettings} />
      )}
      {activeNav === 'Data & privacy' && <DataPanel />}
    </>
  );

  // data-astryx-theme="stone" activates the Stone theme scope for the Astryx
  // components on this page (without it they render in the default theme).
  // Note: unlike the template, no 100dvh fill — Settings renders inside
  // AppShell's content area, so the layout sizes to its content.
  return (
    <div data-astryx-theme="stone" data-astryx-media="dark">
      {loading ? (
        <LoadingState label="Loading settings…" />
      ) : error || !settings ? (
        <ErrorState message={error ?? 'Failed to load settings.'} onRetry={load} />
      ) : isNarrow && mobileView === 'nav' ? (
        // Mobile, nav view: show only the menu (full width, no sidebar slot).
        <Layout height="fill" content={<LayoutContent padding={2}>{navList}</LayoutContent>} />
      ) : (
        <Layout
          height="fill"
          contentWidth={1200}
          start={
            isNarrow ? undefined : (
              <LayoutPanel hasDivider padding={0}>
                {navList}
              </LayoutPanel>
            )
          }
          content={
            <LayoutContent padding={4}>
              <VStack gap={0}>
                {/* Mobile detail view: a back button sits beside the section
                    title (the per-section headings below are hidden on
                    mobile). */}
                {isNarrow && (
                  <Toolbar
                    label={`Back to Account settings — ${SECTION_TITLES[activeNav]}`}
                    gap={2}
                    startContent={
                      <>
                        <AstryxButton
                          label="Back to Account settings"
                          variant="ghost"
                          size="sm"
                          isIconOnly
                          icon={<AstryxIcon icon={ArrowLeftIcon} size="sm" />}
                          onClick={() => setMobileView('nav')}
                        />
                        <Heading level={2}>{SECTION_TITLES[activeNav]}</Heading>
                      </>
                    }
                  />
                )}
                {panelContent}
              </VStack>
            </LayoutContent>
          }
        />
      )}
    </div>
  );
}
