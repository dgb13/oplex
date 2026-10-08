import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  getOwnTaxCondition,
  getTenantDb,
  getTenantId,
  notify,
  onCommit,
  Prisma,
  PrismaService,
  userIdsWithRoles,
  withTenantContext,
} from '@plexo/database';
import type { StorefrontOrder, StorefrontOrderStatus, StorefrontSettings } from '@plexo/database';
import { SubscriptionService } from '@plexo/subscriptions';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Resend } from 'resend';
import { buildStorefrontCatalog, type StorefrontCatalog, type StorefrontCoverage } from './storefront-catalog.js';
import {
  normalizeSubdomain,
  subdomainProblem,
  SUBDOMAIN_PROBLEM_MESSAGE,
} from './storefront-subdomain.js';
import type { CreateStorefrontOrderDto, UpdateStorefrontSettingsDto } from './storefront.dto.js';

export const STOREFRONT_TEMPLATES = ['aire', 'atelier', 'pop', 'taller', 'mercado', 'neon', 'revista', 'vitrina'] as const;

// Dominio bajo el que viven las tiendas (casanativa.oplex.com.ar).
export function storefrontRootDomain(): string {
  return process.env['STOREFRONT_ROOT_DOMAIN'] ?? 'oplex.com.ar';
}

export interface StorefrontStoreInfo {
  name: string;
  subdomain: string;
  url: string;
  template: string;
  accentColor: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  coverUrl: string | null;
  logoUrl: string | null;
  whatsappNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  published: boolean;
}

export interface StorefrontPayload extends StorefrontCatalog {
  store: StorefrontStoreInfo;
}

export interface StorefrontAdminView {
  planEnabled: boolean;
  planName: string | null;
  taxCondition: string | null;
  suggestedSubdomain: string;
  rootDomain: string;
  settings: StorefrontSettings | null;
  coverage: StorefrontCoverage;
  newOrders: number;
}

export interface SubdomainCheck {
  subdomain: string;
  available: boolean;
  message: string | null;
}

// La web la achica a 2000px en JPG antes de subirla (ver storefront/page.tsx).
const COVER_MIME_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const COVER_MAX_BYTES = 6 * 1024 * 1024;
const COVER_URL_PREFIX = '/uploads/storefront-covers/';

const ORDER_LIMIT_PER_WINDOW = 8;
const ORDER_WINDOW_MS = 10 * 60 * 1000;

@Injectable()
export class StorefrontService {
  private readonly logger = new Logger(StorefrontService.name);
  // Freno simple contra el envío masivo de pedidos falsos desde una misma
  // IP (en memoria: alcanza con una sola instancia de la API).
  private readonly recentOrders = new Map<string, number[]>();
  private readonly coversDir = join(process.cwd(), 'uploads', 'storefront-covers');

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
  ) {
    mkdirSync(this.coversDir, { recursive: true });
  }

  // ------------------------------------------------------------ dentro de Oplex

  async getAdminView(): Promise<StorefrontAdminView> {
    const db = getTenantDb();
    const [settings, taxCondition, tenant, tenantSettings, subscription, newOrders] = await Promise.all([
      db.storefrontSettings.findFirst(),
      getOwnTaxCondition(db),
      db.tenant.findUnique({ where: { id: getTenantId() }, select: { name: true } }),
      db.tenantSettings.findFirst({ select: { tradeName: true } }),
      this.subscriptionService.getCurrentForTenant().catch(() => null),
      db.storefrontOrder.count({ where: { status: 'NEW' } }),
    ]);
    const { coverage } = await buildStorefrontCatalog(db, settings ?? { warehouseId: null, stockDisplay: 'LOW' });
    return {
      planEnabled: await this.subscriptionService.isStorefrontAvailable(),
      planName: subscription?.plan.name ?? null,
      taxCondition,
      suggestedSubdomain: normalizeSubdomain(tenantSettings?.tradeName || tenant?.name || ''),
      rootDomain: storefrontRootDomain(),
      settings,
      coverage,
      newOrders,
    };
  }

  async checkSubdomain(raw: string): Promise<SubdomainCheck> {
    const subdomain = normalizeSubdomain(raw);
    const problem = subdomainProblem(subdomain);
    if (problem) {
      return { subdomain, available: false, message: SUBDOMAIN_PROBLEM_MESSAGE[problem] };
    }
    const taken = await this.isTakenByAnotherTenant(subdomain);
    return { subdomain, available: !taken, message: taken ? SUBDOMAIN_PROBLEM_MESSAGE.TAKEN : null };
  }

  async saveSettings(dto: UpdateStorefrontSettingsDto): Promise<StorefrontSettings> {
    await this.subscriptionService.assertCanUseStorefront();
    const db = getTenantDb();
    const subdomain = normalizeSubdomain(dto.subdomain);
    const problem = subdomainProblem(subdomain);
    if (problem) {
      throw new BadRequestException(SUBDOMAIN_PROBLEM_MESSAGE[problem]);
    }
    if (await this.isTakenByAnotherTenant(subdomain)) {
      throw new ConflictException(SUBDOMAIN_PROBLEM_MESSAGE.TAKEN);
    }
    if (dto.published && !(await getOwnTaxCondition(db))) {
      throw new BadRequestException(
        'Antes de publicar la tienda, cargá tu condición frente al IVA (Contabilidad → ARCA → Datos de la empresa): sin ella no se sabe qué precio final mostrar',
      );
    }
    if (dto.warehouseId) {
      const warehouse = await db.warehouse.findUnique({ where: { id: dto.warehouseId } });
      if (!warehouse) throw new BadRequestException('Depósito no encontrado');
    }
    const data = {
      subdomain,
      published: dto.published,
      template: dto.template,
      accentColor: dto.accentColor ?? null,
      warehouseId: dto.warehouseId ?? null,
      stockDisplay: dto.stockDisplay,
      whatsappNumber: dto.whatsappNumber?.trim() || null,
      notifyEmail: dto.notifyEmail?.trim() || null,
      heroTitle: dto.heroTitle?.trim() || null,
      heroSubtitle: dto.heroSubtitle?.trim() || null,
    };
    try {
      return await db.storefrontSettings.upsert({
        where: { tenantId: getTenantId() },
        create: { tenantId: getTenantId(), ...data },
        update: data,
      });
    } catch (err) {
      // Dos empresas pidiendo la misma dirección al mismo tiempo: el
      // chequeo de arriba no lo ve, el índice único de la base sí.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(SUBDOMAIN_PROBLEM_MESSAGE.TAKEN);
      }
      throw err;
    }
  }

  /** Foto de portada: mismo patrón que el logo (archivo con nombre uuid en
   * uploads/, servido sin login por /uploads/). */
  async setCover(mimeType: string, buffer: Buffer): Promise<StorefrontSettings> {
    await this.subscriptionService.assertCanUseStorefront();
    const extension = COVER_MIME_TYPES[mimeType];
    if (!extension) throw new BadRequestException('La portada tiene que ser una imagen JPG, PNG o WEBP');
    if (buffer.length > COVER_MAX_BYTES) throw new BadRequestException('La portada tiene que pesar menos de 6MB');
    const db = getTenantDb();
    const settings = await db.storefrontSettings.findFirst();
    if (!settings) throw new BadRequestException('Guardá la tienda una vez antes de subir la portada');

    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(this.coversDir, filename), buffer);
    const updated = await db.storefrontSettings.update({
      where: { id: settings.id },
      data: { coverImageUrl: `${COVER_URL_PREFIX}${filename}` },
    });
    if (settings.coverImageUrl) await this.deleteCoverFile(settings.coverImageUrl);
    return updated;
  }

  async removeCover(): Promise<StorefrontSettings | null> {
    const db = getTenantDb();
    const settings = await db.storefrontSettings.findFirst();
    if (!settings?.coverImageUrl) return settings;
    const updated = await db.storefrontSettings.update({ where: { id: settings.id }, data: { coverImageUrl: null } });
    await this.deleteCoverFile(settings.coverImageUrl);
    return updated;
  }

  /** Lo mismo que ve un visitante, aunque la tienda no esté publicada (vista previa). */
  async getPreview(): Promise<StorefrontPayload> {
    const db = getTenantDb();
    const settings = await db.storefrontSettings.findFirst();
    return this.buildPayload(
      settings ?? ({
        subdomain: (await this.getAdminView()).suggestedSubdomain || 'tutienda',
        published: false,
        template: 'aire',
        accentColor: null,
        warehouseId: null,
        stockDisplay: 'LOW',
        whatsappNumber: null,
      } as StorefrontSettings),
    );
  }

  listOrders(): Promise<(StorefrontOrder & { lines: { description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; articleVariantId: string }[] })[]> {
    return getTenantDb().storefrontOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { lines: { select: { description: true, quantity: true, unitPrice: true, articleVariantId: true } } },
    });
  }

  async updateOrderStatus(id: string, status: StorefrontOrderStatus): Promise<StorefrontOrder> {
    const db = getTenantDb();
    const order = await db.storefrontOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return db.storefrontOrder.update({ where: { id }, data: { status } });
  }

  // ------------------------------------------------------------ tienda pública (sin sesión)

  async getPublicStore(rawSubdomain: string): Promise<StorefrontPayload> {
    const tenantId = await this.resolveTenant(rawSubdomain);
    return withTenantContext(this.prisma, tenantId, async () => {
      const settings = await this.requireOpenStore();
      return this.buildPayload(settings);
    });
  }

  async createPublicOrder(
    rawSubdomain: string,
    dto: CreateStorefrontOrderDto,
    ip: string,
  ): Promise<{ number: number; message: string; whatsappUrl: string | null }> {
    const subdomain = normalizeSubdomain(rawSubdomain);
    this.throttle(`${subdomain}|${ip}`);
    const tenantId = await this.resolveTenant(subdomain);
    return withTenantContext(this.prisma, tenantId, async () => {
      const settings = await this.requireOpenStore();
      const db = getTenantDb();
      const { variantsById } = await buildStorefrontCatalog(db, settings);

      const merged = new Map<string, number>();
      for (const line of dto.lines) merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);

      const lines = [...merged.entries()].map(([variantId, quantity]) => {
        const variant = variantsById.get(variantId);
        if (!variant) {
          throw new BadRequestException('Uno de los artículos del pedido ya no está disponible. Actualizá la página y probá de nuevo');
        }
        if (quantity > variant.stock) {
          throw new BadRequestException(
            `De "${variant.articleName}" quedan ${variant.stock}. Ajustá la cantidad y probá de nuevo`,
          );
        }
        const description = variant.showLabel ? `${variant.articleName} (${variant.label})` : variant.articleName;
        return { variantId, quantity, description, unitPrice: variant.price };
      });
      const total = lines.reduce((sum, l) => sum.add(l.unitPrice.mul(l.quantity)), new Prisma.Decimal(0));

      // Numeración correlativa por empresa sin carreras entre dos pedidos simultáneos.
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`storefront_order:${tenantId}`}))`;
      const last = await db.storefrontOrder.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
      const number = (last?.number ?? 1000) + 1;

      const order = await db.storefrontOrder.create({
        data: {
          tenantId,
          number,
          customerName: dto.customerName.trim(),
          customerPhone: dto.customerPhone?.trim() || null,
          note: dto.note?.trim() || null,
          total,
          lines: {
            create: lines.map((l) => ({
              tenantId,
              articleVariantId: l.variantId,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
            })),
          },
        },
      });

      const store = await this.storeInfo(settings);
      const money = (n: Prisma.Decimal) => `$ ${n.toNumber().toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
      const message = [
        `Hola ${store.name}! Quiero hacer este pedido:`,
        ...lines.map((l) => `• ${l.quantity} × ${l.description} — ${money(l.unitPrice.mul(l.quantity))}`),
        `Total: ${money(total)}`,
        '',
        `Nombre: ${order.customerName}`,
        ...(order.customerPhone ? [`Teléfono: ${order.customerPhone}`] : []),
        ...(order.note ? [`Nota: ${order.note}`] : []),
        '',
        `Pedido #${number} hecho en ${store.url.replace(/^https?:\/\//, '')}`,
      ].join('\n');

      await notify({
        recipientUserIds: await userIdsWithRoles(['OWNER', 'ADMIN', 'SALES']),
        category: 'SALES',
        type: 'storefront.new_order',
        preference: 'storefront.new_order',
        message: `Nuevo pedido **#${number}** de la tienda online: **${order.customerName}**, ${money(total)}`,
        link: '/storefront/orders',
      });
      if (settings.notifyEmail) {
        const to = settings.notifyEmail;
        onCommit(() => void this.sendOrderEmail(to, store.name, number, message));
      }

      const digits = (settings.whatsappNumber ?? '').replace(/\D/g, '');
      return {
        number,
        message,
        whatsappUrl: digits.length >= 8 ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null,
      };
    });
  }

  /** Para el "ask" de Caddy antes de sacar el certificado HTTPS de un
   * subdominio: sólo direcciones que existen de verdad. */
  async isKnownStoreDomain(domain: string): Promise<boolean> {
    const root = storefrontRootDomain();
    const host = domain.toLowerCase().replace(/\.$/, '');
    if (!host.endsWith(`.${root}`)) return false;
    const sub = host.slice(0, -(root.length + 1));
    if (sub.includes('.') || normalizeSubdomain(sub) !== sub) return false;
    const rows = await this.prisma.$queryRaw<{ tenant_id: string }[]>`SELECT tenant_id FROM find_storefront_by_subdomain(${sub})`;
    return rows.length > 0;
  }

  // ------------------------------------------------------------ internos

  private async isTakenByAnotherTenant(subdomain: string): Promise<boolean> {
    const rows = await getTenantDb().$queryRaw<{ taken: boolean }[]>`
      SELECT storefront_subdomain_taken(${subdomain}, ${getTenantId()}) AS taken`;
    return rows[0]?.taken ?? false;
  }

  private async resolveTenant(rawSubdomain: string): Promise<string> {
    const subdomain = normalizeSubdomain(rawSubdomain);
    if (!subdomain) throw new NotFoundException('Tienda no encontrada');
    const rows = await this.prisma.$queryRaw<{ tenant_id: string }[]>`
      SELECT tenant_id FROM find_storefront_by_subdomain(${subdomain})`;
    const tenantId = rows[0]?.tenant_id;
    if (!tenantId) throw new NotFoundException('Tienda no encontrada');
    return tenantId;
  }

  /** Publicada y con el plan al día; si no, para el visitante "no existe". */
  private async requireOpenStore(): Promise<StorefrontSettings> {
    const settings = await getTenantDb().storefrontSettings.findFirst();
    if (!settings?.published || !(await this.subscriptionService.isStorefrontAvailable())) {
      throw new NotFoundException('Tienda no encontrada');
    }
    return settings;
  }

  private async buildPayload(settings: StorefrontSettings): Promise<StorefrontPayload> {
    const { catalog } = await buildStorefrontCatalog(getTenantDb(), settings);
    return { store: await this.storeInfo(settings), ...catalog };
  }

  private async storeInfo(settings: StorefrontSettings): Promise<StorefrontStoreInfo> {
    const db = getTenantDb();
    const [tenant, ts] = await Promise.all([
      db.tenant.findUnique({ where: { id: getTenantId() }, select: { name: true } }),
      db.tenantSettings.findFirst({
        select: { tradeName: true, logoUrl: true, fiscalAddress: true, contactPhone: true, contactEmail: true },
      }),
    ]);
    return {
      name: ts?.tradeName || tenant?.name || 'Tienda',
      subdomain: settings.subdomain,
      url: `https://${settings.subdomain}.${storefrontRootDomain()}`,
      template: settings.template,
      accentColor: settings.accentColor,
      heroTitle: settings.heroTitle ?? null,
      heroSubtitle: settings.heroSubtitle ?? null,
      coverUrl: settings.coverImageUrl ?? null,
      logoUrl: ts?.logoUrl ?? null,
      whatsappNumber: settings.whatsappNumber,
      address: ts?.fiscalAddress ?? null,
      phone: ts?.contactPhone ?? null,
      email: ts?.contactEmail ?? null,
      published: settings.published,
    };
  }

  /** Un archivo viejo que queda en disco nunca hace fallar el pedido (mismo criterio que el logo). */
  private async deleteCoverFile(url: string): Promise<void> {
    if (!url.startsWith(COVER_URL_PREFIX)) return;
    const filename = url.slice(COVER_URL_PREFIX.length);
    if (!filename || filename.includes('/')) return;
    try {
      await unlink(join(this.coversDir, filename));
    } catch (error) {
      this.logger.warn(`No se pudo borrar la portada anterior ${filename}: ${error}`);
    }
  }

  private throttle(key: string): void {
    const now = Date.now();
    const recent = (this.recentOrders.get(key) ?? []).filter((t) => now - t < ORDER_WINDOW_MS);
    if (recent.length >= ORDER_LIMIT_PER_WINDOW) {
      throw new ServiceUnavailableException('Recibimos muchos pedidos seguidos desde tu conexión. Esperá unos minutos y probá de nuevo');
    }
    recent.push(now);
    this.recentOrders.set(key, recent);
    if (this.recentOrders.size > 5000) {
      for (const [k, times] of this.recentOrders) if (times.every((t) => now - t >= ORDER_WINDOW_MS)) this.recentOrders.delete(k);
    }
  }

  private async sendOrderEmail(to: string, storeName: string, number: number, message: string): Promise<void> {
    const apiKey = process.env['RESEND_API_KEY'];
    const from = process.env['EMAIL_FROM'];
    if (!apiKey || !from) {
      this.logger.log(`[email no configurado] Pedido #${number} de ${storeName} para ${to}`);
      return;
    }
    try {
      const { error } = await new Resend(apiKey).emails.send({
        from,
        to,
        subject: `Nuevo pedido #${number} en tu tienda online`,
        text: `${message}\n\nLo ves en Oplex → Ventas → Pedidos de la tienda.`,
      });
      if (error) this.logger.error(`No se pudo avisar el pedido #${number} a ${to}: ${error.message}`);
    } catch (err) {
      this.logger.error(`No se pudo avisar el pedido #${number} a ${to}: ${err}`);
    }
  }
}
