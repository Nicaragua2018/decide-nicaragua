import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { GroupAccessService } from './group-access.service';

// PrismaService es @Global() — no requiere import explícito.
@Module({
  controllers: [GroupsController],
  providers: [GroupsService, GroupAccessService],
  exports: [GroupsService, GroupAccessService],
})
export class GroupsModule {}
