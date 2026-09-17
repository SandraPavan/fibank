import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { hashJoinCode } from './workspace-context';

export interface Workspace {
  workspaceId: string;
  groupSlug: string;
  createdAt: Date;
}

function omitPhysicalId<T extends { id: string; codeHash: string }>(
  record: T,
): Omit<T, 'id' | 'codeHash'> {
  const { id, codeHash, ...rest } = record;
  void id;
  void codeHash;
  return rest;
}

@Injectable()
export class WorkspaceRepository {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async create(groupSlug: string, code: string): Promise<Workspace> {
    const record = await this.db.workspace.create({
      data: {
        workspaceId: `WS-${randomUUID()}`,
        groupSlug,
        codeHash: hashJoinCode(groupSlug, code),
        createdAt: new Date(),
      },
    });
    return omitPhysicalId(record);
  }

  async list(): Promise<Workspace[]> {
    const rows = await this.db.workspace.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(omitPhysicalId);
  }

  async findBySlug(groupSlug: string): Promise<Workspace | null> {
    const row = await this.db.workspace.findUnique({ where: { groupSlug } });
    return row && omitPhysicalId(row);
  }

  /** Retorna o workspace somente se o código de entrada confere. */
  async authenticate(
    groupSlug: string,
    code: string,
  ): Promise<Workspace | null> {
    const row = await this.db.workspace.findUnique({ where: { groupSlug } });
    if (!row || row.codeHash !== hashJoinCode(groupSlug, code)) return null;
    return omitPhysicalId(row);
  }
}
