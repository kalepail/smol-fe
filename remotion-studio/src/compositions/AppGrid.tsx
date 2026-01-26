import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { BackgroundMusic } from '../components/BackgroundMusic';

const AppIcon: React.FC<{ index: number, color: string, label: string }> = ({ index, color, label }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const scale = spring({
        frame: frame - (index * 5),
        fps,
        config: { damping: 12 }
    });

    return (
        <div style={{
            width: 200, height: 200, backgroundColor: color, borderRadius: 40,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            transform: `scale(${scale})`,
            flexDirection: 'column'
        }}>
            <div style={{ fontSize: 80, color: 'rgba(255,255,255,0.8)' }}>📱</div>
            <span style={{ color: 'white', marginTop: 10, fontSize: 24, fontFamily: 'sans-serif' }}>{label}</span>
        </div>
    );
};

export const AppGrid: React.FC = () => {
    return (
        <AbsoluteFill style={{ backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
            <BackgroundMusic />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
                <AppIcon index={0} color="#ff5f56" label="Home" />
                <AppIcon index={1} color="#ffbd2e" label="Store" />
                <AppIcon index={2} color="#27c93f" label="Labs" />
                <AppIcon index={3} color="#007aff" label="Vault" />
            </div>
        </AbsoluteFill>
    );
};
