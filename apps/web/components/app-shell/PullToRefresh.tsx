'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import styles from './PullToRefresh.module.css';

const THRESHOLD = 72; // px of pull needed to trigger a refresh
const MAX_PULL = 96; // px cap on how far the indicator travels
const RESISTANCE = 0.5; // finger-travel to indicator-travel ratio
const SPIN_MS = 800; // how long the spinner shows after triggering

interface PullToRefreshProps {
  /** The scroll container to watch — pull only arms when it's scrolled to the top. */
  scrollRef: RefObject<HTMLElement | null>;
}

export function PullToRefresh({ scrollRef }: PullToRefreshProps) {
  const router = useRouter();
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef(0);
  const pulling = useRef(false);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);

  const setPull = (d: number) => {
    distanceRef.current = d;
    setDistance(d);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const triggerRefresh = () => {
      refreshingRef.current = true;
      setRefreshing(true);
      setPull(THRESHOLD);
      router.refresh();
      window.setTimeout(() => {
        refreshingRef.current = false;
        setRefreshing(false);
        pulling.current = false;
        setPull(0);
      }, SPIN_MS);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || el.scrollTop > 0) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshingRef.current) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0 || el.scrollTop > 0) {
        pulling.current = false;
        setPull(0);
        return;
      }
      // We own the gesture now — stop the browser's native overscroll/refresh.
      e.preventDefault();
      setPull(Math.min(delta * RESISTANCE, MAX_PULL));
    };

    const onTouchEnd = () => {
      if (!pulling.current || refreshingRef.current) return;
      pulling.current = false;
      if (distanceRef.current >= THRESHOLD) {
        triggerRefresh();
      } else {
        setPull(0);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [scrollRef, router]);

  const active = distance > 0 || refreshing;
  const progress = Math.min(distance / THRESHOLD, 1);

  return (
    <div
      className={styles.indicator}
      aria-hidden={!active}
      style={{
        transform: `translateX(-50%) translateY(${distance}px)`,
        opacity: active ? 1 : 0,
        transition: pulling.current
          ? 'opacity 160ms ease'
          : 'transform 220ms ease, opacity 160ms ease',
      }}
    >
      <RefreshCw
        size={18}
        className={refreshing ? styles.spinning : undefined}
        style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
      />
    </div>
  );
}
