import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { EquipmentModule } from './equipment/equipment.module';
import { HealthController } from './health.controller';
import { LoansModule } from './loans/loans.module';

@Module({
  imports: [DatabaseModule, AuthModule, EquipmentModule, LoansModule],
  controllers: [HealthController]
})
export class AppModule {}
