import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const accessToken = auth.getAccessToken();

  if (!accessToken || request.url.includes('/auth/signin') || request.url.includes('/auth/signup') || request.url.includes('/auth/refresh')) {
    return next(request);
  }

  return next(request.clone({
    setHeaders: {
      Authorization: `Bearer ${accessToken}`,
    },
  }));
};
