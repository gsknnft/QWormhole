import { useState } from 'react';


export function useLocalStorageSafe<T>(key: string, initialValue: T): {
  value: T;
  setValue: (val: T | ((val: T) => T)) => void;
} {
  if (typeof window === 'undefined') {
    return {
      value: initialValue,
      setValue: () => {},
    };
  }

  return useLocalStorage<T>(key, initialValue);
}


export const getLocalStorageSafe = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(key);
};


export const setLocalStorageSafe = (key: string, value: string): void => {
  if (typeof window === 'undefined') return;
  return window.localStorage.setItem(key, value);
};


export function useLocalStorage<T>(key: string, initialValue: T) {
  const readValue = (): T => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = getLocalStorageSafe(key);
      if (item) {
        return JSON.parse(item, (_, value) =>
          typeof value === 'string' && value.startsWith('BigInt(')
            ? BigInt(value.slice(7, -1))
            : value
        ) as T;
      }
      return initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key “${key}”:`, error);
      return initialValue;
    }
  };

  const [storedValue, setStoredValue] = useState<T>(readValue);

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      const valueToStoreString = JSON.stringify(valueToStore, (_, v) =>
        typeof v === 'bigint' ? `BigInt(${v.toString()})` : v
      );
      setLocalStorageSafe(key, valueToStoreString);
      setStoredValue(valueToStore);
    } catch (error) {
      console.warn(`Error setting localStorage key “${key}”:`, error);
    }
  };

  return {
    value: storedValue,
    setValue,
  };
}


export function useLocalStorageTuple<T>(key: string, initialValue: T) {
  // Retrieve stored value from local storage
  const readValue = (): T => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = getLocalStorageSafe(key);
      if (item) {
        const parsedItem = JSON.parse(item, (key, value) => {
          // Check if the value is a serialized BigInt
          if (typeof value === 'string' && value.startsWith('BigInt(') && value.endsWith(')')) {
            return BigInt(value.slice(7, -1));
          }
          return value;
        });
        return parsedItem as T;
      }
      return initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key “${key}”:`, error);
      return initialValue;
    }
  };

  const [storedValue, setStoredValue] = useState<T>(() => readValue());

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      // Check if the value to store is a BigInt
      const valueToStoreString = JSON.stringify(valueToStore, (key, value) => {
        if (typeof value === 'bigint') {
          return `BigInt(${value.toString()})`;
        }
        return value;
      });
      setLocalStorageSafe(key, valueToStoreString);
      setStoredValue(valueToStore);
    } catch (error) {
      console.warn(`Error setting localStorage key “${key}”:`, error);
    }
  };

  return [storedValue, setValue] as const;
}


export const LocalStorage = {
  use: useLocalStorage,
  useSafe: useLocalStorageSafe,
  useTuple: useLocalStorageTuple,
  get: getLocalStorageSafe,
  set: setLocalStorageSafe,
};
