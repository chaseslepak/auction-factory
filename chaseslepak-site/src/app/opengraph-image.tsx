import { ImageResponse } from 'next/og';

export const alt = 'Chase Slepak — Operator + Builder | Cleveland, OH';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#F5F2EC',
          color: '#181613',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          fontFamily: 'serif',
        }}
      >
        <div
          style={{
            fontSize: 18,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: '#6B2D2C',
            fontFamily: 'sans-serif',
          }}
        >
          Cleveland, OH
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 132,
              lineHeight: 1.0,
              fontWeight: 900,
              letterSpacing: '-0.01em',
            }}
          >
            Chase Slepak
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 32,
              color: '#5C544B',
              fontFamily: 'sans-serif',
              maxWidth: 900,
              lineHeight: 1.35,
            }}
          >
            Operator + builder. Pretty Tasty, Boylan Bottling, RainShadow Labs.
            Founder of Reagan Brooks.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: 18,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: '#5C544B',
            fontFamily: 'sans-serif',
          }}
        >
          <span>chaseslepak.com</span>
          <span style={{ color: '#6B2D2C' }}>Plow horse.</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
