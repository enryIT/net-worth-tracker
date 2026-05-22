import "server-only";

import { z } from "zod";

export const APP_DATA_EXPORT_VERSION = 1;

const exportUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
});

const exportEnvelopeSchema = z.object({
  version: z.literal(APP_DATA_EXPORT_VERSION, {
    error: "Versione export non supportata.",
  }),
  appVersion: z.string().min(1),
  exportedAt: z.string().datetime(),
  exportedUser: exportUserSchema,
  sections: z.record(z.string(), z.unknown()),
});

export type AppDataExportEnvelope = z.infer<typeof exportEnvelopeSchema>;

export type BuildExportEnvelopeInput = {
  appVersion: string;
  exportedAt: Date;
  exportedUser: z.infer<typeof exportUserSchema>;
  sections: Record<string, unknown>;
};

export function buildExportEnvelope(
  input: BuildExportEnvelopeInput
): AppDataExportEnvelope {
  return {
    version: APP_DATA_EXPORT_VERSION,
    appVersion: input.appVersion,
    exportedAt: input.exportedAt.toISOString(),
    exportedUser: input.exportedUser,
    sections: input.sections,
  };
}

export function parseImportEnvelope(input: unknown) {
  return exportEnvelopeSchema.safeParse(input);
}
