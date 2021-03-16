export function setAudioChannel(channel: string): boolean {
  try {
    if (typeof window.navigator['mozAudioChannelManager'] === 'object') {
      window.navigator['mozAudioChannelManager']['volumeControlChannel'] = channel;
      return (window.navigator['mozAudioChannelManager']['volumeControlChannel'] === channel);
    }
  } catch (_) { }

  return false;
}

export function minimizeMemoryUsage() {
  try {
    if (typeof window.navigator['minimizeMemoryUsage'] === 'function') {
      window.navigator['minimizeMemoryUsage']();
    }
  } catch (_) { }
}
