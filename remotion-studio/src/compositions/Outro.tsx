import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { BackgroundMusic } from '../components/BackgroundMusic';

export const Outro: React.FC = () => {
    const frame = useCurrentFrame();

    const opacity = interpolate(frame, [0, 30], [0, 1]);
    const scale = interpolate(frame, [0, 100], [1, 1.1]);

    return (
        <AbsoluteFill style={{ backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' }}>
            <BackgroundMusic />
            <div style={{ opacity, transform: `scale(${scale})`, textAlign: 'center' }}>
                <h1 style={{ color: 'white', fontSize: 60, fontFamily: 'sans-serif', margin: 0 }}>Built with Love</h1>
                <h2 style={{ color: '#4AF626', fontSize: 40, fontFamily: 'sans-serif', marginTop: 20 }}>smol-fe</h2>
                <div style={{ marginTop: 60, display: 'flex', gap: 40, justifyContent: 'center' }}>
                    <div style={{ width: 60, height: 60, backgroundColor: '#333', borderRadius: '50%' }} />
                    <div style={{ width: 60, height: 60, backgroundColor: '#333', borderRadius: '50%' }} />
                    <div style={{ width: 60, height: 60, backgroundColor: '#333', borderRadius: '50%' }} />
                </div>
            </div>
        </AbsoluteFill>
    );
};
