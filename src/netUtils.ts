import os from 'node:os';

export const resolveInterfaceAddress = (interfaceName?: string): string | undefined => {
  if (!interfaceName) return undefined;
  const iface = os.networkInterfaces()[interfaceName];
  if (!iface) return undefined;
  const record = iface.find(entry => entry.family === 'IPv4' && !entry.internal && entry.address);
  return record?.address;
};
