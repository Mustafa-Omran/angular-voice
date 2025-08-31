import { Component, computed, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { AudioRecorderService, RecordingResult } from './recorder-service';

@Component({
  selector: 'angular-voice',
  imports: [],
  templateUrl: './angular-voice.html',
  styleUrls: ['./angular-voice.css']
})
export class AngularVoice {
  private recorder = inject(AudioRecorderService);
  @Input() previewRecord: boolean = true;
  activeRecordingFile: File | null = null;
  private previousUrl: string | null = null;
  recording = signal(false);
  result = signal<RecordingResult | null>(null);
  audioUrl = computed(() => {
    const blob = this.result()?.blob;

    if (!blob) {
      // cleanup previous URL if exists
      if (this.previousUrl) {
        URL.revokeObjectURL(this.previousUrl);
        this.previousUrl = null;
      }
      return null;
    }

    // revoke old one before creating a new URL
    if (this.previousUrl) {
      URL.revokeObjectURL(this.previousUrl);
    }

    this.previousUrl = URL.createObjectURL(blob);
    return this.previousUrl;
  });

  @Output() recordingCompleted: EventEmitter<File | null> = new EventEmitter<File | null>();

  async toggleRecord() {
    if (!this.recording() && !this.result()) {
      this.result.set(null);
      await this.recorder.start('webm');
      this.recording.set(true);
      this.recordingCompleted.emit(null);
    } else if (this.recording()) {
      const res = await this.recorder.stop('webm');
      this.result.set(res);
      this.recording.set(false);
    } else if (this.result()) {
      await this.send();
    }
  }

  async send() {
    const result = this.result();
    if (!result) return;

    this.recording.set(false);
    this.result.set(null);
    this.activeRecordingFile = result.file;
    this.recordingCompleted.emit(result.file);
  }

  discard() {
    // Stop recording if still active
    if (this.recording()) {
      this.toggleRecord();
    }

    // Revoke blob URL to avoid memory leaks
    const url = this.audioUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }

    // Reset state
    this.result.set(null);
    this.previewRecord = false;
    this.activeRecordingFile = null;
  }

}
