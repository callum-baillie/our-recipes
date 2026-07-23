'use client';

import { BordLockup } from '@/components/bord-brand';
import { OnboardingWizard } from '@/components/onboarding-wizard';

export function SetupWizard() {
  return (
    <main className="setup-page onboarding-page">
      <section className="setup-intro bord-intro" aria-labelledby="setup-title">
        <BordLockup className="onboarding-brand-lockup" />
        <h1 className="visually-hidden" id="setup-title">
          Welcome to Bòrd
        </h1>
        <dl className="brand-definition" aria-label="Bòrd definition">
          <div>
            <dt>bòrd</dt>
            <dd>Scottish Gaelic</dd>
          </div>
          <div>
            <dt>English translation</dt>
            <dd>Table</dd>
          </div>
        </dl>
        <p className="brand-fun-definition">
          A communal area where kin unite to eat and end the day.
        </p>
        <div className="brand-explainer">
          <p>
            Bòrd is a recipe keeper, a meal planner, a nutritional advisor, a grocery store helper.
          </p>
          <p>Our goal is to make life easier and get everyone to the table.</p>
        </div>
      </section>
      <OnboardingWizard mode="initial" />
    </main>
  );
}
