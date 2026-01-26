import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { BackgroundMusic } from '../components/BackgroundMusic';

const PhotoCard: React.FC<{ rotation: number, color: string, text: string }> = ({ rotation, color, text }) => (
    <div style={{
        width: 300, height: 400, backgroundColor: 'white', padding: 20,
        transform: `rotate(${rotation}deg)`,
        boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', alignItems: 'center'
    }}>
        <div style={{ width: '100%', height: 250, backgroundColor: color, marginBottom: 20 }} />
        <h3 style={{ fontFamily: 'sans-serif' }}>{text}</h3>
    </div>
);

export const ArtistSpotlight: React.FC = () => {
    const frame = useCurrentFrame();

    const entrance1 = interpolate(frame, [0, 30], [1000, 0], { extrapolateRight: 'clamp' });
    const entrance2 = interpolate(frame, [20, 50], [1000, 0], { extrapolateRight: 'clamp' });
    const entrance3 = interpolate(frame, [40, 70], [1000, 0], { extrapolateRight: 'clamp' });

    return (
        <AbsoluteFill style={{ backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: -50 }}>
            <BackgroundMusic />
            <div style={{ transform: `translateY(${entrance1}px)` }}>
                <PhotoCard rotation={-10} color="#ff5f56" text="Artist A" />
            </div>
            <div style={{ transform: `translateY(${entrance2}px)`, zIndex: 1 }}>
                <PhotoCard rotation={0} color="#ffbd2e" text="Artist B" />
            </div>
            <div style={{ transform: `translateY(${entrance3}px)` }}>
                <PhotoCard rotation={10} color="#27c93f" text="Artist C" />
            </div>
        </AbsoluteFill>
    );
};
