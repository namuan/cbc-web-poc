import { Request } from 'express';

export type MemberRole = 'member' | 'manager';

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
};

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };
