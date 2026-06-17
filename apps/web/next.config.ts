import type { NextConfig } from 'next';

/** Sunucu tarafında rewrite hedefi; tarayıcı `localhost:3000` (npm run dev) → API’ye proxylanır */
/** Yerel `dotnet run` çoğunlukla 5050; 5000 macOS’ta AirPlay ile çakışır. Docker için .env ile 5000 verin. */
const BACKEND_ORIGIN =
  process.env.BACKEND_ORIGIN ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:5050';

const normalizedBackend = BACKEND_ORIGIN.replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  /**
   * `next dev` sırasında Next.js 15+, localhost dışındaki Host/Origin’leri (ngrok vb.)
   * güvenlik için reddedebilir ve 403 döner. Tünel ile Canva OAuth / webhook testi için gerekli.
   */
  allowedDevOrigins: ['*.ngrok-free.app', '*.ngrok-free.dev', '*.ngrok.io'],
  experimental: {
    optimizePackageImports: [
      '@react-three/fiber',
      '@react-three/drei',
      'lucide-react',
      '@tanstack/react-query',
      '@microsoft/signalr',
    ],
    /**
     * Varsayılan ~30 sn proxy limiti, Crew/LLM çağrılarını keser (content_ideation vb. 1–5 dk sürebilir).
     * .NET OrchestrationService:TimeoutSeconds (ör. 300) + pay bırakır.
     */
    proxyTimeout: 360_000,
  },
  // WASM, native binaries and Remotion renderer must not be bundled by webpack
  serverExternalPackages: [
    '@resvg/resvg-js',
    'satori',
    // Remotion server-side renderer: uses native Chrome/Puppeteer binaries
    '@remotion/bundler',
    '@remotion/renderer',
    'remotion',
  ],
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: ['@svgr/webpack'],
    });
    // Allow webpack to load WASM modules (used by satori/yoga)
    config.experiments = { ...(config.experiments ?? {}), asyncWebAssembly: true };
    return config;
  },
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  /** Ana sayfa → /mobile (query string korunur). Masaüstü ofis SPA: /desk */
  async redirects() {
    return [
      {
        source: '/',
        destination: '/mobile',
        permanent: false,
      },
    ];
  },

  /** Runtime route handler (`/api/nexus-backend/[...path]`) proxies using BACKEND_ORIGIN/NEXUS_API_URL. */
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/nexus-signalr/:path*',
          destination: `${normalizedBackend}/:path*`,
        },
        {
          source: '/nexus-health/:path*',
          destination: `${normalizedBackend}/health/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
