import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CollaborationService, type NotificationFilter } from './collaboration.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto.js';

// Sin @Roles a propósito: todo usuario de la empresa tiene su campana, y
// cada consulta ya se limita a lo suyo (ver CollaborationService).
@Controller()
export class CollaborationController {
  constructor(private readonly collaboration: CollaborationService) {}

  @Get('notifications')
  list(@Query('filter') filter?: string) {
    const f: NotificationFilter = filter === 'unread' || filter === 'mentions' ? filter : 'all';
    return this.collaboration.listNotifications(f);
  }

  @Get('notifications/unread-count')
  unreadCount() {
    return this.collaboration.unreadCount();
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  markAllRead() {
    return this.collaboration.markAllRead();
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.collaboration.markRead(id);
  }

  @Get('notifications/preferences')
  getPreferences() {
    return this.collaboration.getPreferences();
  }

  @Put('notifications/preferences')
  setPreferences(@Body() dto: UpdateNotificationPreferencesDto) {
    return this.collaboration.setPreferences(dto.muted);
  }

  @Get('collaboration/people')
  people() {
    return this.collaboration.people();
  }

  @Get('comments')
  listComments(@Query('entityType') entityType: string, @Query('entityId', ParseUUIDPipe) entityId: string) {
    return this.collaboration.listComments(entityType, entityId);
  }

  @Post('comments')
  addComment(@Body() dto: CreateCommentDto) {
    return this.collaboration.addComment(dto);
  }
}
