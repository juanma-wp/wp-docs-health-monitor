import { z } from 'zod';

export const SiteIdentitySchema = z.object({
  id:          z.string().min(1),
  name:        z.string().min(1),
  lastUpdated: z.string().datetime(),
});

export type SiteIdentity = z.infer<typeof SiteIdentitySchema>;
