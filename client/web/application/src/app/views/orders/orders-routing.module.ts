/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
// import { CognitoGuard } from '../cognito.guard';
import { CreateComponent } from './create/create.component';
import { DetailComponent } from './detail/detail.component';
import { ListComponent } from './list/list.component';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'list',
    pathMatch: 'full',
  },
  {
    path: 'list',
    data: {
      title: 'All Orders',
    },
    component: ListComponent,
    // canActivate: [CognitoGuard],
  },
  {
    path: 'create',
    data: {
      title: 'Create Order',
    },
    component: CreateComponent,
    // canActivate: [CognitoGuard],
  },
  {
    path: 'detail/:orderId',
    data: {
      title: 'View Order Detail',
    },
    component: DetailComponent,
    // canActivate: [CognitoGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrdersRoutingModule {}
