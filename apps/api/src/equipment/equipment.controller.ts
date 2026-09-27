import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { parseBody } from '../validation';
import { checkoutSchema, createEquipmentSchema, returnSchema, stateChangeSchema } from './equipment.schemas';
import { EquipmentService } from './equipment.service';

@Controller('equipment')
@UseGuards(AuthGuard, RolesGuard)
export class EquipmentController {
  constructor(@Inject(EquipmentService) private readonly equipment: EquipmentService) {}

  @Get()
  list() {
    return this.equipment.listEquipment();
  }

  @Get('members')
  @Roles('manager')
  listMembers() {
    return this.equipment.listMembers();
  }

  @Post()
  @Roles('manager')
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.equipment.createEquipment(parseBody(createEquipmentSchema, body), user);
  }

  @Post(':id/checkout')
  @Roles('manager')
  checkout(
    @Param('id', ParseUUIDPipe) equipmentId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.equipment.checkout(equipmentId, parseBody(checkoutSchema, body), user);
  }

  @Post(':id/maintenance')
  @Roles('manager')
  maintenance(
    @Param('id', ParseUUIDPipe) equipmentId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const { note } = parseBody(stateChangeSchema, body);
    return this.equipment.changeStatus(equipmentId, 'maintenance', note, user);
  }

  @Post(':id/restore')
  @Roles('manager')
  restore(
    @Param('id', ParseUUIDPipe) equipmentId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const { note } = parseBody(stateChangeSchema, body);
    return this.equipment.changeStatus(equipmentId, 'restore', note, user);
  }

  @Post(':id/retire')
  @Roles('manager')
  retire(
    @Param('id', ParseUUIDPipe) equipmentId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const { note } = parseBody(stateChangeSchema, body);
    return this.equipment.changeStatus(equipmentId, 'retire', note, user);
  }
}
