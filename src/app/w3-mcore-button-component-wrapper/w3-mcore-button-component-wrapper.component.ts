import { Component, CUSTOM_ELEMENTS_SCHEMA, input } from '@angular/core';

@Component({
    selector: 'app-w3m-core-button-wrapper',
    templateUrl: './w3-mcore-button-component-wrapper.component.html',
    styleUrls: ['./w3-mcore-button-component-wrapper.component.scss'],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class W3MCoreButtonComponentWrapperComponent {
  readonly balance = input<'show' | 'hide'>('show');
  
}
