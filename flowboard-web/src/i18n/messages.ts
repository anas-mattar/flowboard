/**
 * Message catalogue (STANDARDS §1.6, FS §8 internationalisation). Every
 * user-visible string in flowboard-web is added here, never inline in a
 * component. No translations ship in MVP (CL-E7); this is the single
 * place text appears so that translating later touches one file.
 */
export const messages = {
  appName: 'FlowBoard',
} as const;

export type MessageKey = keyof typeof messages;
