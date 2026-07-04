import { Component } from '@angular/core';
import { CommonModule, NgFor } from '@angular/common';
import { AppToastService } from 'src/app/services/app-toast.service';
import { NgbToastModule, NgbToast } from '@ng-bootstrap/ng-bootstrap';

@Component({
    selector: 'app-toasts',
    // standalone: true,
    // imports: [CommonModule, NgbToastModule],
    templateUrl: './toasts.component.html',
    styleUrls: ['./toasts.component.scss'],
    imports: [NgFor, NgbToast]
})
export class ToastsComponent {
  constructor(public toastService: AppToastService) {

  }


}
