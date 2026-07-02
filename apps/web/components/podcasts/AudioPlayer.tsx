'use client';

import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { Play, Pause } from 'lucide-react';
import { formatTimestamp } from '@/lib/podcasts';
import styles from './AudioPlayer.module.css';

interface Props {
  src: string;
  // Owned by the parent so transcript timestamps can seek the same element.
  audioRef: RefObject<HTMLAudioElement | null>;
  // Feed-supplied duration, used until the element reports its own metadata.
  durationFallback?: number | null;
}

/**
 * Branded audio player. Native <audio controls> can't be styled consistently
 * across browsers, so we drive a hidden <audio> element through the media API
 * and render our own play/pause, scrubber, and time read-out.
 */
export function AudioPlayer({ src, audioRef, durationFallback }: Props) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [metaDuration, setMetaDuration] = useState<number | null>(null);

  const duration =
    metaDuration != null && Number.isFinite(metaDuration) && metaDuration > 0
      ? metaDuration
      : durationFallback != null && durationFallback > 0
        ? durationFallback
        : 0;

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => setMetaDuration(el.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onPause);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onPause);
    };
  }, [audioRef]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const seek = (value: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = value;
    setCurrentTime(value);
  };

  const clampedTime = duration > 0 ? Math.min(currentTime, duration) : currentTime;
  const percent = duration > 0 ? (clampedTime / duration) * 100 : 0;

  return (
    <div className={styles.player}>
      <button
        type="button"
        className={styles.playButton}
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <Pause size={18} strokeWidth={0} fill="currentColor" />
        ) : (
          <Play size={18} strokeWidth={0} fill="currentColor" className={styles.playIcon} />
        )}
      </button>
      <span className={styles.time}>{formatTimestamp(clampedTime)}</span>
      <input
        type="range"
        className={styles.scrubber}
        min={0}
        max={duration || 0}
        step={0.1}
        value={clampedTime}
        onChange={(e) => seek(Number(e.target.value))}
        disabled={duration === 0}
        aria-label="Seek"
        style={{ '--progress': `${percent}%` } as CSSProperties}
      />
      <span className={styles.time}>{duration > 0 ? formatTimestamp(duration) : '--:--'}</span>
      <audio ref={audioRef} preload="none" src={src} />
    </div>
  );
}
