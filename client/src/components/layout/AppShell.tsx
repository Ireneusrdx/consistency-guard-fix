/**
 * AppShell — authenticated application frame.
 *
 * Desktop (lg+): fixed left sidebar + sticky header with breadcrumbs.
 * Mobile (<lg): compact top header + fixed bottom nav (5 items) +
 * slide-over drawer with the full navigation. Dark-mode only: the `dark`
 * class is forced on <html> at startup (see index.html / main.tsx).
 */
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { PageTransition } from '../PageTransition';
import CommandPalette from '../CommandPalette';
import PollinationsKeyPrompt from '../PollinationsKeyPrompt';
import logoUrl from '../../assets/logo.svg';
// Stone theme icon language: the @astryxdesign/theme-stone icon registry is
// built on lucide-react, so the shell uses lucide throughout for one icon voice.
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  BarChart3,
  FileText,
  FlaskConical,
  History as HistoryIcon,
  LayoutGrid,
  Menu,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from 'lucide-react';
import {
  fadeOnly,
  springDefault,
  surfaceVariants,
  usePrefersReducedMotion,
} from '../../lib/motion';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const MAIN_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/evaluate/models', label: 'Evaluate', icon: FlaskConical },
  { to: '/compare', label: 'Compare', icon: ArrowLeftRight },
  { to: '/benchmarks', label: 'Benchmarks', icon: BarChart3 },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/reports', label: 'Reports', icon: FileText },
];

const WORKSPACE_NAV: NavItem[] = [
  { to: '/evaluate/question', label: 'Prompt Lab', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

const MOBILE_NAV: NavItem[] = [MAIN_NAV[0], MAIN_NAV[1], MAIN_NAV[2], MAIN_NAV[4]];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5" aria-label="Consistency Guard home">
      <img
        src={logoUrl}
        alt="Consistency Guard logo"
        className="h-9 w-9 shrink-0 rounded-lg object-cover shadow-sm"
      />
      {!compact && (
        <span className="font-display text-[15px] font-bold tracking-tight text-[#25252a] dark:text-white">
          Consistency Guard
        </span>
      )}
    </Link>
  );
}

function NavLinks({
  items,
  onNavigate,
  layout = 'sidebar',
}: {
  items: NavItem[];
  onNavigate?: () => void;
  layout?: 'sidebar' | 'bottom';
}) {
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'cg-press flex items-center transition-colors',
              layout === 'sidebar'
                ? 'gap-3 rounded-lg px-3 py-2 text-sm font-medium'
                : 'flex-col gap-1 px-1 py-2 text-[10px] font-medium',
              isActive
                ? 'bg-[#25252a0f] text-[#25252a] dark:bg-stone-100/10 dark:text-stone-100'
                : 'text-stone-600 hover:bg-[#25252a0d] hover:text-[#25252a] dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100',
            )
          }
        >
          {(() => {
            const Icon = item.icon;
            return <Icon className={layout === 'sidebar' ? 'h-5 w-5 shrink-0' : 'h-5 w-5'} aria-hidden="true" />;
          })()}
          <span className={layout === 'bottom' ? 'leading-none' : undefined}>{item.label}</span>
        </NavLink>
      ))}
    </>
  );
}

function humanize(segment: string): string {
  const decoded = (() => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  })();
  if (/^[0-9a-f-]{16,}$/i.test(decoded)) return 'Details';
  return decoded
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Dark-mode only: the .dark class is forced unconditionally (index.html sets
// it pre-paint; main.tsx reinforces it). There is no light mode and no toggle.
function useTheme() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    try {
      localStorage.removeItem('cg_theme');
    } catch {
      /* storage unavailable */
    }
  }, []);
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Cmd/Ctrl+K toggles the palette; Escape closes menus/drawer/palette.
  // Click-outside closes the profile menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setDrawerOpen(false);
        setPaletteOpen(false);
      }
    };
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, []);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments.map((seg, i) => ({
    key: `${seg}-${i}`,
    label: humanize(seg),
    to: `/${segments.slice(0, i + 1).join('/')}`,
    isLast: i === segments.length - 1,
  }));

  const initial = (user?.name?.trim()?.charAt(0) ?? user?.email?.charAt(0) ?? '?').toUpperCase();

  const handleSignOut = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background font-sans text-[#25252a] dark:bg-stone-950 dark:text-stone-100">
      {/* Desktop sidebar — heavier translucent material (structural region).
          Content never slides under it, so no translucency stacking. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-[#e2e2e8] bg-white lg:flex dark:border-stone-800 dark:bg-stone-900">
        <div className="flex h-16 shrink-0 items-center px-5">
          <Logo />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary">
          <NavLinks items={MAIN_NAV} />
          <p className="mb-1 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Workspace
          </p>
          <NavLinks items={WORKSPACE_NAV} />
        </nav>
        <div className="p-4">
          <p className="text-xs text-stone-400 dark:text-stone-500">Consistency Guard v0.1.0</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Header — translucent material, page content scrolls underneath.
            Edge fade replaces the hard divider. */}
        <header className="sticky top-0 z-30 border-b border-[#e2e2e8] bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden">
                <Logo compact />
              </div>
              <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
                {crumbs.map((crumb) => (
                  <span key={crumb.key} className="flex min-w-0 items-center gap-1.5">
                    <svg
                      className="h-3.5 w-3.5 shrink-0 text-stone-300 dark:text-stone-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                    {crumb.isLast ? (
                      <span aria-current="page" className="truncate font-medium text-stone-900 dark:text-stone-100">
                        {crumb.label}
                      </span>
                    ) : (
                      <Link
                        to={crumb.to}
                        className="truncate text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
                      >
                        {crumb.label}
                      </Link>
                    )}
                  </span>
                ))}
              </nav>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Open command palette"
                className="cg-press hidden h-9 items-center gap-2 rounded-full bg-[#f3f3f5] px-3 text-sm text-stone-500 ring-1 ring-inset ring-[#e2e2e8] hover:bg-[#e9e9ed] hover:text-stone-900 dark:bg-stone-800 dark:text-stone-400 dark:ring-stone-700 dark:hover:bg-stone-700 dark:hover:text-stone-100 md:flex"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span className="text-stone-400 dark:text-stone-500">Search…</span>
                <kbd className="rounded border border-stone-200 bg-stone-50 px-1 text-[10px] font-medium text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-500">
                  ⌘K
                </kbd>
              </button>
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Account menu"
                  className="cg-press flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#25252a] text-sm font-semibold text-white hover:bg-[#1b1b1f]"
                >
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span aria-hidden="true">{initial}</span>
                  )}
                </button>
                <AnimatePresence initial={false}>
                  {menuOpen && (
                    <motion.div
                      role="menu"
                      aria-label="Account"
                      className="absolute right-0 mt-2 w-56 rounded-xl border border-[#e2e2e8] bg-white p-1.5 shadow-pop dark:border-stone-700 dark:bg-stone-900"
                      style={{ transformOrigin: '100% 0%' }}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      variants={surfaceVariants(reducedMotion)}
                    >
                      <div className="px-3 py-2">
                        <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                          {user?.name ?? 'Account'}
                        </p>
                        <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                          {user?.email ?? ''}
                        </p>
                      </div>
                      <Link
                        to="/settings"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className="cg-press block rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
                      >
                        Settings
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleSignOut}
                        className="cg-press block w-full rounded-lg px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
                      >
                        Sign out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </header>

        {/* Page content — interruptible route transitions, mirrored enter/exit. */}
        <main className="relative mx-auto w-full max-w-7xl overflow-x-hidden px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          <PageTransition routeKey={pathname}>
            <Outlet />
          </PageTransition>
        </main>
      </div>

      {/* Mobile bottom nav — translucent material, edge fade, no hard divider. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e2e2e8] bg-white lg:hidden dark:border-stone-800 dark:bg-stone-900"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
          <NavLinks items={MOBILE_NAV} layout="bottom" />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="cg-press flex flex-col items-center gap-1 px-1 py-2 text-[10px] font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span className="leading-none">Menu</span>
          </button>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" aria-hidden="true" />
      </nav>

      {/* Mobile slide-over drawer — spring from the right, dimming scrim. */}
      <AnimatePresence initial={false}>
        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-stone-950/50"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: reducedMotion ? fadeOnly : springDefault }}
              exit={{ opacity: 0, transition: reducedMotion ? fadeOnly : springDefault }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              className="absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-stone-900"
              initial={reducedMotion ? { opacity: 0 } : { x: '100%', opacity: 0.6 }}
              animate={
                reducedMotion ? { opacity: 1, transition: fadeOnly } : { x: '0%', opacity: 1, transition: springDefault }
              }
              exit={
                reducedMotion ? { opacity: 0, transition: fadeOnly } : { x: '100%', opacity: 0.6, transition: springDefault }
              }
            >
              <div className="flex items-center justify-between border-b border-border p-4">
                <Logo />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="cg-press hit-pad relative flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-4" aria-label="Mobile">
                <NavLinks items={MAIN_NAV} onNavigate={() => setDrawerOpen(false)} />
                <p className="mb-1 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                  Workspace
                </p>
                <NavLinks items={WORKSPACE_NAV} onNavigate={() => setDrawerOpen(false)} />
              </nav>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <PollinationsKeyPrompt />
    </div>
  );
}
