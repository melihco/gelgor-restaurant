import { getServerRuntimePublicConfig } from '@/lib/runtime-public-config';

/** Injects Render/runtime API URLs into the browser (NEXT_PUBLIC_* is build-time only in Docker). */
export function RuntimePublicConfigScript() {
  const cfg = getServerRuntimePublicConfig();
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.__SA_PUBLIC_CONFIG=${JSON.stringify(cfg)};`,
      }}
    />
  );
}
