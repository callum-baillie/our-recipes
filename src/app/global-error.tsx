'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '1.5rem',
          color: '#232a1b',
          background: '#f7f8f5',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <main style={{ maxWidth: '36rem', textAlign: 'center' }}>
          <p style={{ letterSpacing: '0.14em', fontSize: '0.75rem', fontWeight: 700 }}>
            BÒRD NEEDS A RESTART
          </p>
          <h1 style={{ margin: '0.5rem 0', fontFamily: 'Georgia, serif', fontWeight: 500 }}>
            The app shell could not be loaded.
          </h1>
          <p style={{ color: '#596458', lineHeight: 1.6 }}>
            Your saved recipes and household data were not changed. Try loading the app shell again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: '2.75rem',
              padding: '0.65rem 1rem',
              color: '#fffdf8',
              background: '#4a6b3c',
              border: 0,
              borderRadius: '0.6rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
