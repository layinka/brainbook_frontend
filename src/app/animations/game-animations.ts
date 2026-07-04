import {
  trigger,
  state,
  style,
  transition,
  animate,
  keyframes,
  query,
  stagger
} from '@angular/animations';

export const questionEnterAnimation = trigger('questionEnter', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateX(50px)' }),
    animate('0.4s cubic-bezier(0.34, 1.56, 0.64, 1)', style({ opacity: 1, transform: 'translateX(0)' }))
  ])
]);

export const optionRevealAnimation = trigger('optionReveal', [
  transition(':enter', [
    query('.option-item', [
      style({ opacity: 0, transform: 'translateY(15px)' }),
      stagger('100ms', [
        animate('0.35s ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ], { optional: true })
  ])
]);

export const cardFlipAnimation = trigger('cardFlip', [
  state('default', style({ transform: 'rotateY(0)' })),
  state('flipped', style({ transform: 'rotateY(180deg)' })),
  transition('default <=> flipped', [
    animate('0.6s cubic-bezier(0.23, 1, 0.32, 1)')
  ])
]);

export const floatAnimation = trigger('float', [
  transition(':enter', [
    animate('2s infinite alternate ease-in-out', keyframes([
      style({ transform: 'translateY(0px)', offset: 0 }),
      style({ transform: 'translateY(-10px)', offset: 1 })
    ]))
  ])
]);

export const pulseWarningAnimation = trigger('pulseWarning', [
  state('normal', style({ transform: 'scale(1)', color: 'inherit' })),
  state('warning', style({ transform: 'scale(1.15)', color: 'var(--bb-danger)' })),
  transition('normal <=> warning', [
    animate('0.5s ease-in-out')
  ])
]);
