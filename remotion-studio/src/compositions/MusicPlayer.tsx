import React from 'react';
import { AbsoluteFill, useCurrentFrame, random } from 'remotion';
import { BackgroundMusic } from '../components/BackgroundMusic';

const Bar: React.FC<{ index: number; frame: number }> = ({ index, frame }) => {
    const height = 20 + 80 * random(`bar-${index}-${Math.floor(frame / 5)}`);
    return (
        <div style={{
            width: 10, height, backgroundColor: '#4AF626', borderRadius: 5,
            transition: 'height 0.1s ease'
        }} />
    );
};

export const MusicPlayer: React.FC = () => {
    const frame = useCurrentFrame();

    return (
        <AbsoluteFill style={{ backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' }}>
            <BackgroundMusic />
            <div style={{
                width: 600, height: 200, backgroundColor: '#222', borderRadius: 20,
                display: 'flex', alignItems: 'center', padding: 30, gap: 30,
                border: '1px solid #333'
            }}>
                <div style={{ width: 140, height: 140, backgroundColor: '#333', borderRadius: 10 }} />
                <div style={{ flex: 1 }}>
                    <h2 style={{ color: 'white', margin: 0, fontSize: 32 }}>Smol Beats</h2>
                    <p style={{ color: '#888', margin: '5px 0 20px 0', fontSize: 20 }}>Lo-Fi Chill</p>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 60 }}>
                        {new Array(20).fill(0).map((_, i) => (
                            <Bar key={i} index={i} frame={frame} />
                        ))}
                    </div>
                </div>
            </div>
        </AbsoluteFill>
    );
};
