import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { LayoutModule } from '@angular/cdk/layout';
import { HashLocationStrategy, LocationStrategy } from '@angular/common';

import { AmplifyAuthenticatorModule } from '@aws-amplify/ui-angular';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';

import { map, shareReplay, switchMap } from 'rxjs/operators';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { ConfigAssetLoaderService } from 'config-asset-loader';
import { NavComponent } from './nav/nav.component';
import { Amplify } from 'aws-amplify';
import { AuthComponent } from './views/auth/auth.component';
import { environment } from 'src/environments/environment';

@NgModule({
  declarations: [AppComponent, NavComponent, AuthComponent],
  imports: [
    AmplifyAuthenticatorModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    BrowserModule,
    HttpClientModule,
    LayoutModule,
    MatButtonModule,
    MatCardModule,
    MatGridListModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSidenavModule,
    MatToolbarModule,
  ],
  providers: [
    ConfigAssetLoaderService,
    HttpClientModule,
    {
      provide: LocationStrategy,
      useClass: HashLocationStrategy,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: InitAuthSettings,
      deps: [HttpClient],
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

export function InitAuthSettings(http: HttpClient) {
  console.log('IN INIT AUTH SETTINGS');
  return () => {
    return http.get<Configuration>('./assets/config/config.json').pipe(
      map((config) => {
        const amplifyConfig = config.amplifyConfig;
        Amplify.configure(amplifyConfig);
        environment.apiUrl = config.apiUrl;
      }),
      shareReplay(1)
    );
  };
}

interface Configuration {
  apiUrl: string;
  amplifyConfig: AuthInfo;
  stage: string;
}

export interface AuthInfo {
  aws_project_region: string;
  aws_cognito_region: string;
  aws_user_pools_id: string;
  aws_user_pools_web_client_id: string;
}
