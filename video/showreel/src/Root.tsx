import React from 'react';
import {Composition} from 'remotion';
import {FPS, H, TL, W} from './lib';
import {S1PublicProperty} from './S1PublicProperty';
import {S2Mixer} from './S2Mixer';
import {S3ToasterCabinet} from './S3ToasterCabinet';
import {S4Jam} from './S4Jam';
import {S5Ending} from './S5Ending';

export const Root: React.FC = () => (
  <>
    <Composition
      id="S1PublicProperty"
      component={S1PublicProperty}
      durationInFrames={Math.round(TL.s1.duration * FPS)}
      fps={FPS}
      width={W}
      height={H}
    />
    <Composition id="S5Ending" component={S5Ending} durationInFrames={Math.round(TL.s5.duration * FPS)} fps={FPS} width={W} height={H} />
    <Composition id="S4Jam" component={S4Jam} durationInFrames={Math.round(TL.s4.duration * FPS)} fps={FPS} width={W} height={H} />
    <Composition id="S3ToasterCabinet" component={S3ToasterCabinet} durationInFrames={Math.round(TL.s3.duration * FPS)} fps={FPS} width={W} height={H} />
    <Composition id="S2Mixer" component={S2Mixer} durationInFrames={Math.round(TL.s2.duration * FPS)} fps={FPS} width={W} height={H} />
  </>
);
