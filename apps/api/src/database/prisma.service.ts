import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Lazy connection keeps the foundation health smoke independent of MongoDB.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly connectionUrl: string | undefined;
  constructor() {
    const connectionUrl = process.env.DATABASE_URL;
    super(connectionUrl ? { datasourceUrl: connectionUrl } : {});
    this.connectionUrl = connectionUrl;
  }
  usesConnection(url: string | undefined): boolean {
    return Boolean(url) && this.connectionUrl === url;
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
