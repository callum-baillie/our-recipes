import type { NextConfig } from 'next';

const scriptSource =
  process.env.NODE_ENV === 'development'
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline' 'wasm-unsafe-eval'";

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src ${scriptSource}; style-src 'self' 'unsafe-inline'`,
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Runtime household data always lives outside the immutable application
  // artifact. Dynamic filesystem paths can otherwise make output tracing copy
  // the project tree, including a developer's populated DATA_DIR.
  outputFileTracingExcludes: {
    '*': [
      './.api_keys/**',
      './.env*',
      './.git/**',
      './.test-data/**',
      './coverage/**',
      './data/**',
      './docs/**',
      './next.config.ts',
      './playwright-report/**',
      './src/**',
      './test-results/**',
      './tests/**',
      './v1-roadmap.md',
    ],
  },
  // The development server is intentionally reachable from phones on the
  // local network. Next blocks its client runtime for non-localhost hosts
  // unless each trusted development origin is listed explicitly.
  allowedDevOrigins: ['127.0.0.1', '192.168.0.22', 'recipes.tower'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.openfoodfacts.org',
        pathname: '/images/products/**',
      },
    ],
  },
  // Tesseract starts a Node worker and PDF.js loads its Node canvas bridge from
  // installed files. Keep these Node-only packages external and copy them with
  // the standalone server output.
  serverExternalPackages: [
    'tar',
    'tesseract.js',
    'tesseract.js-core',
    '@tesseract.js-data/eng',
    'pdfjs-dist',
    '@napi-rs/canvas',
  ],
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
