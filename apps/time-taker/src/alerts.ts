let audio: AudioContext | null = null;

/** Create/resume the AudioContext. Call from a click or key handler so the browser allows sound later. */
export function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null;
  }
}

/** Three short beeps. Returns false when no audio output is available. */
export function beep(): boolean {
  if (!audio) unlockAudio();
  const ctx = audio;
  if (!ctx) return false;
  const start = ctx.currentTime + 0.02;
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = start + i * 0.3;
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  }
  return true;
}

export type NotifyState = NotificationPermission | 'unsupported';

export function notifyState(): NotifyState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** Must be called from a user action. */
export async function requestNotifications(): Promise<NotifyState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function notify(title: string, body: string): void {
  if (notifyState() !== 'granted') return;
  try {
    new Notification(title, { body, tag: title });
  } catch {
    // Some mobile browsers only allow notifications through a service worker; the in-page alert still shows.
  }
}
