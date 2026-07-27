export type NetworkCapability =
  | 'account'
  | 'cloudSync'
  | 'opds'
  | 'rss'
  | 'sendToDevice'
  | 'publicShare'
  | 'onlineMetadata'
  | 'onlineDictionary'
  | 'onlineTts'
  | 'remoteAssets'
  | 'telemetry'
  | 'updater'
  | 'billing'
  | 'llmTranslation';

export const NETWORK_CAPABILITIES = {
  account: false,
  cloudSync: false,
  opds: false,
  rss: false,
  sendToDevice: false,
  publicShare: false,
  onlineMetadata: false,
  onlineDictionary: false,
  onlineTts: false,
  remoteAssets: false,
  telemetry: false,
  updater: false,
  billing: false,
  llmTranslation: true,
} as const satisfies Readonly<Record<NetworkCapability, boolean>>;

export const isNetworkCapabilityAllowed = (capability: NetworkCapability): boolean =>
  NETWORK_CAPABILITIES[capability];
