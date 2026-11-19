import type { ReactNode } from 'react';
import { type Step, stepPath, type TrackProgress } from './steps';
import { TrackFrame } from './track-frame';

// The live `/app` track (E11): the shared TrackFrame with the `/app/comecar/*` URLs and the live seal.
// The layout lives once, in track-frame.tsx, for both /app and /demo (E12).

export { StepTitle } from './track-frame';

interface TrackShellProps {
  step: Step;
  progress: TrackProgress;
  children: ReactNode;
}

export function TrackShell({ step, progress, children }: TrackShellProps) {
  return (
    <TrackFrame
      step={step}
      progress={progress}
      hrefOf={stepPath}
      exit={{ href: '/', label: 'Sair' }}
      live
    >
      {children}
    </TrackFrame>
  );
}
