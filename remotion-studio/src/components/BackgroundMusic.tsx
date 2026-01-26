import { Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";

export const BackgroundMusic: React.FC<{
    volume?: number;
}> = ({ volume = 0.5 }) => {
    const frame = useCurrentFrame();
    const { durationInFrames } = useVideoConfig();

    // Fade out in the last 1 second (30 frames)
    const fadeFrame = 30;
    const opacity = frame > durationInFrames - fadeFrame
        ? (durationInFrames - frame) / fadeFrame
        : 1;

    return (
        <Audio
            src={staticFile("music.mp3")}
            volume={volume * opacity}
            loop
        />
    );
};
