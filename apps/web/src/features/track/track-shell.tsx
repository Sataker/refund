import type { ReactNode } from 'react';
import { SYNTHETIC_LIVE_LABEL } from '@/features/live/data-origin';
import { type Step, stepPath, type TrackProgress } from './steps';
import { TrackFrame } from './track-frame';

// The live `/app` track (E11): the shared TrackFrame with the `/app/comecar/*` URLs and the live seal.
// The layout lives once, in track-frame.tsx, for both /app and /demo (E12).

export { StepTitle } from './track-frame';

interface TrackShellProps {
  step: Step;
  progress: TrackProgress;
  /** The company card is synthetic (persona or replay): the seal says "Dados sintéticos". */
  synthetic?: boolean;
  children: ReactNode;
}

export function TrackShell({ step, progress, synthetic = false, children }: TrackShellProps) {
  return (
    <TrackFrame
      step={step}
      progress={progress}
      hrefOf={stepPath}
      // It does not end the session (the track resumes on return): it only goes back to the site.
      exit={{ href: '/', label: 'Voltar ao site' }}
      live
      {...(synthetic ? { sealLabel: SYNTHETIC_LIVE_LABEL } : {})}
    >
      {children}
    </TrackFrame>
  );
}
