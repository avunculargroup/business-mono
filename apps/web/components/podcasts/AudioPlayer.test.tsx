import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';

import { AudioPlayer } from './AudioPlayer';

// jsdom stubs media playback, so drive the element's play/pause via spies that
// dispatch the corresponding events the component listens for.
let playSpy: MockInstance;
let pauseSpy: MockInstance;

beforeEach(() => {
  playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event('pause'));
  });
});

afterEach(() => {
  playSpy.mockRestore();
  pauseSpy.mockRestore();
});

describe('AudioPlayer', () => {
  it('renders the fallback duration until metadata loads', () => {
    const ref = createRef<HTMLAudioElement>();
    render(<AudioPlayer src="https://example.com/ep.mp3" audioRef={ref} durationFallback={125} />);

    // 125s → 2:05; current position starts at 0:00.
    expect(screen.getByText('2:05')).toBeInTheDocument();
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('shows a placeholder duration and disables seeking when duration is unknown', () => {
    const ref = createRef<HTMLAudioElement>();
    render(<AudioPlayer src="https://example.com/ep.mp3" audioRef={ref} durationFallback={null} />);

    expect(screen.getByText('--:--')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Seek' })).toBeDisabled();
  });

  it('toggles the play/pause control via the media element', () => {
    const ref = createRef<HTMLAudioElement>();
    render(<AudioPlayer src="https://example.com/ep.mp3" audioRef={ref} durationFallback={60} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(playSpy).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('seeks the media element when the scrubber moves', () => {
    const ref = createRef<HTMLAudioElement>();
    render(<AudioPlayer src="https://example.com/ep.mp3" audioRef={ref} durationFallback={100} />);

    const scrubber = screen.getByRole('slider', { name: 'Seek' });
    fireEvent.change(scrubber, { target: { value: '30' } });

    expect(ref.current?.currentTime).toBe(30);
    expect(screen.getByText('0:30')).toBeInTheDocument();
  });
});
