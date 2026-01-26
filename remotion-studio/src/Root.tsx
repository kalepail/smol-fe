import React from 'react';
import { Composition } from 'remotion';
import { DeepWikiIntro } from './compositions/DeepWikiIntro';
import { DevTerminal } from './compositions/DevTerminal';
import { StoreDrop } from './compositions/StoreDrop';
import { ArtistSpotlight } from './compositions/ArtistSpotlight';
import { MusicPlayer } from './compositions/MusicPlayer';
import { TransactionSuccess } from './compositions/TransactionSuccess';
import { Logo3D } from './compositions/Logo3D';
import { AppGrid } from './compositions/AppGrid';
import { PixelLoader } from './compositions/PixelLoader';
import { Outro } from './compositions/Outro';

export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition
                id="DeepWikiIntro"
                component={DeepWikiIntro}
                durationInFrames={150}
                fps={30}
                width={1920}
                height={1080}
            />
            <Composition
                id="DevTerminal"
                component={DevTerminal}
                durationInFrames={120}
                fps={30}
                width={1920}
                height={1080}
            />
            <Composition
                id="StoreDrop"
                component={StoreDrop}
                durationInFrames={90}
                fps={30}
                width={1080}
                height={1920}
            />
            <Composition
                id="ArtistSpotlight"
                component={ArtistSpotlight}
                durationInFrames={120}
                fps={30}
                width={1920}
                height={1080}
            />
            <Composition
                id="MusicPlayer"
                component={MusicPlayer}
                durationInFrames={150}
                fps={30}
                width={1920}
                height={1080}
            />
            <Composition
                id="TransactionSuccess"
                component={TransactionSuccess}
                durationInFrames={120}
                fps={30}
                width={1080}
                height={1920}
            />
            <Composition
                id="Logo3D"
                component={Logo3D}
                durationInFrames={180}
                fps={30}
                width={1080}
                height={1080}
            />
            <Composition
                id="AppGrid"
                component={AppGrid}
                durationInFrames={120}
                fps={30}
                width={1920}
                height={1080}
            />
            <Composition
                id="PixelLoader"
                component={PixelLoader}
                durationInFrames={90}
                fps={30}
                width={1080}
                height={1080}
            />
            <Composition
                id="Outro"
                component={Outro}
                durationInFrames={150}
                fps={30}
                width={1920}
                height={1080}
            />
        </>
    );
};
