import { PrismaClient, type Outlet } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  seedLineTotalCents,
  seedMenuItems,
  seedOutletMenuItems,
  seedSales
} from './seedTransactions';

const prisma = new PrismaClient();

const seedOutlets = [
  {
    id: '00000000-0000-4000-8000-000000000010',
    code: 'MAIN',
    name: 'Main Outlet',
    address: '1 Main Street'
  },
  {
    id: '00000000-0000-4000-8000-000000000011',
    code: 'NORTH',
    name: 'North Outlet',
    address: '2 North Avenue'
  }
] as const;

const seedStaff = [
  {
    email: 'staff.main@example.com',
    fullName: 'Main Outlet Staff',
    outletCode: 'MAIN'
  },
  {
    email: 'staff.north@example.com',
    fullName: 'North Outlet Staff',
    outletCode: 'NORTH'
  }
] as const;

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME?.trim() || 'HQ Admin';
  const staffPassword = process.env.SEED_STAFF_PASSWORD;

  if (!adminEmail || !adminPassword || adminPassword.length < 12) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12+ characters) are required');
  }

  if (!staffPassword || staffPassword.length < 12) {
    throw new Error('SEED_STAFF_PASSWORD (12+ characters) is required');
  }

  const [adminPasswordHash, staffPasswordHash] = await Promise.all([
    bcrypt.hash(adminPassword, 12),
    bcrypt.hash(staffPassword, 12)
  ]);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: adminPasswordHash,
      fullName: adminName,
      role: 'HQ_ADMIN',
      outletId: null,
      isActive: true
    },
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      fullName: adminName,
      role: 'HQ_ADMIN',
      outletId: null,
      isActive: true
    }
  });

  const outlets: Outlet[] = [];

  for (const outlet of seedOutlets) {
    outlets.push(
      await prisma.outlet.upsert({
        where: { code: outlet.code },
        update: {
          name: outlet.name,
          address: outlet.address,
          isActive: true
        },
        create: {
          id: outlet.id,
          code: outlet.code,
          name: outlet.name,
          address: outlet.address,
          isActive: true
        }
      })
    );
  }

  for (const staff of seedStaff) {
    const outlet = outlets.find((candidate) => candidate.code === staff.outletCode);

    if (!outlet) {
      throw new Error(`Seed outlet ${staff.outletCode} was not created`);
    }

    await prisma.user.upsert({
      where: { email: staff.email },
      update: {
        passwordHash: staffPasswordHash,
        fullName: staff.fullName,
        role: 'OUTLET_STAFF',
        outletId: outlet.id,
        isActive: true
      },
      create: {
        email: staff.email,
        passwordHash: staffPasswordHash,
        fullName: staff.fullName,
        role: 'OUTLET_STAFF',
        outletId: outlet.id,
        isActive: true
      }
    });
  }

  const menuItemIdsBySku = new Map<string, string>();

  for (const item of seedMenuItems) {
    const saved = await prisma.menuItem.upsert({
      where: { sku: item.sku },
      update: { name: item.name, category: item.category, isActive: true },
      create: {
        id: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        isActive: true
      }
    });

    menuItemIdsBySku.set(item.sku, saved.id);
  }

  const outletMenuItemIds = new Map<string, string>();

  for (const assignment of seedOutletMenuItems) {
    const outlet = outlets.find((candidate) => candidate.code === assignment.outletCode);
    const menuItemId = menuItemIdsBySku.get(assignment.sku);

    if (!outlet || !menuItemId) {
      throw new Error(`Seed assignment ${assignment.outletCode}:${assignment.sku} is invalid`);
    }

    await prisma.outletMenuItem.upsert({
      where: { outletId_menuItemId: { outletId: outlet.id, menuItemId } },
      update: { priceCents: assignment.priceCents, isAvailable: true },
      create: {
        id: assignment.id,
        outletId: outlet.id,
        menuItemId,
        priceCents: assignment.priceCents,
        isAvailable: true
      }
    });

    const saved = await prisma.outletMenuItem.findUniqueOrThrow({
      where: { outletId_menuItemId: { outletId: outlet.id, menuItemId } }
    });

    outletMenuItemIds.set(`${assignment.outletCode}:${assignment.sku}`, saved.id);

    await prisma.outletInventory.upsert({
      where: { outletMenuItemId: saved.id },
      update: {
        quantity: assignment.quantity,
        lowStockThreshold: assignment.lowStockThreshold
      },
      create: {
        outletMenuItemId: saved.id,
        quantity: assignment.quantity,
        lowStockThreshold: assignment.lowStockThreshold
      }
    });
  }

  const cashierIdsByEmail = new Map<string, string>();

  for (const staff of seedStaff) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: staff.email } });
    cashierIdsByEmail.set(staff.email, user.id);
  }

  for (const sale of seedSales) {
    const outlet = outlets.find((candidate) => candidate.code === sale.outletCode);
    const cashierId = cashierIdsByEmail.get(sale.cashierEmail);

    if (!outlet || !cashierId) {
      throw new Error(`Seed sale ${sale.id} references an unknown outlet or cashier`);
    }

    await prisma.sale.upsert({
      where: { id: sale.id },
      update: {},
      create: {
        id: sale.id,
        outletId: outlet.id,
        cashierId,
        receiptNumber: sale.receiptNumber,
        totalCents: sale.totalCents,
        createdAt: new Date(sale.createdAt),
        saleItems: {
          create: sale.items.map((item) => {
            const outletMenuItemId = outletMenuItemIds.get(`${sale.outletCode}:${item.sku}`);

            if (!outletMenuItemId) {
              throw new Error(`Seed sale ${sale.id} references an unassigned item ${item.sku}`);
            }

            return {
              outletMenuItemId,
              menuItemName: item.name,
              menuItemSku: item.sku,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              lineTotalCents: seedLineTotalCents(item)
            };
          })
        }
      }
    });
  }

  for (const outlet of outlets) {
    const maxSeededReceipt = seedSales
      .filter((sale) => sale.outletCode === outlet.code)
      .reduce((max, sale) => Math.max(max, sale.receiptNumber), 0);
    const counter = await prisma.receiptCounter.findUnique({ where: { outletId: outlet.id } });

    await prisma.receiptCounter.upsert({
      where: { outletId: outlet.id },
      update: { nextNumber: Math.max(counter?.nextNumber ?? 0, maxSeededReceipt) },
      create: { outletId: outlet.id, nextNumber: maxSeededReceipt }
    });
  }

  console.log(`HQ admin ready for ${adminEmail}`);
  console.log(`Seeded outlets: ${outlets.map((outlet) => outlet.code).join(', ')}`);
  console.log(`Seeded outlet users: ${seedStaff.map((staff) => staff.email).join(', ')}`);
  console.log(
    `Seeded ${seedMenuItems.length} menu items and ${seedSales.length} completed sales for reporting`
  );
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
