import { z } from 'zod';

export const SiteRegistryEntrySchema = z.object({
  id:   z.string().min(1),
  name: z.string().min(1),
  dir:  z.string().min(1),
});

export const SiteRegistrySchema = z.object({
  generatedAt: z.string().datetime(),
  sites:       z.array(SiteRegistryEntrySchema),
});

export type SiteRegistryEntry = z.infer<typeof SiteRegistryEntrySchema>;
export type SiteRegistry      = z.infer<typeof SiteRegistrySchema>;
