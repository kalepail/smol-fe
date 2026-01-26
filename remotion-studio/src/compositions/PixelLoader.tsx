import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BackgroundMusic } from '../components/BackgroundMusic';

export const PixelLoader: React.FC = () => {
    const frame = useCurrentFrame();

    // Rotating pixel hourglass
    const rotation = Math.floor(frame / 10) * 90;

    return (
        <AbsoluteFill style={{ backgroundColor: '#2d2d2d', justifyContent: 'center', alignItems: 'center' }}>
            <BackgroundMusic />
            <div style={{
                width: 100, height: 100, position: 'relative',
                transform: `rotate(${rotation}deg)`,
                transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: 40, height: 40, backgroundColor: '#4AF626' }} />
                <div style={{ position: 'absolute', top: 0, right: 0, width: 40, height: 40, backgroundColor: '#fff' }} />
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, backgroundColor: '#4AF626' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 40, height: 40, backgroundColor: '#fff' }} />
            </div>
            <h3 style={{ color: '#fff', marginTop: 60, fontFamily: '"Press Start 2P", monospace', fontSize: 24 }}>LOADING...</h3>
        </AbsoluteFill>
    );
};
