'use client';

import { useState, useEffect, useCallback } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) setStoredValue(JSON.parse(item));
    } catch {
      // Use initial value on error
    }
  }, [key]);

  const setValue = useCallback(
    (value: T) => {
      setStoredValue(value);
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Ignore write errors
      }
    },
    [key]
  );

  return [storedValue, setValue];
}
