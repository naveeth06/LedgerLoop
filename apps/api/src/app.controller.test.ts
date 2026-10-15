import { describe, expect, it } from 'vitest';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('returns a simple health response without exposing configuration', () => {
    expect(new AppController().getHealth()).toEqual({
      status: 'ok',
      service: 'api',
    });
  });
});
