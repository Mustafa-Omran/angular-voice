import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type RecorderFormat = 'webm' | 'wav';

export interface RecordingResult {
  blob: Blob;
  file: File;
  durationMs: number;
  mimeType: string;
}

@Injectable({ providedIn: 'root' })
export class AudioRecorderService {
  private mediaStream?: MediaStream;
  private mediaRecorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private startTs = 0;

  private audioCtx?: AudioContext;
  private sourceNode?: MediaStreamAudioSourceNode;
  private processorNode?: ScriptProcessorNode;
  private pcmBuffers: Float32Array[] = [];
  private sampleRate = 48000; // updated from AudioContext once started

  constructor(@Inject(PLATFORM_ID) private platformId: Object) { }

  get isBrowser() { return isPlatformBrowser(this.platformId); }

  /** Ask for mic permission and create the stream */
  async prepare(): Promise<void> {
    if (!this.isBrowser) return;
    if (this.mediaStream) return;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }

  /** Start recording in chosen format */
  async start(format: RecorderFormat = 'webm', desiredSampleRate?: number): Promise<void> {
    if (!this.isBrowser) throw new Error('Recording only works in browser.');
    await this.prepare();

    this.chunks = [];
    this.pcmBuffers = [];
    this.startTs = performance.now();

    if (format === 'webm' && this.supportsMediaRecorder('audio/webm')) {
      // MediaRecorder path (smaller files, great quality)
      const mimeType = this.pickWebmMime();
      this.mediaRecorder = new MediaRecorder(this.mediaStream!, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => { if (e.data?.size) this.chunks.push(e.data); };
      this.mediaRecorder.start(); // you can pass timeslice if you want periodic chunks
      return;
    }

    // WAV fallback (works widely, larger files)
    // Build a simple ScriptProcessor chain to capture PCM
    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: desiredSampleRate ?? undefined,
    }) as AudioContext;
    this.sampleRate = this.audioCtx.sampleRate;

    this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream!);
    // ScriptProcessor is deprecated but still widely supported; AudioWorklet would be the modern alt.
    this.processorNode = this.audioCtx.createScriptProcessor(4096, 1, 1);
    this.processorNode.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      // Copy the chunk so it doesn't mutate
      this.pcmBuffers.push(new Float32Array(input));
    };
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioCtx.destination);
  }

  /** Stop and produce RecordingResult */
  async stop(format: RecorderFormat = 'webm'): Promise<RecordingResult> {
    const durationMs = performance.now() - this.startTs;

    if (format === 'webm' && this.mediaRecorder) {
      const recorder = this.mediaRecorder;
      const stopPromise = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      if (recorder.state !== 'inactive') recorder.stop();
      await stopPromise;

      const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
      const file = new File([blob], `recording-${Date.now()}.webm`, { type: blob.type });
      this.cleanupMediaRecorder();
      return { blob, file, durationMs, mimeType: blob.type };
    }

    // WAV path
    const wavBlob = this.encodeWavFromPcm(this.pcmBuffers, this.sampleRate);
    const file = new File([wavBlob], `recording-${Date.now()}.wav`, { type: 'audio/wav' });
    this.cleanupWav();
    return { blob: wavBlob, file, durationMs, mimeType: 'audio/wav' };
  }

  /** Optional controls */
  pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording' && this.mediaRecorder.pause) {
      this.mediaRecorder.pause();
    }
    // For WAV (processor), pausing means temporarily detach the onaudioprocess
    if (this.processorNode) this.processorNode.onaudioprocess = null;
  }

  resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused' && this.mediaRecorder.resume) {
      this.mediaRecorder.resume();
    }
    if (this.processorNode) {
      this.processorNode.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        this.pcmBuffers.push(new Float32Array(input));
      };
    }
  }

  /** Helpers */
  private supportsMediaRecorder(mime: string): boolean {
    return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(mime);
  }

  private pickWebmMime(): string {
    // Prefer OPUS in WEBM when available
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/webm;codecs=pcm', // very rare
    ];
    for (const c of candidates) if (this.supportsMediaRecorder(c)) return c;
    return 'audio/webm';
  }

  private cleanupMediaRecorder() {
    this.mediaRecorder = undefined;
    this.chunks = [];
    // Keep the stream alive if you want to record again without permission prompt.
  }

  private cleanupWav() {
    try {
      this.processorNode?.disconnect();
      this.sourceNode?.disconnect();
      this.audioCtx?.close();
    } catch { }
    this.processorNode = undefined;
    this.sourceNode = undefined;
    this.audioCtx = undefined;
    this.pcmBuffers = [];
  }

  /** PCM Float32 -> WAV Blob (mono) */
  private encodeWavFromPcm(buffers: Float32Array[], sampleRate: number): Blob {
    // Concatenate
    const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
    const interleaved = new Float32Array(totalLength);
    let offset = 0;
    for (const b of buffers) {
      interleaved.set(b, offset);
      offset += b.length;
    }

    // Convert to 16-bit PCM
    const pcm16 = new Int16Array(interleaved.length);
    for (let i = 0; i < interleaved.length; i++) {
      const s = Math.max(-1, Math.min(1, interleaved[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // WAV header (PCM, mono)
    const blockAlign = 1 * 16 / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcm16.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    let p = 0;
    const writeStr = (s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i)); };
    const write16 = (v: number) => { view.setUint16(p, v, true); p += 2; };
    const write32 = (v: number) => { view.setUint32(p, v, true); p += 4; };

    writeStr('RIFF');                  // RIFF
    write32(36 + dataSize);            // file size - 8
    writeStr('WAVE');                  // WAVE
    writeStr('fmt ');                  // fmt chunk
    write32(16);                       // PCM header size
    write16(1);                        // PCM = 1
    write16(1);                        // channels = 1 (mono)
    write32(sampleRate);               // sample rate
    write32(byteRate);                 // byte rate
    write16(blockAlign);               // block align
    write16(16);                       // bits per sample
    writeStr('data');                  // data chunk
    write32(dataSize);                 // data size

    // PCM data
    let idx = 44;
    const u8 = new Uint8Array(buffer);
    for (let i = 0; i < pcm16.length; i++, idx += 2) {
      u8[idx] = pcm16[i] & 0xff;
      u8[idx + 1] = (pcm16[i] >> 8) & 0xff;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }
}
