import React from 'react';
import {Composition} from 'remotion';
import {FPS, H, TL, W} from './lib';
import {S1PublicProperty} from './S1PublicProperty';
import {S2Mixer} from './S2Mixer';

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
    <Composition id="S2Mixer" component={S2Mixer} durationInFrames={Math.round(TL.s2.duration * FPS)} fps={FPS} width={W} height={H} />
  </>
);
