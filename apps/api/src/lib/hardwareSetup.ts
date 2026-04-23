import { prisma } from '@edna/db';
import { HardwareSetupZ, type HardwareSetup } from '@edna/schemas';

// AUDIT M7: single, validated write-path for HostProfile.hardwareSetup. The
// column is `Json` in Prisma; callers must go through this helper so no
// un-validated shape ever lands in jsonb.
export async function setHardwareSetup(userId: string, input: unknown): Promise<HardwareSetup> {
  const parsed = HardwareSetupZ.parse(input);
  await prisma.hostProfile.update({
    where: { userId },
    data: { hardwareSetup: parsed },
  });
  return parsed;
}
