# Angular Voice Recorder 🎙️

A **standalone Angular component** for recording audio with live preview and a modern glassy UI.

* ✅ **Angular 20+** compatible
* ✅ **Standalone**: No module import required
* ✅ **Event-driven**: Emits `recordingCompleted` when recording finishes
* ✅ **Customizable**: Button labels, styles, and preview toggle
* ✅ **Cross-browser**: WAV support everywhere, WebM where supported

---

## ✨ Features

## | **Feature** | **Description** | | --- | --- | | Record Audio | Capture audio directly in the browser | | Live Preview | Toggle real-time audio preview with previewRecord | | Event Emission | Emits a File object via recordingCompleted | | Sleek UI | Glassy design for buttons and preview player | | Cross-Browser | Works with WAV (universal) and WebM (where supported) |

## 📦 Installation

```bash
npm install angular-voice
```

---

## 🚀 Usage

### 1. Import the Component

```typescript
import { Component } from '@angular/core';
import { AngularVoice } from 'angular-voice';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AngularVoice],
  templateUrl: './app.component.html',
})
export class AppComponent {
  showPreview = true;

  onRecordingCompleted(file: File | null) {
    console.log('Recorded file:', file);
    // Handle the file (upload, store, or play)
  }
}
```

---

### 2. Template Example

```html
<angular-voice
  [previewRecord]="showPreview"
  [displayBtnsLabels]="true"
  startRecordingBtnLabel="🎙️ Start Recording"
  recordingBtnLabel="⏺️ Stop Recording"
  startBtnClass="btn btn-success"
  recordingBtnClass="btn btn-danger"
  (recordingCompleted)="onRecordingCompleted($event)">
</angular-voice>

<button (click)="showPreview = !showPreview">
  Toggle Preview
</button>
```

---

## 🔧 Inputs

## | **Input** | **Type** | **Default** | **Description** | | --- | --- | --- | --- | | previewRecord | boolean | false | Show/hide audio preview after recording. | | displayBtnsLabels | boolean | true | Show/hide button text (icons remain). | | startRecordingBtnLabel | string | "Start recording" | Label for the start button. | | recordingBtnLabel | string | "Recording..." | Label for the recording button. | | startBtnClass | string | "" | Extra CSS class(es) for the start button. | | recordingBtnClass | string | "" | Extra CSS class(es) for the recording button. |

## 📤 Outputs

## | **Output** | **Payload** | **Description** | | --- | --- | --- | | recordingCompleted | File | null | Emits the recorded file or null if canceled. |

## 🧑‍💻 Development

### Run Demo App

```bash
ng serve
```

Open <http://localhost:4200> in your browser. The app reloads automatically on code changes.

---

### Build Library

```bash
ng build
```

Build artifacts are stored in `dist/`.

---

### Testing

#### Unit Tests

```bash
ng test
```

#### End-to-End Tests

```bash
ng e2e
```

---

## 🤝 Contributing

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/my-feature`).
3. Commit your changes (`git commit -m 'Add some feature'`).
4. Push to the branch (`git push origin feature/my-feature`).
5. Open a Pull Request 🎉.

---