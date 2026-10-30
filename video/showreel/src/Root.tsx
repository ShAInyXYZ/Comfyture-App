import React from 'react';
import {Composition} from 'remotion';
import {FPS, H, TL, W} from './lib';
import {S1PublicProperty} from './S1PublicProperty';

export const Root: React.FC = () => (
  <>
    <Composition
      id="S1PublicProperty"
      component={S1PublicProperty}
      durationInFrames={Math.round(TL.s1.duration * FPS)}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={{voice: 'original' as const}}
    />
    <Composition
      id="S1PublicPropertyEarl"
      component={S1PublicProperty}
      durationInFrames={Math.round(TL.s1.duration * FPS)}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={{voice: 'earl' as const}}
    />
  </>
);
