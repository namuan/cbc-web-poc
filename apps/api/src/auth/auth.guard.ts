import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedRequest } from './authenticated-user';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV !== 'development') {
      throw new UnauthorizedException('Production authentication is not configured');
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const identity = request.header('x-dev-user-id');
    if (!identity || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity)) {
      throw new UnauthorizedException('Select a valid development identity');
    }
    const result = await this.database.query<{
      id: string;
      name: string;
      email: string;
      role: 'member' | 'manager';
    }>(
      'SELECT id, name, email, role FROM members WHERE id = $1 AND active = true',
      [identity]
    );
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException('Unknown or inactive development identity');
    request.user = user;
    return true;
  }
}
