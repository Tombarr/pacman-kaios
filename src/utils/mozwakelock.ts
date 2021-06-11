export interface MozWakeLock {
    topic?: string;
    unlock: Function;
}

let screenLock = null; 
let cpuLock = null;

export function requestWakeLock(): void {
  if (screenLock) {
    return;
  }

  try {
    // KaiOS 2.5
    if (typeof window.navigator['requestWakeLock'] === 'function') {
        screenLock = window.navigator['requestWakeLock']('screen');
        cpuLock = window.navigator['requestWakeLock']('cpu');
    }

    // KaiOS 3.0
    if (typeof window.navigator['b2g'] === 'object') {
      if (typeof window.navigator['b2g']['requestWakeLock'] === 'function') {
        screenLock = window.navigator['b2g']['requestWakeLock']('screen');
        cpuLock = window.navigator['b2g']['requestWakeLock']('cpu');
      }
    }
  } catch (_) { }
}


export function releaseWakeLock() {
    try {
      if (screenLock && typeof screenLock['unlock'] === 'function') {
        screenLock.unlock();
        screenLock = null;
      }

      if (cpuLock && typeof cpuLock['unlock'] === 'function') {
        cpuLock.unlock();
        cpuLock = null;
      }
    } catch (_) { }
}
