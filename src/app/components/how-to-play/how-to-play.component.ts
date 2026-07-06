import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-how-to-play',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './how-to-play.component.html',
  styleUrl: './how-to-play.component.scss'
})
export class HowToPlayComponent {}
