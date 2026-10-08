import Link from 'next/link';
import { ConnectionBadge } from '@/components/connection-badge';
import { getCurrentUser } from '@/lib/server/current-user';
import { getConnection, storedHealth } from '@/lib/server/pdi';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/lab', label: 'Script Lab' },
  { href: '/settings', label: 'Settings' },
];

export async function AppNav() {
  const user = await getCurrentUser();
  const connection = await getConnection(user.id);
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/dashboard" className="font-semibold tracking-tight">
          Architect Mastery
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <Link href="/settings">
            <ConnectionBadge connection={connection} health={storedHealth(connection)} />
          </Link>
        </div>
      </div>
    </header>
  );
}
