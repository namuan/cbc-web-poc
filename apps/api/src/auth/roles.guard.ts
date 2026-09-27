import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest, MemberRole } from './authenticated-user';

const rolesKey = 'required-roles';

export const Roles = (...roles: MemberRole[]) => SetMetadata(rolesKey, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<MemberRole[]>(rolesKey, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!roles.includes(request.user.role)) throw new ForbiddenException('Manager role required');
    return true;
  }
}
