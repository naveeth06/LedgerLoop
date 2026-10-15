import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'll-auth-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.scss'
})
export class AuthPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly mode = this.route.snapshot.data['mode'] === 'signup' ? 'signup' : 'login';
  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]]
  });
  submitting = false;
  errorMessage = '';

  async submit(): Promise<void> {
    this.errorMessage = '';
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting = true;
    const { displayName, email, password } = this.form.getRawValue();
    try {
      if (this.mode === 'signup') await this.auth.signUp(displayName.trim(), email.trim(), password);
      else await this.auth.signIn(email.trim(), password);
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(returnUrl?.startsWith('/') ? returnUrl : '/');
    } catch (error: unknown) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.submitting = false;
    }
  }

  private describeError(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const payload = (error as { error?: { message?: unknown } }).error;
      if (typeof payload?.message === 'string') return payload.message;
    }
    return 'We could not connect to LedgerLoop. Check that the API is running and try again.';
  }
}