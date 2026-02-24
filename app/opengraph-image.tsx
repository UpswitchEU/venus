import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = 'UpSwitch Valuation — Professional Business Valuations'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f1219 0%, #1a1f2e 50%, #0f1219 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              backgroundClip: 'text',
              color: 'transparent',
              letterSpacing: '-2px',
            }}
          >
            UpSwitch
          </div>
          <div
            style={{
              fontSize: 28,
              color: 'rgba(255, 255, 255, 0.7)',
              fontWeight: 500,
              maxWidth: '700px',
              textAlign: 'center',
              lineHeight: 1.4,
            }}
          >
            Professional Business Valuations
          </div>
          <div
            style={{
              display: 'flex',
              gap: '32px',
              marginTop: '24px',
            }}
          >
            {['EBITDA', 'DCF', 'Multiples'].map((label) => (
              <div
                key={label}
                style={{
                  padding: '8px 24px',
                  borderRadius: '999px',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: 16,
                  fontWeight: 500,
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            color: 'rgba(255, 255, 255, 0.3)',
            fontSize: 16,
          }}
        >
          valuation.upswitch.app
        </div>
      </div>
    ),
    { ...size },
  )
}
