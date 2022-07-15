/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from 'aws-amplify';
import { from, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { navItems } from '../../_nav';

@Component({
  selector: 'app-dashboard',
  templateUrl: './default-layout.component.html',
})
export class DefaultLayoutComponent implements OnInit {
  public sidebarMinimized = false;
  public navItems = navItems;
  isAuthenticated$: Observable<Boolean>;
  username$: Observable<string>;
  companyName$: Observable<string>;

  constructor(private router: Router) {}

  ngOnInit(): void {
    try {
      const s = Auth.currentSession().catch((err) => err);
      const session$ = from(s);
      this.isAuthenticated$ = session$.pipe(
        filter((sesh) => !!sesh),
        map((sesh) => sesh && sesh.isValid())
      );
      const token$ = session$.pipe(map((sesh) => sesh && sesh.getIdToken()));
      this.username$ = token$.pipe(map((t) => t && t.payload['cognito:username']));
      this.companyName$ = token$.pipe(map((t) => t.payload['custom:company-name']));
    } catch (err) {
      console.error('Unable to get current session.');
    }
  }

  toggleMinimize(e): void {
    this.sidebarMinimized = e;
  }

  async logout() {
    await Auth.signOut({ global: true });
  }
}
