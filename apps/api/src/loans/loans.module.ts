import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EquipmentModule } from '../equipment/equipment.module';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

@Module({
  imports: [AuthModule, EquipmentModule],
  controllers: [LoansController],
  providers: [LoansService]
})
export class LoansModule {}
