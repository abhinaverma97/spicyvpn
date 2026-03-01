import { v4 as uuidv4 } from "uuid";

const SERVER_IP = process.env.XRAY_SERVER_IP!;
const PUBLIC_KEY = process.env.XRAY_PUBLIC_KEY!;
const SHORT_ID = process.env.XRAY_SHORT_ID!;
const SNI = process.env.XRAY_SNI!;

export function generateVlessLink(uuid: string): string {
  const params = new URLSearchParams({
    encryption: "none",
    flow: "xtls-rprx-vision",
    security: "reality",
    sni: SNI,
    fp: "chrome",
    pbk: PUBLIC_KEY,
    sid: SHORT_ID,
    type: "tcp",
  });
  const port = process.env.XRAY_PORT ?? "8443";
  return `vless://${uuid}@${SERVER_IP}:${port}?${params.toString()}#SpicyVPN`;
}

export function generateUUID(): string {
  return uuidv4();
}

export function getExpiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}
