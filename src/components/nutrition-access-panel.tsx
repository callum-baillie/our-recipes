import Link from 'next/link';

import styles from '@/components/nutrition-dashboard.module.css';

export function NutritionAccessPanel() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Household Nutrition</p>
        <h1>Select a household profile to continue.</h1>
        <p>
          Nutrition uses the profile selected in the app header. There is no separate Nutrition
          login, access ID, passphrase, or session.
        </p>
      </header>
      <Link className="primary-button" href="/settings/profiles">
        Manage household profiles
      </Link>
    </main>
  );
}
