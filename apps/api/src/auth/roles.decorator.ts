import { SetMetadata } from '@nestjs/common';

export const COMPANY_ROLES_KEY = 'ledgerloop:company-roles';
export type CompanyRole = 'owner' | 'admin' | 'accountant' | 'staff' | 'viewer';
export const CompanyRoles = (...roles: CompanyRole[]) => SetMetadata(COMPANY_ROLES_KEY, roles);
