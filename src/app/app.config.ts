import { ApplicationConfig, provideZoneChangeDetection, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideNgIconsConfig } from '@ng-icons/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FormsModule } from '@angular/forms';

import { provideBetterAuth } from 'ngx-better-auth'
import { environment } from '../environments/environment';
import { adminClient, twoFactorClient, usernameClient } from 'better-auth/client/plugins';
import { siweClient } from 'better-auth/client/plugins';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({
      eventCoalescing: true,
      runCoalescing: true
    }),
    provideRouter(routes),
    provideHttpClient(),
    provideAnimations(),
    provideNgIconsConfig({
      size: '1.5em',
    }),
    importProvidersFrom(FormsModule),
    NgbModal,
    provideBetterAuth({
      baseURL: environment.apiUrl.replace('/api/v1', ''), // backend URL
      basePath: '/api/auth',   // Fastify backend base auth path

      // Example with plugins
      plugins: [
        usernameClient(),
        twoFactorClient({
          onTwoFactorRedirect() {
            window.location.href = '/two-factor-auth'
          },
        }),
        siweClient()
        // adminClient({
        //   ac: accessControl,
        //   roles: {
        //     admin,
        //     moderator,
        //     user,
        //   },
        // }),
      ],
    })
  ]
};
