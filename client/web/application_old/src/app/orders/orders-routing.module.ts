/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { CognitoGuard } from '../cognito.guard';
import { OrdersCreateComponent } from './orders-create/orders-create.component';
import { OrdersDetailComponent } from './orders-detail/orders-detail.component';
import { OrdersListComponent } from './orders-list/orders-list.component';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'list',
  },
  {
    path: 'list',
    data: {
      title: 'All Orders',
    },
    component: OrdersListComponent,
    canActivate: [CognitoGuard],
  },
  {
    path: 'create',
    data: {
      title: 'Create Order',
    },
    component: OrdersCreateComponent,
    canActivate: [CognitoGuard],
  },
  {
    path: 'detail/:orderId',
    data: {
      title: 'View Order Detail',
    },
    component: OrdersDetailComponent,
    canActivate: [CognitoGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrdersRoutingModule {}
