export function pairingVerificationCode(desktopId: string, deviceId: string, requestNonce: string): string {
  const canonical = `${desktopId}\n${deviceId}\n${requestNonce}`;
  let hash = 0x811c9dc5 | 0;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (Math.abs(hash) % 1_000_000).toString().padStart(6, '0');
}
