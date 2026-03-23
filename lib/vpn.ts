import { v4 as uuidv4 } from "uuid";

const FALLBACK_SERVER_IP = "140.245.13.64";
const SNI = "spicypepper.app";
const PORT = "8443";

export function generateHysteriaLink(uuid: string, serverIp?: string): string {
  const ipToUse = serverIp || FALLBACK_SERVER_IP;
  // We include upmbps=8 and downmbps=5 to tell the client to enable Brutal
  // congestion control and pace its traffic at these exact speeds.
  return `hysteria2://${uuid}@${ipToUse}:${PORT}?insecure=1&mport=20000-50000&upmbps=8&downmbps=5&sni=${SNI}#SpicyVPN`;
}

export function generateUUID(): string {
  return uuidv4();
}

export function getExpiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}
