import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BackgroundMusic } from '../components/BackgroundMusic';

const TerminalWindow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{
        width: '80%', height: '60%', backgroundColor: '#1e1e1e', borderRadius: 10,
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)', overflow: 'hidden',
        fontFamily: 'monospace', color: '#fff', fontSize: 24, position: 'relative'
    }}>
        <div style={{
            height: 36, backgroundColor: '#2d2d2d', display: 'flex', alignItems: 'center', paddingLeft: 10, gap: 8
        }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ff5f56' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#27c93f' }} />
        </div>
        <div style={{ padding: 20 }}>
            {children}
        </div>
    </div>
);

export const DevTerminal: React.FC = () => {
    const frame = useCurrentFrame();
    const text = "> npx smol-fe dev";
    const progress = Math.min(text.length, Math.floor(frame / 3));
    const showCursor = frame % 30 < 15;

    return (
        <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
            <BackgroundMusic />
            <TerminalWindow>
                <div>
                    {text.substring(0, progress)}
                    <span style={{ opacity: showCursor ? 1 : 0 }}>_</span>
                </div>
                {frame > 60 && <div style={{ marginTop: 10, color: '#4AF626' }}>✔ Server started on localhost:4321</div>}
                {frame > 90 && <div style={{ marginTop: 10 }}>Ready to rock! 🚀</div>}
            </TerminalWindow>
        </AbsoluteFill>
    );
};
