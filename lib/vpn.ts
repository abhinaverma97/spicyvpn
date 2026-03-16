import { v4 as uuidv4 } from "uuid";

const SERVER_IP = "140.245.13.64";
const SNI = "spicypepper.app";
const PORT = "8443";

export function generateHysteriaLink(uuid: string): string {
  // We include upmbps=0 and downmbps=0 to tell the client to disable pacing
  // and let the server's BBR congestion control handle the speeds.
  return `hysteria2://${uuid}@${SERVER_IP}:${PORT}?insecure=1&mport=20000-50000&upmbps=0&downmbps=0&sni=${SNI}#SpicyVPN`;
}

export function generateUUID(): string {
  return uuidv4();
}

export function getExpiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}
