import type { CSSProperties, ReactNode } from 'react';

import styles from './skeleton.module.css';

type SkeletonProps = {
  className?: string;
  height?: CSSProperties['height'];
  width?: CSSProperties['width'];
};

export function Skeleton({ className = '', height, width }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.skeleton} ${className}`.trim()}
      style={{ height, width }}
    />
  );
}

export function SkeletonStatus({
  children,
  className = '',
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      className={`${styles.status} ${className}`.trim()}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {children}
      <span className={styles.srOnly}>{label}</span>
    </div>
  );
}

export function InlineSkeleton({
  label = 'Loading',
  width = '4.5rem',
}: {
  label?: string;
  width?: string;
}) {
  return (
    <span className={styles.inlineStatus} role="status" aria-label={label}>
      <Skeleton className={styles.inline} width={width} />
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}

export function ButtonSpinner() {
  return <span aria-hidden="true" className={styles.buttonSpinner} />;
}

export function AsyncSkeleton({
  className = '',
  label,
  variant = 'panel',
}: {
  className?: string;
  label: string;
  variant?: 'image' | 'message' | 'panel' | 'rows';
}) {
  return (
    <SkeletonStatus className={`${styles.async} ${styles[variant]} ${className}`} label={label}>
      {variant === 'image' ? <Skeleton className={styles.imageBlock} /> : null}
      {variant === 'message' ? (
        <>
          <Skeleton className={styles.avatar} />
          <span className={styles.messageCopy}>
            <Skeleton width="72%" />
            <Skeleton width="48%" />
          </span>
        </>
      ) : null}
      {variant === 'panel' ? (
        <>
          <Skeleton height="1.3rem" width="38%" />
          <Skeleton width="88%" />
          <Skeleton width="64%" />
          <Skeleton className={styles.panelControl} />
        </>
      ) : null}
      {variant === 'rows' ? (
        <>
          {Array.from({ length: 3 }, (_, index) => (
            <span className={styles.asyncRow} key={index}>
              <Skeleton className={styles.rowIcon} />
              <span className={styles.rowCopy}>
                <Skeleton width={`${72 - index * 8}%`} />
                <Skeleton width={`${42 + index * 7}%`} />
              </span>
            </span>
          ))}
        </>
      ) : null}
    </SkeletonStatus>
  );
}

export type PageSkeletonVariant =
  | 'account'
  | 'apiKeys'
  | 'assistant'
  | 'auth'
  | 'collectionDetail'
  | 'collections'
  | 'cook'
  | 'dashboard'
  | 'detail'
  | 'suggestions'
  | 'editor'
  | 'home'
  | 'library'
  | 'offline'
  | 'pantryInventory'
  | 'planner'
  | 'print'
  | 'securityUpgrade'
  | 'settings'
  | 'shoppingList'
  | 'shoppingLists'
  | 'tags'
  | 'workspace';

function HeadingSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={styles.heading}>
      <Skeleton className={styles.eyebrow} />
      <Skeleton className={compact ? styles.titleCompact : styles.title} />
      <Skeleton className={styles.subtitle} />
    </div>
  );
}

function CardGrid({ count = 3 }: { count?: number }) {
  return (
    <div className={styles.cardGrid}>
      {Array.from({ length: count }, (_, index) => (
        <div className={styles.card} key={index}>
          <Skeleton className={styles.cardMedia} />
          <div className={styles.cardCopy}>
            <Skeleton height="1.35rem" width={`${72 + (index % 2) * 12}%`} />
            <Skeleton width="94%" />
            <Skeleton width="66%" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className={styles.formGrid}>
      {Array.from({ length: 6 }, (_, index) => (
        <div className={index === 4 ? styles.formWide : styles.formField} key={index}>
          <Skeleton height="0.75rem" width={`${32 + (index % 3) * 10}%`} />
          <Skeleton className={index === 4 ? styles.textarea : styles.input} />
        </div>
      ))}
    </div>
  );
}

function RowList({ count = 5 }: { count?: number }) {
  return (
    <div className={styles.rowList}>
      {Array.from({ length: count }, (_, index) => (
        <div className={styles.row} key={index}>
          <Skeleton className={styles.rowIcon} />
          <div className={styles.rowCopy}>
            <Skeleton height="1rem" width={`${54 + (index % 3) * 12}%`} />
            <Skeleton width={`${36 + (index % 2) * 18}%`} />
          </div>
          <Skeleton className={styles.rowAction} />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({
  as: Tag = 'main',
  label = 'Loading page',
  variant,
}: {
  as?: 'div' | 'main';
  label?: string;
  variant: PageSkeletonVariant;
}) {
  let body: ReactNode;

  if (variant === 'auth') {
    body = (
      <div className={styles.authPage}>
        <Skeleton className={styles.authBrand} />
        <div className={styles.authCard}>
          <Skeleton height="2rem" width="58%" />
          <Skeleton width="84%" />
          <Skeleton className={styles.input} />
          <Skeleton className={styles.input} />
          <Skeleton className={styles.buttonWide} />
          <Skeleton width="44%" />
        </div>
      </div>
    );
  } else if (variant === 'securityUpgrade') {
    body = (
      <div className={styles.upgradePage}>
        <div className={styles.upgradeIntro}>
          <Skeleton className={styles.authBrand} />
          <HeadingSkeleton compact />
          <Skeleton width="94%" />
          <Skeleton width="82%" />
          <Skeleton width="68%" />
        </div>
        <div className={styles.upgradeForm}>
          <Skeleton height="1.6rem" width="48%" />
          <FormSkeleton />
          <Skeleton className={styles.buttonWide} />
        </div>
      </div>
    );
  } else if (variant === 'account') {
    body = (
      <>
        <HeadingSkeleton />
        <div className={styles.tabs}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className={styles.tab} key={index} />
          ))}
        </div>
        <div className={styles.accountGrid}>
          <div className={styles.panel}>
            <Skeleton height="1.4rem" width="42%" />
            <FormSkeleton />
          </div>
          <div className={styles.panel}>
            <Skeleton height="1.4rem" width="36%" />
            <RowList count={3} />
          </div>
        </div>
      </>
    );
  } else if (variant === 'apiKeys') {
    body = (
      <>
        <HeadingSkeleton />
        <div className={styles.apiKeyLayout}>
          <div className={styles.apiKeyPanel}>
            <div className={styles.toolbar}>
              <span className={styles.apiKeyHeading}>
                <Skeleton height="1.4rem" width="9rem" />
                <Skeleton width="85%" />
              </span>
              <Skeleton className={styles.buttonWide} />
            </div>
            <div className={styles.apiPermissionGrid}>
              <Skeleton width="5rem" />
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton height="0.8rem" width="3.5rem" key={index} />
              ))}
              {Array.from({ length: 4 }, (_, row) => (
                <span className={styles.apiPermissionRow} key={row}>
                  <Skeleton height="1rem" width={`${56 + row * 8}%`} />
                  {Array.from({ length: 4 }, (_, column) => (
                    <Skeleton className={styles.checkbox} key={column} />
                  ))}
                </span>
              ))}
            </div>
          </div>
          <div className={styles.apiKeyPanel}>
            <Skeleton height="1.4rem" width="10rem" />
            <RowList count={3} />
          </div>
        </div>
      </>
    );
  } else if (variant === 'assistant') {
    body = (
      <>
        <HeadingSkeleton compact />
        <div className={styles.assistantPanel}>
          <div className={styles.assistantMessages}>
            <div className={styles.assistantMessage}>
              <Skeleton className={styles.avatar} />
              <span className={styles.messageCopy}>
                <Skeleton width="80%" />
                <Skeleton width="56%" />
              </span>
            </div>
            <div className={`${styles.assistantMessage} ${styles.assistantMessageUser}`}>
              <span className={styles.messageCopy}>
                <Skeleton width="68%" />
                <Skeleton width="42%" />
              </span>
            </div>
            <div className={styles.assistantMessage}>
              <Skeleton className={styles.avatar} />
              <span className={styles.messageCopy}>
                <Skeleton width="88%" />
                <Skeleton width="72%" />
                <Skeleton width="48%" />
              </span>
            </div>
          </div>
          <div className={styles.assistantComposer}>
            <Skeleton className={styles.input} />
            <Skeleton className={styles.button} />
          </div>
        </div>
      </>
    );
  } else if (variant === 'suggestions') {
    body = (
      <>
        <HeadingSkeleton compact />
        <div className={styles.suggestionsPanel}>
          <div className={styles.suggestionsFields}>
            {Array.from({ length: 3 }, (_, index) => (
              <div className={styles.formField} key={index}>
                <Skeleton height="0.75rem" width={`${42 + index * 8}%`} />
                <Skeleton className={styles.input} />
              </div>
            ))}
          </div>
          <Skeleton width="88%" />
          <div className={styles.formField}>
            <Skeleton height="0.75rem" width="27%" />
            <Skeleton className={styles.textarea} />
          </div>
          <div className={styles.suggestionsConsent}>
            <Skeleton className={styles.checkbox} />
            <span className={styles.suggestionsConsentCopy}>
              <Skeleton width="92%" />
              <Skeleton width="68%" />
            </span>
          </div>
          <div className={styles.toolbar}>
            <Skeleton className={styles.buttonWide} />
            <Skeleton width="12rem" height="1rem" />
          </div>
          <Skeleton width="76%" />
        </div>
        <div className={styles.suggestionsResults}>
          {Array.from({ length: 2 }, (_, index) => (
            <div className={styles.suggestionCard} key={index}>
              <Skeleton height="1.2rem" width={`${64 + index * 12}%`} />
              <Skeleton width="92%" />
              <Skeleton width="78%" />
              <Skeleton width="54%" />
              <div className={styles.toolbar}>
                <Skeleton className={styles.buttonWide} />
                <Skeleton className={styles.button} />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  } else if (variant === 'home') {
    body = (
      <>
        <div className={styles.homeHero}>
          <HeadingSkeleton />
          <Skeleton className={styles.heroMedia} />
        </div>
        <div className={styles.toolbar}>
          <Skeleton className={styles.search} />
          <Skeleton className={styles.button} />
        </div>
        <CardGrid />
      </>
    );
  } else if (variant === 'planner') {
    body = (
      <>
        <div className={styles.headingAction}>
          <HeadingSkeleton />
          <Skeleton className={styles.buttonWide} />
        </div>
        <div className={styles.plannerGrid}>
          <div className={styles.setupPanel}>
            <Skeleton height="1.8rem" width="72%" />
            <FormSkeleton />
          </div>
          <div className={styles.calendarPanel}>
            <div className={styles.calendarHeader}>
              <Skeleton height="2rem" width="38%" />
              <Skeleton className={styles.buttonWide} />
            </div>
            <div className={styles.calendarGrid}>
              {Array.from({ length: 21 }, (_, index) => (
                <Skeleton className={styles.calendarCell} key={index} />
              ))}
            </div>
          </div>
        </div>
      </>
    );
  } else if (variant === 'dashboard') {
    body = (
      <>
        <HeadingSkeleton />
        <div className={styles.tabs}>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton className={styles.tab} key={index} />
          ))}
        </div>
        <div className={styles.metricGrid}>
          {Array.from({ length: 4 }, (_, index) => (
            <div className={styles.metric} key={index}>
              <Skeleton className={styles.metricIcon} />
              <Skeleton height="2rem" width="48%" />
              <Skeleton width="72%" />
            </div>
          ))}
        </div>
        <div className={styles.chartGrid}>
          <Skeleton className={styles.chart} />
          <Skeleton className={styles.chart} />
        </div>
      </>
    );
  } else if (variant === 'detail') {
    body = (
      <>
        <div className={styles.detailHero}>
          <Skeleton className={styles.detailMedia} />
          <HeadingSkeleton />
        </div>
        <div className={styles.detailGrid}>
          <div className={styles.panel}>
            <RowList count={5} />
          </div>
          <div className={styles.panel}>
            <RowList count={4} />
          </div>
        </div>
      </>
    );
  } else if (variant === 'editor') {
    body = (
      <>
        <HeadingSkeleton compact />
        <div className={styles.editorGrid}>
          <div className={styles.panel}>
            <FormSkeleton />
          </div>
          <div className={styles.panel}>
            <Skeleton className={styles.editorMedia} />
            <RowList count={3} />
          </div>
        </div>
      </>
    );
  } else if (variant === 'settings') {
    body = (
      <>
        <HeadingSkeleton />
        <div className={styles.settingsStack}>
          {Array.from({ length: 3 }, (_, index) => (
            <div className={styles.settingsPanel} key={index}>
              <div>
                <Skeleton height="1.35rem" width="48%" />
                <Skeleton width="82%" />
                <Skeleton width="64%" />
              </div>
              <FormSkeleton />
            </div>
          ))}
        </div>
      </>
    );
  } else if (variant === 'workspace') {
    body = (
      <>
        <div className={styles.headingAction}>
          <HeadingSkeleton />
          <Skeleton className={styles.buttonWide} />
        </div>
        <div className={styles.inventoryMetrics}>
          {Array.from({ length: 4 }, (_, index) => (
            <div className={styles.metric} key={index}>
              <Skeleton className={styles.metricIcon} />
              <Skeleton height="1.8rem" width="40%" />
              <Skeleton width="72%" />
            </div>
          ))}
        </div>
        <div className={styles.toolbar}>
          <Skeleton className={styles.search} />
          <Skeleton className={styles.buttonWide} />
        </div>
        <div className={styles.panel}>
          <RowList count={6} />
        </div>
      </>
    );
  } else if (variant === 'cook') {
    body = (
      <div className={styles.cookGrid}>
        <HeadingSkeleton compact />
        <div className={styles.cookHero}>
          <Skeleton className={styles.stepMedia} />
          <div className={styles.cookRecipeCopy}>
            <Skeleton height="1.6rem" width="62%" />
            <Skeleton width="90%" />
            <Skeleton width="70%" />
            <div className={styles.toolbar}>
              <Skeleton className={styles.buttonWide} />
              <Skeleton className={styles.buttonWide} />
            </div>
          </div>
        </div>
        <div className={styles.cookStep}>
          <div className={styles.cookProgress}>
            <Skeleton height="0.75rem" width="7rem" />
            <Skeleton className={styles.progressTrack} />
          </div>
          <div className={styles.panel}>
            <Skeleton height="1.4rem" width="18%" />
            <Skeleton className={styles.instructionLine} />
            <Skeleton className={styles.instructionLine} />
            <Skeleton className={styles.instructionShort} />
          </div>
          <div className={styles.toolbar}>
            <Skeleton className={styles.buttonWide} />
            <Skeleton className={styles.buttonWide} />
          </div>
        </div>
      </div>
    );
  } else if (variant === 'pantryInventory') {
    body = (
      <>
        <HeadingSkeleton compact />
        <div className={styles.inventoryMetrics}>
          {Array.from({ length: 4 }, (_, index) => (
            <div className={styles.metric} key={index}>
              <Skeleton className={styles.metricIcon} />
              <Skeleton height="1.8rem" width="40%" />
              <Skeleton width="72%" />
            </div>
          ))}
        </div>
        <div className={styles.toolbar}>
          <Skeleton className={styles.search} />
          <Skeleton className={styles.buttonWide} />
        </div>
        <div className={styles.panel}>
          <RowList count={7} />
        </div>
      </>
    );
  } else if (variant === 'print') {
    body = (
      <>
        <HeadingSkeleton />
        <div className={styles.printGrid}>
          <div className={styles.panel}>
            <Skeleton height="1.35rem" width="42%" />
            <FormSkeleton />
            <Skeleton className={styles.buttonWide} />
          </div>
          <div className={styles.printPreview}>
            <Skeleton height="1.35rem" width="36%" />
            <RowList count={5} />
          </div>
        </div>
      </>
    );
  } else if (variant === 'collections') {
    body = (
      <>
        <HeadingSkeleton />
        <div className={styles.collectionLayout}>
          <div className={styles.panel}>
            <Skeleton height="1.35rem" width="48%" />
            <FormSkeleton />
            <Skeleton className={styles.buttonWide} />
          </div>
          <CardGrid count={4} />
        </div>
      </>
    );
  } else if (variant === 'collectionDetail') {
    body = (
      <>
        <div className={styles.detailHero}>
          <Skeleton className={styles.detailMedia} />
          <div className={styles.cookRecipeCopy}>
            <HeadingSkeleton compact />
            <Skeleton width="88%" />
            <Skeleton width="62%" />
            <Skeleton className={styles.buttonWide} />
          </div>
        </div>
        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <Skeleton height="1.4rem" width="34%" />
            <Skeleton className={styles.buttonWide} />
          </div>
          <RowList count={5} />
        </div>
      </>
    );
  } else if (variant === 'tags') {
    body = (
      <>
        <HeadingSkeleton />
        <div className={styles.toolbar}>
          <Skeleton className={styles.search} />
          <Skeleton className={styles.buttonWide} />
        </div>
        <div className={styles.panel}>
          <RowList count={7} />
        </div>
      </>
    );
  } else if (variant === 'shoppingLists') {
    body = (
      <>
        <HeadingSkeleton />
        <div className={styles.shoppingListsLayout}>
          <div className={styles.panel}>
            <Skeleton height="1.35rem" width="44%" />
            <Skeleton className={styles.input} />
            <Skeleton className={styles.buttonWide} />
            <Skeleton width="68%" />
          </div>
          <div className={styles.shoppingListsMain}>
            <div className={styles.toolbar}>
              <Skeleton className={styles.search} />
              <Skeleton className={styles.button} />
            </div>
            <CardGrid count={4} />
          </div>
        </div>
      </>
    );
  } else if (variant === 'shoppingList') {
    body = (
      <>
        <div className={styles.headingAction}>
          <HeadingSkeleton compact />
          <div className={styles.toolbar}>
            <Skeleton className={styles.buttonWide} />
            <Skeleton className={styles.buttonWide} />
          </div>
        </div>
        <div className={styles.toolbar}>
          <Skeleton className={styles.search} />
          <Skeleton className={styles.button} />
          <Skeleton className={styles.button} />
          <Skeleton className={styles.button} />
        </div>
        <div className={styles.panel}>
          <RowList count={7} />
        </div>
      </>
    );
  } else if (variant === 'offline') {
    body = (
      <div className={styles.offlineCard}>
        <Skeleton className={styles.metricIcon} />
        <HeadingSkeleton compact />
        <Skeleton className={styles.buttonWide} />
      </div>
    );
  } else {
    body = (
      <>
        <HeadingSkeleton />
        <div className={styles.toolbar}>
          <Skeleton className={styles.search} />
          <Skeleton className={styles.buttonWide} />
        </div>
        <CardGrid count={variant === 'library' ? 6 : 3} />
      </>
    );
  }

  return (
    <Tag className={styles.page} data-skeleton-page={variant}>
      <SkeletonStatus className={styles.pageInner} label={label}>
        {body}
      </SkeletonStatus>
    </Tag>
  );
}
