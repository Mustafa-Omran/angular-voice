import { Injectable } from '@angular/core';

export type RecorderFormat = 'webm' | 'wav';

export interface RecordingResult {
  blob: Blob;     // raw audio data
  file: File;     // audio as a File (can be uploaded/saved)
  durationMs: number; // recording duration in milliseconds
  mimeType: string;   // type of audio (webm/wav)
}

/**
 * AudioRecorderService
 * --------------------
 * This service lets you record audio from the user's microphone.
 * It supports two formats:
 *   - WEBM (default, smaller file size, better quality)
 *   - WAV (fallback, bigger files but works everywhere)
 *
 * How it works:
 *   1. Ask the browser for microphone access.
 *   2. Start recording using MediaRecorder (WEBM) or AudioWorklet (WAV).
 *   3. Stop recording and return the audio as File + Blob.
 */
@Injectable({ providedIn: 'root' })
export class AudioRecorderService {
  // MediaRecorder path (for webm)
  private mediaStream?: MediaStream;
  private mediaRecorder?: MediaRecorder;
  private chunks: Blob[] = [];

  // WAV path (AudioWorklet)
  private audioCtx?: AudioContext;
  private sourceNode?: MediaStreamAudioSourceNode;
  private workletNode?: AudioWorkletNode;
  private pcmBuffers: Float32Array[] = [];
  private sampleRate = 48000;

  private startTs = 0;

  /** Quick check: are we in a browser with mic support? */
  get isBrowser() {
    return typeof window !== 'undefined' && !!navigator?.mediaDevices;
  }

  /** Ask the user for microphone permission (runs once) */
  async prepare(): Promise<void> {
    if (!this.isBrowser) return;
    if (this.mediaStream) return; // already prepared

    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }

  /**
   * Start recording
   * @param format 'webm' (default) or 'wav'
   * @param desiredSampleRate optional sample rate (e.g., 44100)
   */
  async start(format: RecorderFormat = 'webm', desiredSampleRate?: number): Promise<void> {
    if (!this.isBrowser) throw new Error('Recording only works in browser.');
    await this.prepare();

    this.chunks = [];
    this.pcmBuffers = [];
    this.startTs = performance.now();

    // --- Case 1: WEBM (MediaRecorder, smaller, modern) ---
    if (format === 'webm' && this.supportsMediaRecorder('audio/webm')) {
      const mimeType = this.pickWebmMime();
      this.mediaRecorder = new MediaRecorder(this.mediaStream!, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data?.size) this.chunks.push(e.data);
      };
      this.mediaRecorder.start();
      return;
    }

    // --- Case 2: WAV (AudioWorklet, fallback) ---
    this.audioCtx = new AudioContext({ sampleRate: desiredSampleRate ?? undefined });
    this.sampleRate = this.audioCtx.sampleRate;

    // Build a tiny recorder processor dynamically
    const workletCode = `
      class RecorderProcessor extends AudioWorkletProcessor {
        process(inputs) {
          const input = inputs[0];
          if (input && input[0]) {
            this.port.postMessage(input[0]); // send raw PCM data
          }
          return true;
        }
      }
      registerProcessor('recorder-processor', RecorderProcessor);
    `;
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await this.audioCtx.audioWorklet.addModule(url);

    this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream!);
    this.workletNode = new AudioWorkletNode(this.audioCtx, 'recorder-processor');
    this.workletNode.port.onmessage = (event) => {
      // Copy the audio data so it’s safe
      this.pcmBuffers.push(new Float32Array(event.data));
    };

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.audioCtx.destination);
  }

  /**
   * Stop recording and return the result
   */
  async stop(format: RecorderFormat = 'webm'): Promise<RecordingResult> {
    const durationMs = performance.now() - this.startTs;

    // --- WEBM path ---
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

    // --- WAV path ---
    const wavBlob = this.encodeWavFromPcm(this.pcmBuffers, this.sampleRate);
    const file = new File([wavBlob], `recording-${Date.now()}.wav`, { type: 'audio/wav' });
    this.cleanupWav();
    return { blob: wavBlob, file, durationMs, mimeType: 'audio/wav' };
  }

  /** Pause recording (if supported) */
  pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause?.();
    }
    if (this.workletNode) {
      this.workletNode.port.onmessage = null; // stop collecting
    }
  }

  /** Resume recording (if supported) */
  resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume?.();
    }
    if (this.workletNode) {
      this.workletNode.port.onmessage = (event) => {
        this.pcmBuffers.push(new Float32Array(event.data));
      };
    }
  }

  /** --- Helpers below --- */

  /** Check if MediaRecorder supports a mime type */
  private supportsMediaRecorder(mime: string): boolean {
    return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(mime);
  }

  /** Pick the best WEBM mime type available */
  private pickWebmMime(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/webm;codecs=pcm',
    ];
    for (const c of candidates) if (this.supportsMediaRecorder(c)) return c;
    return 'audio/webm';
  }

  /** Cleanup for webm recorder */
  private cleanupMediaRecorder() {
    this.mediaRecorder = undefined;
    this.chunks = [];
  }

  /** Cleanup for wav recorder */
  private cleanupWav() {
    try {
      this.workletNode?.disconnect();
      this.sourceNode?.disconnect();
      this.audioCtx?.close();
    } catch { }
    this.workletNode = undefined;
    this.sourceNode = undefined;
    this.audioCtx = undefined;
    this.pcmBuffers = [];
  }

  /**
   * Convert PCM float audio to a WAV Blob (mono, 16-bit PCM)
   */
  private encodeWavFromPcm(buffers: Float32Array[], sampleRate: number): Blob {
    // Join all audio chunks into one array
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

    // Build WAV file header
    const blockAlign = 1 * 16 / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcm16.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    let p = 0;
    const writeStr = (s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i)); };
    const write16 = (v: number) => { view.setUint16(p, v, true); p += 2; };
    const write32 = (v: number) => { view.setUint32(p, v, true); p += 4; };

    writeStr('RIFF');
    write32(36 + dataSize);
    writeStr('WAVE');
    writeStr('fmt ');
    write32(16);
    write16(1);
    write16(1);
    write32(sampleRate);
    write32(byteRate);
    write16(blockAlign);
    write16(16);
    writeStr('data');
    write32(dataSize);

    // PCM samples
    let idx = 44;
    const u8 = new Uint8Array(buffer);
    for (let i = 0; i < pcm16.length; i++, idx += 2) {
      u8[idx] = pcm16[i] & 0xff;
      u8[idx + 1] = (pcm16[i] >> 8) & 0xff;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }
}
