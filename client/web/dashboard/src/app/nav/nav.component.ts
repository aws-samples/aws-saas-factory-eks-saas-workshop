import { Component } from '@angular/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { ConfigAssetLoaderService } from 'config-asset-loader';

@Component({
  selector: 'app-nav',
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.css'],
})
export class NavComponent {
  tenantName = '';

  isHandset$: Observable<boolean> = this.breakpointObserver
    .observe(Breakpoints.Handset)
    .pipe(
      map((result) => result.matches),
      shareReplay()
    );

  constructor(
    private breakpointObserver: BreakpointObserver,
    private configSvc: ConfigAssetLoaderService
  ) {
    console.log('INVOKING CONFIG SERVICE');
    const foo = configSvc.loadConfigurations(); //.subscribe((val) => console.log(val));
    console.log('FOO', foo);
    foo.subscribe((val) => {
      console.log('VAL:', val);
    });
  }
}
