'use client';

import { BordLockup } from '@/components/bord-brand';
import { OnboardingChat } from '@/components/onboarding-chat/onboarding-chat';

import styles from './setup-wizard.module.css';

export function SetupWizard({ aiEnabled = false }: { aiEnabled?: boolean }) {
  return (
    <main className={`onboarding-page ${styles.page}`}>
      <div className={styles.frame}>
        <header className={styles.brand}>
          <BordLockup />
          <p className={styles.definition}>
            <b>bòrd</b> · Scottish Gaelic, “table”
          </p>
        </header>
        <h1 className="visually-hidden">Welcome to Bòrd</h1>
        <OnboardingChat mode="initial" aiEnabled={aiEnabled} />
      </div>
    </main>
  );
}
