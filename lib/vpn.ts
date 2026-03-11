import { v4 as uuidv4 } from "uuid";

const SERVER_IP = "140.245.13.64";
const SNI = "spicypepper.app";
const PORT = "8443";

export function generateHysteriaLink(uuid: string): string {
  return `hysteria2://${uuid}@${SERVER_IP}:${PORT}?insecure=1&mport=20000-50000&sni=${SNI}#SpicyVPN`;
}

export function generateUUID(): string {
  return uuidv4();
}

export function getExpiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}
