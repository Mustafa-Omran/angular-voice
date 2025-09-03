# Angular Voice Recorder 🎙️

A **standalone Angular component** for recording audio with live preview and modern glassy UI.

* Angular 20+ compatible
* Standalone: no need to import a module
* Emits `recordingCompleted` when recording finishes
* Input `previewRecord` to control audio preview

---

## Features

* Record audio directly in the browser
* Real-time audio preview (controlled via `previewRecord`)
* Emits a `File` object via `recordingCompleted` event
* Sleek glassy design for buttons and audio preview
* Supports WAV playback

---

## Usage

### Import the Standalone Component

```ts
import { AngularVoice } from 'angular-voice';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AngularVoice],
  templateUrl: './app.component.html',
})
export class AppComponent {
  showPreview = true;

  onRecordingCompleted(file: File) {
    console.log('Recorded file:', file);
    // handle file upload or playback
  }
}
```

### Template

```html
<angular-voice 
  [previewRecord]="showPreview"
  (recordingCompleted)="onRecordingCompleted($event)">
</angular-voice>

<button (click)="showPreview = !showPreview">Toggle Preview</button>
```

---

## Development Server

```bash
ng serve
```

Open [http://localhost:4200](http://localhost:4200) in your browser. Changes auto-reload.

---

## Building

```bash
ng build
```

Build artifacts go to `dist/`. Production builds are optimized for performance.

---

## Testing

### Unit Tests

```bash
ng test
```

### End-to-End Tests

```bash
ng e2e
```
