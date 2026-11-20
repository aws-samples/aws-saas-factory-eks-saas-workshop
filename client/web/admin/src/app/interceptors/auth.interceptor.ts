/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
} from '@angular/common/http';
import { from, Observable } from 'rxjs';
import { Auth } from 'aws-amplify';
import { filter, map, switchMap } from 'rxjs/operators';

/**
 * Attaches the signed-in operations user's Cognito ID token to outgoing API requests.
 *
 * This admin application previously sent no Authorization header at all, which is why
 * GET /api/tenants had to be left unauthenticated for its Tenants page to work -- an
 * endpoint listing every tenant's id, name and email, served on the public gateway. The
 * server side is now guarded (tenants.controller.ts), so the client must present a token.
 *
 * Mirrors the tenant-facing application's interceptor
 * (client/web/application/src/app/interceptors/auth.interceptor.ts) rather than inventing
 * a second pattern.
 *
 * auth-info and config.json are excluded because they are fetched before a session exists:
 * auth-info is what supplies the Amplify configuration in the first place.
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor() {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    if (req.url.includes('auth-info') || req.url.includes('config.json')) {
      return next.handle(req);
    }
    const s = Auth.currentSession().catch((err) => console.log(err));
    const session$ = from(s);

    return session$.pipe(
      filter((sesh) => !!sesh),
      map((sesh) => (!!sesh ? sesh.getIdToken().getJwtToken() : '')),
      switchMap((tok) => {
        req = req.clone({
          headers: req.headers.set('Authorization', 'Bearer ' + tok),
        });
        return next.handle(req);
      })
    );
  }
}
