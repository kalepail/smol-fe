import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BackgroundMusic } from '../components/BackgroundMusic';

export const Logo3D: React.FC = () => {
    const frame = useCurrentFrame();
    const rotateX = frame * 2;
    const rotateY = frame * 3;

    return (
        <AbsoluteFill style={{
            backgroundColor: '#111', justifyContent: 'center', alignItems: 'center',
            perspective: 1000
        }}>
            <BackgroundMusic />
            <div style={{
                width: 300, height: 300, position: 'relative',
                transformStyle: 'preserve-3d',
                transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
            }}>
                {/* Front */}
                <div style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#ff5f56', transform: 'translateZ(150px)', opacity: 0.8 }} />
                {/* Back */}
                <div style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#ffbd2e', transform: 'translateZ(-150px)', opacity: 0.8 }} />
                {/* Left */}
                <div style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#27c93f', transform: 'rotateY(-90deg) translateZ(150px)', opacity: 0.8 }} />
                {/* Right */}
                <div style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#4AF626', transform: 'rotateY(90deg) translateZ(150px)', opacity: 0.8 }} />
                {/* Top */}
                <div style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#fff', transform: 'rotateX(90deg) translateZ(150px)', opacity: 0.8 }} />
                {/* Bottom */}
                <div style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#aaa', transform: 'rotateX(-90deg) translateZ(150px)', opacity: 0.8 }} />
            </div>
        </AbsoluteFill>
    );
};
