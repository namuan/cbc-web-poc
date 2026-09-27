import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { parseBody } from '../validation';
import { returnSchema } from '../equipment/equipment.schemas';
import { EquipmentService } from '../equipment/equipment.service';
import { LoansService } from './loans.service';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class LoansController {
  constructor(
    @Inject(LoansService) private readonly loans: LoansService,
    @Inject(EquipmentService) private readonly equipment: EquipmentService
  ) {}

  @Get('loans/mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.loans.listMyLoans(user);
  }

  @Get('loans')
  @Roles('manager')
  list() {
    return this.loans.listLoans();
  }

  @Post('loans/:id/return')
  @Roles('manager')
  return(
    @Param('id', ParseUUIDPipe) loanId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.equipment.returnLoan(loanId, parseBody(returnSchema, body), user);
  }

  @Get('audit')
  @Roles('manager')
  audit() {
    return this.loans.listAudit();
  }
}
