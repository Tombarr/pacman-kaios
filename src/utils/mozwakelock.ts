export interface MozWakeLock {
    topic?: string;
    unlock: Function;
}

let screenLock = null; 
let cpuLock = null;

export function requestWakeLock(): void {
    try {
        if (!screenLock && typeof window.navigator['requestWakeLock'] === 'function') {
            screenLock = window.navigator['requestWakeLock']('screen');
            cpuLock = window.navigator['requestWakeLock']('cpu');
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
