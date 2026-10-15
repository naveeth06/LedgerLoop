import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'll-dashboard-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss'
})
export class DashboardPageComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  signingOut = false;

  async signOut(): Promise<void> {
    this.signingOut = true;
    try { await this.auth.signOut(); }
    finally {
      this.signingOut = false;
      await this.router.navigateByUrl('/login');
    }
  }
}