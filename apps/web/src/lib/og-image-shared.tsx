import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/site-metadata';

type OgImageMarkupProps = {
  logoSrc?: string;
};

/** Shared JSX for opengraph-image + twitter-image (Next/OG ImageResponse). */
export function OgImageMarkup({ logoSrc }: OgImageMarkupProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '56px 64px',
        background: 'linear-gradient(145deg, #05060f 0%, #0c0d18 42%, #111827 100%)',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        color: '#fafafa',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -120,
          right: -80,
          width: 480,
          height: 480,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 68%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -100,
          left: -60,
          width: 360,
          height: 360,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(129,140,248,0.18) 0%, transparent 70%)',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 20, zIndex: 1 }}>
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} alt="" width={72} height={72} style={{ objectFit: 'contain' }} />
        ) : (
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              fontWeight: 800,
            }}
          >
            S
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em' }}>{SITE_NAME}</div>
          <div style={{ fontSize: 22, color: '#a5b4fc', fontWeight: 500 }}>{SITE_TAGLINE}</div>
        </div>
      </div>

      <div style={{ zIndex: 1, maxWidth: 920 }}>
        <div
          style={{
            fontSize: 34,
            lineHeight: 1.25,
            fontWeight: 600,
            marginBottom: 18,
            letterSpacing: '-0.02em',
          }}
        >
          Markanız için AI creative operations
        </div>
        <div style={{ fontSize: 22, lineHeight: 1.45, color: '#cbd5e1' }}>{SITE_DESCRIPTION}</div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {['Feed & Story', 'Mission Hub', 'Brand DNA', 'Auto Publish'].map((tag) => (
            <div
              key={tag}
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                border: '1px solid rgba(129,140,248,0.35)',
                background: 'rgba(99,102,241,0.12)',
                fontSize: 16,
                color: '#c7d2fe',
              }}
            >
              {tag}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 18, color: '#94a3b8' }}>smartagency-web.onrender.com</div>
      </div>
    </div>
  );
}
