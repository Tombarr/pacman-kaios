export function setAudioChannel(channel: string): boolean {
  try {
    // KaiOS 2.5
    if (typeof window.navigator['mozAudioChannelManager'] === 'object') {
      window.navigator['mozAudioChannelManager']['volumeControlChannel'] = channel;
      return (window.navigator['mozAudioChannelManager']['volumeControlChannel'] === channel);
    }

    // KaiOS 3.0
    if (typeof window.navigator['b2g'] === 'object') {
      if (typeof window.navigator['b2g']['audioChannelManager'] === 'object') {
        window.navigator['b2g']['audioChannelManager']['volumeControlChannel'] = channel;
        return (window.navigator['b2g']['audioChannelManager']['volumeControlChannel'] === channel);
      }
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
