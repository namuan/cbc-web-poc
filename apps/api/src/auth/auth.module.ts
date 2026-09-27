import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [DatabaseModule],
  providers: [AuthGuard, RolesGuard],
  exports: [AuthGuard, RolesGuard]
})
export class AuthModule {}
