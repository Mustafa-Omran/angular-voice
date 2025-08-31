import { Component, signal } from '@angular/core';
import { AngularVoice } from 'angular-voice';

@Component({
  selector: 'app-root',
  imports: [AngularVoice],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('angular-voice-run');
}
