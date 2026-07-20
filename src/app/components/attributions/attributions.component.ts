import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SoundService } from '../../services/sound.service';

@Component({
  selector: 'app-attributions',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './attributions.component.html',
  styleUrl: './attributions.component.scss'
})
export class AttributionsComponent {
  private sound = inject(SoundService);

  playClick() {
    this.sound.play('click');
  }
}
