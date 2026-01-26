import React from 'react';
import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { BackgroundMusic } from '../components/BackgroundMusic';

export const TransactionSuccess: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const scale = spring({
        frame: frame - 10,
        fps,
        config: { damping: 12 },
    });

    const checkmarkPath = `M20 50 L40 70 L80 30`;
    const dashoffset = Math.max(0, 100 - (frame * 5));

    return (
        <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }}>
            <BackgroundMusic />
            <div style={{
                width: 500, height: 400, backgroundColor: 'white', borderRadius: 30,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                transform: `scale(${scale})`
            }}>
                <div style={{
                    width: 120, height: 120, borderRadius: '50%', backgroundColor: '#4AF626',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 30
                }}>
                    <svg width="100" height="100" viewBox="0 0 100 100">
                        <path d={checkmarkPath} fill="none" stroke="white" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"
                            strokeDasharray={100} strokeDashoffset={dashoffset} />
                    </svg>
                </div>
                <h2 style={{ fontSize: 40, margin: 0 }}>Success!</h2>
                <p style={{ fontSize: 24, color: '#666' }}>Transaction Confirmed</p>
            </div>
        </AbsoluteFill>
    );
};
