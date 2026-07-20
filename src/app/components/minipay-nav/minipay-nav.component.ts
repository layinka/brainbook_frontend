import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Web3Service } from '../../services/web3';

@Component({
  selector: 'app-minipay-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './minipay-nav.component.html',
  styleUrl: './minipay-nav.component.scss',
})
export class MinipayNavComponent {
  public w3s = inject(Web3Service);
}
