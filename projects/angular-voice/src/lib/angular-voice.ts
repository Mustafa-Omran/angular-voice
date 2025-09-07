import { Component, computed, EventEmitter, inject, input, model, Output, signal } from '@angular/core';
import { AudioRecorderService, RecordingResult } from './recorder-service';

/**
 * AngularVoice Component
 * ----------------------
 * A reusable audio recorder UI + logic component.
 * Handles recording, stopping, previewing, and sending audio files.
 */
@Component({
  selector: 'angular-voice',
  imports: [],
  templateUrl: './angular-voice.html',
  styleUrls: ['./angular-voice.css']
})
export class AngularVoice {
  // Service that actually records audio
  private recorder = inject(AudioRecorderService);

  // Keeps track of the last blob URL we created (so we can clean it up)
  private previousUrl: string | null = null;

  // The recorded file once we have one
  protected activeRecordingFile: File | null = null;

  // Whether preview mode is shown
  previewRecord = model<boolean>(false);

  // Whether recording is active
  recording = model<boolean>(false);

  // Inputs to customize the component
  displayBtnsLabels = input<boolean>(true);            // show/hide button labels
  startRecordingBtnLabel = input<string>('Start recording');
  recordingBtnLabel = input<string>('Recording...');
  startBtnClass = input<string>('');                   // extra CSS classes for "start" button
  recordingBtnClass = input<string>('');               // extra CSS classes for "recording" button

  // Holds the current recording result (blob + file)
  result = signal<RecordingResult | null>(null);

  // Computed signal: returns an object URL for the current recording blob
  audioUrl = computed(() => {
    const blob = this.result()?.blob;

    // If there’s no blob, revoke old URL and return null
    if (!blob) {
      if (this.previousUrl) {
        URL.revokeObjectURL(this.previousUrl);
        this.previousUrl = null;
      }
      return null;
    }

    // Revoke old URL and create a new one for the new blob
    if (this.previousUrl) {
      URL.revokeObjectURL(this.previousUrl);
    }

    this.previousUrl = URL.createObjectURL(blob);
    return this.previousUrl;
  });

  // Event emitter: lets parent components know when recording is done
  @Output() recordingCompleted: EventEmitter<File | null> = new EventEmitter<File | null>();

  /**
   * Starts or stops recording depending on the current state.
   */
  async toggleRecord() {
    // Case 1: Not recording yet → start recording
    if (!this.recording() && !this.result()) {
      this.result.set(null);
      await this.recorder.start('webm');
      this.recording.set(true);
      this.recordingCompleted.emit(null); // notify parent that recording started
    }
    // Case 2: Already recording → stop and save
    else if (this.recording()) {
      const result = await this.recorder.stop('webm');
      this.recording.set(false);

      if (result) {
        this.result.set(result);
        await this.send();
      }
    }
  }

  /**
   * Sends the recorded file to parent component via event emitter.
   */
  async send() {
    const result = this.result();
    if (!result) return;

    this.recording.set(false);
    this.activeRecordingFile = result.file;

    // Notify parent that recording finished with a file
    this.recordingCompleted.emit(result.file);
  }

  /**
   * Cancels recording and resets the component state.
   */
  discard() {
    // If recording is still running, stop it
    if (this.recording()) {
      this.toggleRecord();
    }

    // Clean up blob URL to prevent memory leaks
    const url = this.audioUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }

    // Reset everything
    this.result.set(null);
    this.previewRecord.set(false);
    this.activeRecordingFile = null;
  }
}
