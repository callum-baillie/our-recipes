import { BookOpen, Braces, Library, Tags } from 'lucide-react';
import Link from 'next/link';

const destinations = [
  { id: 'library', href: '/recipes', label: 'Library', icon: Library },
  { id: 'collections', href: '/collections', label: 'Collections', icon: BookOpen },
  { id: 'tags', href: '/tags', label: 'Tags', icon: Tags },
  { id: 'import', href: '/import', label: 'Import', icon: Braces },
] as const;

export function RecipebookNav({ current }: { current: (typeof destinations)[number]['id'] }) {
  return (
    <nav className="recipebook-nav" aria-label="Recipe library">
      {destinations.map(({ id, href, label, icon: Icon }) => (
        <Link href={href} aria-current={current === id ? 'page' : undefined} key={id}>
          <Icon size={16} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
