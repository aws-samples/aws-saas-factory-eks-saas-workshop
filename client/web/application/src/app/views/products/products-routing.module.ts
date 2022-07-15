/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
// import { CognitoGuard } from '../cognito.guard';
import { CreateComponent } from './create/create.component';
import { EditComponent } from './edit/edit.component';
import { ListComponent } from './list/list.component';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'create',
    pathMatch: 'prefix',
  },
  {
    path: 'list',
    data: {
      title: 'Product List',
    },
    component: ListComponent,
    // canActivate: [CognitoGuard],
  },
  {
    path: 'create',
    data: {
      title: 'Create new Product',
    },
    component: CreateComponent,
    // canActivate: [CognitoGuard],
  },
  {
    path: 'edit/:productId',
    data: {
      title: 'Edit Product',
    },
    component: EditComponent,
    // canActivate: [CognitoGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ProductsRoutingModule {}
