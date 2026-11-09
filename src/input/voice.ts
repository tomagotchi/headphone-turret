export type VoiceCommand = 'shield' | 'reload' | 'pause';

const WORDS: Record<string, VoiceCommand> = {
  shield: 'shield',
  shields: 'shield',
  reload: 'reload',
  pause: 'pause',
  paws: 'pause', // common mishearing
};

export type VoiceStatus = 'unsupported' | 'off' | 'listening' | 'blocked';

/* The Web Speech API isn't in TypeScript's standard typings everywhere. */
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  processLocally?: boolean;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionCtor = {
  new (): Recognition;
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>;
};

function getCtor(): RecognitionCtor | null {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Optional voice commands via the browser's built-in speech recognition.
 * The game never depends on it: every command also has a key.
 */
export class VoiceCommands {
  status: VoiceStatus = getCtor() ? 'off' : 'unsupported';
  /** True when the browser confirmed recognition runs on this device. */
  onDevice = false;
  onCommand: (c: VoiceCommand) => void = () => {};
  onStatus: () => void = () => {};

  private rec: Recognition | null = null;
  private wanted = false;
  /** Words already acted on within the current phrase, so interim results don't repeat. */
  private handled = new Map<number, Set<VoiceCommand>>();

  static get supported(): boolean {
    return getCtor() !== null;
  }

  /** Does this browser offer speech recognition that stays on the device? */
  static async canRunOnDevice(): Promise<boolean> {
    const ctor = getCtor();
    if (!ctor?.available) return false;
    try {
      return (await ctor.available({ langs: ['en-US'], processLocally: true })) === 'available';
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    const ctor = getCtor();
    if (!ctor || this.wanted) return;
    this.wanted = true;
    this.onDevice = await VoiceCommands.canRunOnDevice();
    if (!this.wanted) return;

    const rec = new ctor();
    rec.continuous = true;
    rec.interimResults = true; // act on a word as soon as it's heard
    rec.lang = 'en-US';
    if (this.onDevice) rec.processLocally = true;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text: string = e.results[i][0].transcript.toLowerCase();
        let seen = this.handled.get(i);
        if (!seen) this.handled.set(i, (seen = new Set()));
        for (const word of text.split(/[^a-z]+/)) {
          const cmd = WORDS[word];
          if (cmd && !seen.has(cmd)) {
            seen.add(cmd);
            this.onCommand(cmd);
          }
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.wanted = false;
        this.setStatus('blocked');
      }
    };
    rec.onend = () => {
      // Browsers stop listening after a silence; keep it going while enabled.
      this.handled.clear();
      if (this.wanted) {
        try {
          rec.start();
        } catch {
          /* already restarting */
        }
      } else if (this.status !== 'blocked') {
        this.setStatus('off');
      }
    };

    this.rec = rec;
    try {
      rec.start();
      this.setStatus('listening');
    } catch {
      this.wanted = false;
      this.setStatus('blocked');
    }
  }

  stop(): void {
    this.wanted = false;
    this.rec?.stop();
    this.rec = null;
    if (this.status === 'listening') this.setStatus('off');
  }

  private setStatus(s: VoiceStatus): void {
    this.status = s;
    this.onStatus();
  }
}
