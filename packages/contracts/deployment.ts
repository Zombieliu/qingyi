type NetworkType = 'testnet' | 'mainnet' | 'devnet' | 'localnet';

export const NETWORK: NetworkType = 'testnet';
export const PACKAGE_ID = '0x566f2d639a29ac29c64fb5bb1a87415ec5ae45fcbcb5d9066539bff5801fd934';
export const DUBHE_SCHEMA_ID = '0xfef203de9d3a2980429e91df535a0503ccf8d3c05aa3815936984243dc96f19f';
export const DAPP_HUB_ID =
  process.env.NEXT_PUBLIC_SUI_DAPP_HUB_ID ||
  process.env.SUI_DAPP_HUB_ID ||
  '0x0';
export const DAPP_HUB_INITIAL_SHARED_VERSION =
  process.env.NEXT_PUBLIC_SUI_DAPP_HUB_INITIAL_SHARED_VERSION ||
  process.env.SUI_DAPP_HUB_INITIAL_SHARED_VERSION ||
  '0';
