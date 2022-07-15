import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { NavComponent } from './nav/nav.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  // {
  //   path: '404',
  //   component: P404Component,
  //   data: {
  //     title: 'Page 404',
  //   },
  // },
  // {
  //   path: '500',
  //   component: P500Component,
  //   data: {
  //     title: 'Page 500',
  //   },
  // },
  {
    path: '',
    component: NavComponent,
    data: {
      title: 'Home',
    },
    children: [
      // {
      //   path: 'auth',
      //   loadChildren: () =>
      //     import('./views/auth/auth.module').then((m) => m.AuthModule),
      // },
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./views/dashboard/dashboard.module').then(
            (m) => m.DashboardModule
          ),
      },
      {
        path: 'orders',
        loadChildren: () =>
          import('./views/orders/orders.module').then((m) => m.OrdersModule),
      },
      {
        path: 'products',
        loadChildren: () =>
          import('./views/products/products.module').then(
            (m) => m.ProductsModule
          ),
      },
      // {
      //   path: 'users',
      //   loadChildren: () =>
      //     import('./users/users.module').then((m) => m.UsersModule),
      // },
    ],
  },
  // { path: '**', component: P404Component },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
