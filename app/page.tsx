"use client";

/**
 * Mango x RDEP — Smart receipt
 *
 * Concept: Mango's own look is editorial black and white, so black is the colour block here.
 * Compact black hero (white wordmark, tier chip, greeting) with the feedback card overlapping its
 * edge, then total paid, the receipt as torn thermal paper (black "total paid" band), a muted
 * autoplay video, swipeable coupon tickets (the centred one turns black), a compact Mango Club
 * membership card, profile, exchange, "Reach us", store card, closing card and a "Powered by" strip.
 * Popups are light rounded sheets.
 *
 * Phone first: hover styles only apply on devices that can hover; on touch every button and link
 * dips while pressed and uses `active:` colours.
 *
 * Fixed layout: designed at 400px wide. On phones (<= 520px) it is scaled with CSS `zoom` to fill
 * the screen, on larger screens it stays a centred 400px column.
 *
 * FONTS (MangoSans, .ttf, in /public/fonts): "MangoSans Regular.ttf" (400), "MangoSans-Bold.ttf" (700)
 * ASSETS (in /public/images/design-mode): mango.png, RDEP-logo.png
 * Stack: Next.js (app router) + Tailwind. No other dependencies.
 *
 * Usage:  app/mango-receipt/page.tsx
 *   import MangoReceipt from "@/components/MangoReceipt";
 *   export default function Page() { return <MangoReceipt />; }
 *
 * With real data: <MangoReceipt receipts={[...]} data={currentReceipt} />
 *   `club` (tier, points, coupons) is optional on each receipt; those sections are hidden without it.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import Image from "next/image";
import { JetBrains_Mono } from "next/font/google";

const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap" });
const USE_RECEIPT_MONO = true;
const monoClass = USE_RECEIPT_MONO ? mono.className : "tabular-nums";

const BRAND_STACK = `"MangoSans", Arial, "Helvetica Neue", Helvetica, sans-serif`;

const FONT_FACES = `
@font-face{font-family:"MangoSans";font-weight:400;font-style:normal;font-display:swap;src:url("/fonts/MangoSans%20Regular.ttf") format("truetype")}
@font-face{font-family:"MangoSans";font-weight:700;font-style:normal;font-display:swap;src:url("/fonts/MangoSans-Bold.ttf") format("truetype")}
.mg-root{font-family:${BRAND_STACK}}
.mg-display{font-family:${BRAND_STACK};font-weight:700}

/* Phone press feedback: every button and link dips slightly while touched */
.mg-root a,.mg-root button{-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.mg-root a,.mg-root button:not(:disabled){transition:transform .12s ease,background-color .2s ease,color .2s ease,border-color .2s ease}
.mg-root a:active,.mg-root button:not(:disabled):active{transform:scale(.97)}

/* Rating stars flash in a wave until the first tap */
@keyframes mg-star-flash{0%,100%{fill:var(--mg-wash);transform:scale(1)}45%{fill:var(--mg-brown);transform:scale(1.2)}}
.mg-star-flash{animation:mg-star-flash 1.6s ease-in-out infinite}

/* Light sweep across the membership card */
@keyframes mg-sheen{0%,55%{left:-60%}100%{left:130%}}
.mg-sheen{position:relative;overflow:hidden}
.mg-sheen::after{content:"";position:absolute;top:0;bottom:0;left:-60%;width:40%;pointer-events:none;background:linear-gradient(100deg,transparent,rgba(255,255,255,.14),transparent);transform:skewX(-18deg);animation:mg-sheen 5s ease-in-out infinite}

@media (prefers-reduced-motion:reduce){
  .mg-star-flash{animation:none}
  .mg-sheen::after{animation:none;display:none}
  .mg-root a,.mg-root button:not(:disabled){transition:none}
  .mg-root a:active,.mg-root button:not(:disabled):active{transform:none}
}
`;

/* Brand tokens. */
const theme = {
  "--mg-brown": "#8B6F5E",
  "--mg-brown-dark": "#6E5445",
  "--mg-ink": "#1A1A1A",
  "--mg-canvas": "#F5F5F5",
  "--mg-page": "#EAEAEA",
  "--mg-wash": "#F8F8F8",
  "--mg-press": "#EBEBEB",
  "--mg-sand": "#D8C3B4",
  "--mg-line": "rgba(139,111,94,0.2)",
  "--mg-edge": "rgba(139,111,94,0.75)",
} as CSSProperties;

/* Assets + links */
const DEFAULT_MANGO_LOGO = "/images/design-mode/mango.png";
const DEFAULT_RDEP_LOGO = "/images/design-mode/RDEP-logo.png";
const DEFAULT_INSTAGRAM_URL = "https://www.instagram.com/mango/";
const DEFAULT_STORE_LOCATOR_URL = "https://shop.mango.com/in";

/* Marketing video: https://youtu.be/NOWWhR1JlGQ */
const MARKETING_VIDEO_ID = "NOWWhR1JlGQ";

/* Club tiers, lowest to highest. `foil` is the metallic gradient used on lettering and chips.
 * Rename the tiers here if the Mango team wants their own names (e.g. Style Insider / Curator / Icon). */
export type TierName = "Silver" | "Gold" | "Platinum";
const TIERS: { name: TierName; foil: string }[] = [
  { name: "Silver", foil: "linear-gradient(120deg,#FFFFFF 0%,#C9CED6 35%,#8D949E 62%,#EEF0F3 100%)" },
  { name: "Gold", foil: "linear-gradient(120deg,#FFF3C4 0%,#E5BD52 38%,#A67C1A 62%,#F7E08F 100%)" },
  { name: "Platinum", foil: "linear-gradient(120deg,#FFFFFF 0%,#D6E2F2 32%,#93A9C9 62%,#F1F6FD 100%)" },
];
const foilText = (foil: string): CSSProperties => ({
  backgroundImage: foil,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
});

/* ------------------------------- types ------------------------------------------- */
export interface MangoItem {
  name: string;
  size: string;
  sku: string;
  hsn: string;
  qty: number;
  mrp: number;
  discount: number;
}

export interface MangoCoupon {
  code: string;
  /** Big headline, e.g. "20% OFF" or "₹500 OFF" */
  value: string;
  title: string;
  description: string;
  validTill: string;
}

export interface MangoClub {
  tier: TierName;
  points: number;
  /** Points still needed for the next tier. null / omitted at the top tier. */
  pointsToNext?: number | null;
  coupons: MangoCoupon[];
}

export interface MangoReceiptData {
  invoiceNo: string;
  date: string;
  customer: { name: string; mobile: string; email: string };
  items: MangoItem[];
  sgst: number;
  cgst: number;
  payment: { mode: string; ref: string };
  store: { name: string; address: string; email: string; phone: string; gstin: string; associate: string };
  registeredOffice: string;
  exchange: { days: number; points: string[] };
  callTo: string;
  emailTo: string;
  /** Customer tier + coupons. Optional: the coupons, tier card and hero chip are hidden without it. */
  club?: MangoClub;
}

export interface ProfileValues {
  name: string;
  email: string;
  gender: string;
  birthday: string;
  anniversary: string;
  offers: boolean;
}

export interface FeedbackValues {
  invoiceNo: string;
  overall: number;
  categories: { service: number; product: number; sizes: number; value: number };
  comment: string;
}

export interface MangoReceiptProps {
  data?: MangoReceiptData;
  receipts?: MangoReceiptData[];
  qrSrc?: string;
  logoSrc?: string;
  rdepLogoSrc?: string;
  instagramUrl?: string;
  storeLocatorUrl?: string;
  onDownload?: (receipt: MangoReceiptData) => void;
  onSendEmail?: (email: string, receipt: MangoReceiptData) => void;
  onSaveProfile?: (values: ProfileValues) => void;
  onSubmitFeedback?: (values: FeedbackValues) => void;
  onSelectReceipt?: (invoiceNo: string) => void;
}

type IconName =
  | "history" | "mail" | "download" | "phone" | "instagram" | "pin" | "store"
  | "close" | "check" | "arrow" | "chevron" | "user" | "tax" | "directions" | "call"
  | "star" | "ticket";
type ModalId = "history" | "email" | "qr" | null;

interface HistoryRow {
  invoiceNo: string;
  date: string;
  storeName: string;
  amount: number;
  items: number;
  current: boolean;
}

/* ------------------------------- helpers ----------------------------------------- */
const inr = (n: number): string => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const trim = (n: number): string => String(Number(n.toFixed(2)));
const round2 = (n: number): number => Math.round(n * 100) / 100;
const netOf = (i: MangoItem): number => round2(i.mrp * i.qty - i.discount);
const emailOk = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function totalsOf(r: MangoReceiptData) {
  const subtotal = round2(r.items.reduce((a, i) => a + i.mrp * i.qty, 0));
  const discount = round2(r.items.reduce((a, i) => a + i.discount, 0));
  return { subtotal, discount, total: round2(subtotal - discount), pieces: r.items.reduce((a, i) => a + i.qty, 0) };
}

function dateValue(d: string): number {
  const [dd, mm, yyyy] = d.split(" ")[0].split("-").map(Number);
  return Date.UTC(yyyy, (mm || 1) - 1, dd || 1);
}

function seeded(seed: string): () => number {
  let s = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    s ^= seed.charCodeAt(i);
    s = Math.imul(s, 16777619);
  }
  s = s || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/* ---------------------------- downloadable receipt ------------------------------- */
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildReceiptHtml(r: MangoReceiptData, logoSrc: string, rdepLogoSrc: string): string {
  const abs = (p: string) => (/^(https?:|data:)/.test(p) ? p : `${window.location.origin}${encodeURI(p)}`);
  const t = totalsOf(r);
  const rows = r.items
    .map(
      (i) => `<tr>
      <td><div class="n">${esc(i.name)}</div><div class="s">Size ${esc(i.size)} &middot; SKU ${esc(i.sku)} &middot; HSN ${esc(i.hsn)}</div></td>
      <td class="r">${i.qty}</td><td class="r">${inr(i.mrp)}</td><td class="r">&minus;${inr(i.discount)}</td><td class="r b">${inr(netOf(i))}</td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mango Receipt ${esc(r.invoiceNo)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,'Helvetica Neue',sans-serif;font-size:14px;color:#8B6F5E;background:#F5F5F5;max-width:760px;margin:0 auto;padding:24px}
.bar{display:flex;justify-content:flex-end;margin-bottom:16px}
.bar button{background:#1A1A1A;color:#fff;border:0;border-radius:10px;padding:10px 18px;font:700 13px Arial,sans-serif;cursor:pointer}
.sheet{background:#fff;border-radius:20px;padding:28px}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:16px;border-bottom:3px solid #1A1A1A}
.head img{height:34px;width:auto}
h1{font-size:22px;color:#1A1A1A;text-transform:uppercase;letter-spacing:1px;margin-top:12px}
.meta{text-align:right;font-size:12px;line-height:1.8}
table{width:100%;border-collapse:collapse;margin-top:20px}
th{text-align:left;font-size:11px;letter-spacing:.8px;padding:8px;background:#F5F5F5;border-bottom:1px solid rgba(139,111,94,.3)}
td{padding:12px 8px;border-bottom:1px solid rgba(139,111,94,.3);vertical-align:top;font-size:13px}
.r{text-align:right}.b{font-weight:700;color:#1A1A1A}.n{text-transform:uppercase;font-weight:700;color:#1A1A1A}.s{font-size:11px;margin-top:3px}
.sum{margin:18px 0 0 auto;width:300px}
.row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px}
.total{display:flex;justify-content:space-between;align-items:baseline;border-top:3px solid #1A1A1A;margin-top:10px;padding-top:12px;color:#1A1A1A;font-weight:700}
.total strong{font-size:26px}
.pay{margin-top:18px;background:#1A1A1A;color:#fff;border-radius:14px;padding:14px 16px;display:flex;justify-content:space-between;font-size:14px}
.store{margin-top:24px;font-size:12px;line-height:1.7;border-top:1px solid rgba(139,111,94,.3);padding-top:14px}
.foot{margin-top:22px;text-align:center;font-size:12px}.foot img{height:20px;vertical-align:middle;margin-left:6px}
@media print{.bar{display:none}body{max-width:none;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{border-radius:0}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Save as PDF</button></div>
<div class="sheet">
<div class="head"><div><img src="${esc(abs(logoSrc))}" alt="Mango" onerror="this.style.display='none'"><h1>Tax invoice</h1></div>
<div class="meta"><div><b>Invoice no:</b> ${esc(r.invoiceNo)}</div><div><b>Date:</b> ${esc(r.date)}</div><div><b>Customer:</b> ${esc(r.customer.name)}</div><div><b>Mobile:</b> ${esc(r.customer.mobile)}</div></div></div>
<table><thead><tr><th style="width:44%">ITEM</th><th class="r">QTY</th><th class="r">UNIT PRICE</th><th class="r">DISCOUNT</th><th class="r">NET AMOUNT</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sum">
<div class="row"><span>Subtotal (MRP)</span><b>&#8377;${inr(t.subtotal)}</b></div>
<div class="row"><span>Discount</span><b>&minus;&#8377;${inr(t.discount)}</b></div>
<div class="row"><span>Includes SGST</span><b>&#8377;${inr(r.sgst)}</b></div>
<div class="row"><span>Includes CGST</span><b>&#8377;${inr(r.cgst)}</b></div>
<div class="total"><span>Total paid</span><strong>&#8377;${inr(t.total)}</strong></div></div>
<div class="pay"><span>Payment method &middot; ${esc(r.payment.mode)} &ndash; ${esc(r.payment.ref)}</span><b>&#8377;${inr(t.total)}</b></div>
<div class="store"><b>${esc(r.store.name)}</b><br>${esc(r.store.address)}<br>${esc(r.store.email)} &middot; ${esc(r.store.phone)}<br>GSTIN: ${esc(r.store.gstin)}<br>Registered office: ${esc(r.registeredOffice)}</div>
<div class="foot">Thank you for shopping at Mango<br><br>Powered by <img src="${esc(abs(rdepLogoSrc))}" alt="rdep" onerror="this.style.display='none'"></div>
</div></body></html>`;
}

function downloadReceipt(r: MangoReceiptData, logoSrc: string, rdepLogoSrc: string) {
  const blob = new Blob([buildReceiptHtml(r, logoSrc, rdepLogoSrc)], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Mango_Receipt_${r.invoiceNo}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* -------------------------------- Sample Data ----------------------------------- */
const halfTax = (total: number): number => Math.floor(((total - total / 1.18) / 2) * 100) / 100;

/* SAMPLE club data. Replace with the real tier, points and coupons from the Mango loyalty API. */
const SAMPLE_CLUB: MangoClub = {
  tier: "Gold",
  points: 3240,
  pointsToNext: 1760,
  coupons: [
    { code: "MANGO20", value: "20% OFF", title: "Welcome back offer", description: "On your next purchase of ₹3,999 or more.", validTill: "30 Nov 2026" },
    { code: "GOLD500", value: "₹500 OFF", title: "Gold member reward", description: "On any order above ₹2,999.", validTill: "31 Dec 2026" },
    { code: "FESTIVE10", value: "10% OFF", title: "Festive edit", description: "On new arrivals. One use only.", validTill: "15 Nov 2026" },
  ],
};

const SAMPLE_COMMON = {
  customer: { name: "Sagar H P", mobile: "9620921294", email: "sagar.p@proenx.com" },
  store: {
    name: "Mango Store Ambience Mall",
    address: "C-36, Ambience Mall, Gurgaon, NH-8 122010, Gurugram, Haryana",
    email: "contact@mango.com",
    phone: "01244665318",
    gstin: "06AAOCR0097H1Z4",
    associate: "Rohit",
  },
  registeredOffice:
    "1/1, 4th Floor, Cabin 1, Vinayaka Towers, Gandhinagar, K. G. Road, Bangalore, Bangalore North, Karnataka, India, 560009",
  exchange: {
    days: 30,
    points: [
      "Items can be exchanged within 30 days of purchase with this receipt.",
      "Products must be unworn, unwashed and carry all original tags.",
      "Exchange is for the same or a higher value item; any price difference is payable.",
      "Items bought during the end of season sale, innerwear and accessories are not exchangeable.",
    ],
  },
  callTo: "+911244665318",
  emailTo: "contact@mango.com",
  club: SAMPLE_CLUB,
};

export const sampleMangoReceipts: MangoReceiptData[] = [
  {
    ...SAMPLE_COMMON,
    invoiceNo: "20260626000154",
    date: "14-07-2026 11:14:04",
    items: [{ name: "LINEN-COTTON BLEND STRIPE SHIRT", size: "M", sku: "27061231", hsn: "62032090", qty: 1, mrp: 4290, discount: 1716 }],
    sgst: halfTax(2574),
    cgst: halfTax(2574),
    payment: { mode: "CASH", ref: "REF98765" },
  },
  {
    ...SAMPLE_COMMON,
    invoiceNo: "20260526000112",
    date: "26-05-2026 18:41:22",
    store: {
      ...SAMPLE_COMMON.store,
      name: "Mango Junction Mall",
      address: "Junction Mall, City Center, Durgapur, WB",
    },
    items: [
      { name: "RELAXED FIT STRAIGHT JEANS", size: "32", sku: "17081052", hsn: "62034200", qty: 1, mrp: 5990, discount: 1200 },
      { name: "TEXTURED COTTON T-SHIRT", size: "L", sku: "27045518", hsn: "61091000", qty: 1, mrp: 2290, discount: 0 },
    ],
    sgst: halfTax(7080),
    cgst: halfTax(7080),
    payment: { mode: "CARD", ref: "REF40211" },
  },
  {
    ...SAMPLE_COMMON,
    invoiceNo: "20260203000047",
    date: "03-02-2026 14:09:50",
    store: {
      ...SAMPLE_COMMON.store,
      name: "Mango Quest Mall",
      address: "33, Syed Amir Ali Ave, Park Circus, Kolkata, WB",
    },
    items: [{ name: "BELTED MIDI DRESS", size: "S", sku: "37057903", hsn: "62044990", qty: 1, mrp: 7990, discount: 0 }],
    sgst: halfTax(7990),
    cgst: halfTax(7990),
    payment: { mode: "UPI", ref: "REF77310" },
  },
];

/* -------------------------------- icons ------------------------------------------ */
const STAR_PATH = "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1z";
const PATHS: Record<IconName, ReactNode> = {
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  phone: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  ),
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  store: (
    <>
      <path d="M3 9 4.5 4h15L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  user: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  tax: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h10M7 12h10M7 16h6" />
    </>
  ),
  directions: <path d="M9 18l6-6-6-6" />,
  call: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  ),
  star: <path d={STAR_PATH} />,
  ticket: (
    <>
      <path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 1 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" />
      <path d="M9 9h6M9 12h6M9 15h3" />
    </>
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="m5 12 5 5 9-10" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
};

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/* ------------------------- placeholder QR ---------------------------------------- */
function PlaceholderQR({ seed }: { seed: string }) {
  const N = 25;
  const cells = useMemo(() => {
    const rnd = seeded(seed);
    const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
    const out: [number, number][] = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!inFinder(x, y) && rnd() > 0.5) out.push([x, y]);
    return out;
  }, [seed]);
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" />
    </g>
  );
  return (
    <svg viewBox={`-1 -1 ${N + 2} ${N + 2}`} fill="#1A1A1A" shapeRendering="crispEdges" role="img" aria-label="Receipt QR code" className="h-full w-full">
      <rect x="-1" y="-1" width={N + 2} height={N + 2} fill="#fff" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
      ))}
      {finder(0, 0)}
      {finder(N - 7, 0)}
      {finder(0, N - 7)}
    </svg>
  );
}

/* --------------------------------- shared ---------------------------------------- */
const onPaper = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mg-ink)]";
const lift = "border border-black/5 shadow-[0_10px_28px_-14px_rgba(26,26,26,0.35)]";

const fieldInput =
  "w-full rounded-none border-0 border-b-2 border-[var(--mg-edge)] bg-transparent px-0 py-2.5 text-base text-[var(--mg-ink)] outline-none transition-colors [-webkit-appearance:none] [appearance:none] placeholder:text-[var(--mg-brown)] focus:border-[var(--mg-ink)]";
const fieldLabel = "mb-1 block text-[13px] text-[var(--mg-brown)]";
const solidBtn = `flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--mg-ink)] py-4 text-[13px] font-bold uppercase tracking-[0.12em] text-white transition-colors active:bg-[var(--mg-brown)] [@media(hover:hover)]:hover:bg-[var(--mg-brown)] motion-reduce:transition-none ${onPaper}`;
const outlineBtn = `flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--mg-ink)] bg-white py-4 text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--mg-ink)] transition-colors active:border-[var(--mg-ink)] [@media(hover:hover)]:hover:border-[var(--mg-ink)] active:bg-[var(--mg-ink)] [@media(hover:hover)]:hover:bg-[var(--mg-ink)] active:text-white [@media(hover:hover)]:hover:text-white motion-reduce:transition-none ${onPaper}`;

const DESIGN_W = 400;
const PHONE_MAX = 520;
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function useFitScale(): number {
  const [scale, setScale] = useState(1);
  useIsoLayoutEffect(() => {
    const update = () => {
      const w = document.documentElement.clientWidth;
      setScale(w <= PHONE_MAX ? w / DESIGN_W : 1);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return scale;
}
const zoomStyle = (scale: number): CSSProperties | undefined => (scale === 1 ? undefined : ({ zoom: scale } as CSSProperties));

/** True while the element is inside the viewport (expanded by `rootMargin`, needs `threshold` visible). */
function useInView<T extends Element>(ref: RefObject<T | null>, rootMargin: string, threshold: number): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin, threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, threshold]);
  return inView;
}

function BrandImage({
  src, alt, width, height, className, fallbackClassName, priority = false,
}: {
  src: string; alt: string; width: number; height: number; className: string; fallbackClassName: string; priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={fallbackClassName}>{alt}</span>;
  return (
    <Image
      ref={(img: HTMLImageElement | null) => {
        if (img && img.complete && img.naturalWidth === 0) setFailed(true);
      }}
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function Leader({ label, value, strong = false, className = "" }: { label: ReactNode; value: ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <dt className="flex min-w-0 flex-1 items-baseline gap-2 after:mb-[3px] after:h-0 after:min-w-3 after:flex-1 after:border-b after:border-dotted after:border-current after:opacity-40 after:content-['']">
        {label}
      </dt>
      <dd className={`shrink-0 text-right tabular-nums ${strong ? "font-bold text-[var(--mg-ink)]" : ""}`}>{value}</dd>
    </div>
  );
}

function Collapse({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  return (
    <div
      id={id}
      aria-hidden={!open}
      className={`grid transition-[grid-template-rows,visibility] duration-300 motion-reduce:transition-none ${
        open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"
      }`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function ZigZag({ down = false }: { down?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg aria-hidden="true" className="block h-2.5 w-full">
      <defs>
        <pattern id={id} width="16" height="10" patternUnits="userSpaceOnUse">
          <path d={down ? "M0 0 L8 10 L16 0 Z" : "M0 10 L8 0 L16 10 Z"} fill="#fff" />
        </pattern>
      </defs>
      <rect width="100%" height="10" fill={`url(#${id})`} />
    </svg>
  );
}

function Heading({ children, sub, size = 22 }: { children: ReactNode; sub?: string; size?: number }) {
  return (
    <div>
      <h2 className="mg-display uppercase leading-[1.1] tracking-[0.05em] text-[var(--mg-ink)]" style={{ fontSize: size }}>
        {children}
      </h2>
      <span aria-hidden="true" className="mt-2.5 block h-1 w-10 rounded-full bg-[var(--mg-brown)]" />
      {sub && <p className="mt-2.5 text-[14px] leading-snug text-[var(--mg-brown)]">{sub}</p>}
    </div>
  );
}

/* Popups: light rounded sheets */
function Modal({
  title,
  onClose,
  scale,
  children,
}: {
  title: string;
  onClose: () => void;
  scale: number;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      (previous as HTMLElement | null)?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#1A1A1A]/60 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="mg-root max-h-[88vh] w-full overflow-y-auto rounded-t-[32px] bg-white outline-none sm:w-[400px] sm:rounded-[32px]"
      >
        <div className="w-full sm:w-[400px]" style={zoomStyle(scale)}>
          <div className="p-6 text-[var(--mg-brown)]">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--mg-line)] pb-4">
              <div className="min-w-0">
                <h2 id={titleId} className="mg-display text-[20px] font-bold uppercase tracking-[0.05em] text-[var(--mg-ink)]">
                  {title}
                </h2>
                <span className="mt-2 block h-1 w-10 rounded-full bg-[var(--mg-brown)]" />
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--mg-wash)] text-[var(--mg-ink)] transition-colors active:bg-[var(--mg-press)] ${onPaper}`}
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ paper item row ----------------------------------- */
function PaperItem({ item, open, onToggle }: { item: MangoItem; open: boolean; onToggle: () => void }) {
  const panelId = useId();
  const m = monoClass;
  const net = netOf(item);
  const gross = item.mrp * item.qty;
  const pct = gross > 0 ? (item.discount / gross) * 100 : 0;
  return (
    <li className="border-b border-dashed border-black/40 py-3.5 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2.5 rounded text-left ${onPaper}`}
      >
        <span aria-hidden="true" className={`${m} text-[13px] font-bold leading-snug text-[var(--mg-brown)]`}>
          [{open ? "−" : "+"}]
        </span>
        <span className="min-w-0">
          <span className={`${m} block text-[13px] font-semibold uppercase leading-snug text-[var(--mg-ink)]`}>{item.name}</span>
          <span className={`${m} mt-1 block text-xs text-[var(--mg-brown)]`}>
            SIZE {item.size} &nbsp; QTY {item.qty} &nbsp; MRP {item.mrp.toLocaleString("en-IN")}
          </span>
        </span>
        <span className={`${m} text-sm font-bold leading-snug tabular-nums text-[var(--mg-ink)]`}>{inr(net)}</span>
      </button>

      <Collapse open={open} id={panelId}>
        <div className={`${m} ml-8 mt-3 space-y-2.5 border-l-2 border-[var(--mg-brown)] pl-3 text-xs`}>
          <dl className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--mg-brown)]">SKU</dt>
            <dd className="text-[13px] font-bold tracking-wide text-[var(--mg-ink)]">{item.sku}</dd>
          </dl>

          <dl className="grid grid-cols-2 divide-x divide-black/15 rounded-md border border-black/15">
            {(
              [
                ["HSN", item.hsn],
                ["UoM", "Pcs"],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="min-w-0 px-1.5 py-1.5">
                <dt className="text-[var(--mg-brown)]">{k}</dt>
                <dd className="mt-0.5 break-words font-bold tabular-nums text-[var(--mg-ink)]">{v}</dd>
              </div>
            ))}
          </dl>

          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-[var(--mg-wash)] px-2.5 py-1.5 text-[var(--mg-brown-dark)]">
              <dt>Discount %</dt>
              <dd className="mt-0.5 text-[13px] font-bold tabular-nums">{trim(pct)}</dd>
            </div>
            <div className="rounded-md bg-[var(--mg-wash)] px-2.5 py-1.5 text-[var(--mg-brown-dark)]">
              <dt>Discount amount</dt>
              <dd className="mt-0.5 text-[13px] font-bold tabular-nums">{trim(item.discount)}</dd>
            </div>
          </dl>
        </div>
      </Collapse>
    </li>
  );
}

/* ------------------------------- rating card -------------------------------------- */
const RATING_WORDS = ["Poor", "Fair", "Good", "Very good", "Excellent"];
const FEEDBACK_CATEGORIES = [
  { key: "service", label: "Service quality" },
  { key: "product", label: "Product offering" },
  { key: "sizes", label: "Sizes availability" },
  { key: "value", label: "Value for money" },
] as const;

function SleekRateCard({ data, onSubmit }: { data: MangoReceiptData; onSubmit?: (v: FeedbackValues) => void }) {
  const [overall, setOverall] = useState(0);
  const [hover, setHover] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [cats, setCats] = useState({ service: 0, product: 0, sizes: 0, value: 0 });
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const commentId = useId();
  const detailId = useId();
  const m = monoClass;
  const shown = hover || overall;

  const handleStarClick = (n: number) => {
    setOverall(n);
    setExpanded(true);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.({ invoiceNo: data.invoiceNo, overall, categories: cats, comment: comment.trim() });
    setSubmitted(true);
  };

  return (
    <section
      aria-label="Rate your visit"
      className="relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white p-4 text-[var(--mg-brown)] shadow-[0_10px_28px_-14px_rgba(26,26,26,0.35)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="mg-display block text-[9px] uppercase tracking-[0.18em] text-[var(--mg-brown)]">Quick Feedback</span>
          <h2 className="mg-display mt-0.5 text-[16px] uppercase leading-tight tracking-[0.02em] text-[var(--mg-ink)]">How was your visit?</h2>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--mg-line)] bg-[var(--mg-wash)] text-[var(--mg-brown)]">
          <Icon name="star" className="h-4 w-4" />
        </span>
      </div>

      {submitted ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-black/5 bg-[var(--mg-wash)] p-3" aria-live="polite">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--mg-ink)] text-white">
            <Icon name="check" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mg-display text-[14px] uppercase tracking-wider text-[var(--mg-ink)]">Thank you for rating!</p>
            <p className="mt-0.5 text-[12px] text-[var(--mg-brown)]">
              You gave {overall} stars ({RATING_WORDS[overall - 1].toLowerCase()}).
            </p>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setExpanded(false);
                setOverall(0);
              }}
              className={`${m} mt-1.5 text-[11px] font-bold text-[var(--mg-ink)] underline underline-offset-2`}
            >
              [ Edit rating ]
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-center justify-between rounded-2xl border border-black/5 bg-[var(--mg-wash)] px-4 py-3">
            <div role="radiogroup" aria-label="Overall rating" className="flex gap-1.5" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={overall === n}
                  aria-label={`${n} ${n === 1 ? "star" : "stars"}, ${RATING_WORDS[n - 1]}`}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => handleStarClick(n)}
                  className={`grid h-9 w-9 place-items-center rounded-lg ${onPaper}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    className={`h-6 w-6 stroke-[var(--mg-brown)] transition-colors ${n <= shown ? "fill-[var(--mg-brown)]" : "fill-white"} ${
                      !overall && !hover ? "mg-star-flash" : ""
                    }`}
                    style={!overall && !hover ? { animationDelay: `${(n - 1) * 0.18}s` } : undefined}
                  >
                    <path d={STAR_PATH} />
                  </svg>
                </button>
              ))}
            </div>
            <div className="pl-2 text-right">
              <p className="mg-display text-[11px] uppercase tracking-wide text-[var(--mg-ink)]">{overall ? RATING_WORDS[overall - 1] : "Tap to rate"}</p>
              <p className="text-[9px] font-medium text-[var(--mg-brown)]">{overall ? `${overall}/5 stars` : "Instant feedback"}</p>
            </div>
          </div>

          <Collapse open={expanded} id={detailId}>
            <form onSubmit={submit} noValidate className="mt-3 space-y-3 border-t border-[var(--mg-line)] pt-3">
              <div>
                <p className={`${m} mb-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--mg-brown)]`}>Rate specific categories</p>
                <div className="space-y-2">
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <div key={c.key} className="flex items-center justify-between rounded-xl border border-black/5 bg-[var(--mg-wash)] px-3 py-2">
                      <span className={`${m} text-[11px] font-semibold uppercase text-[var(--mg-ink)]`}>{c.label}</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setCats((p) => ({ ...p, [c.key]: star }))}
                            className="p-1"
                            aria-label={`${star} stars for ${c.label}`}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              strokeWidth="1.5"
                              className={`h-4 w-4 stroke-[var(--mg-brown)] ${star <= cats[c.key] ? "fill-[var(--mg-brown)]" : "fill-white"}`}
                            >
                              <path d={STAR_PATH} />
                            </svg>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor={commentId} className={`${fieldLabel} text-[11px] font-bold uppercase tracking-wider`}>
                  Any additional thoughts? (Optional)
                </label>
                <textarea
                  id={commentId}
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tell us what you liked or how we can improve..."
                  className={`${fieldInput} resize-none text-[13px]`}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button type="submit" className={`${solidBtn} !py-3 text-[12px]`}>
                  Submit rating
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="rounded-xl border border-black/10 bg-[var(--mg-wash)] px-4 py-3 text-[12px] font-bold uppercase tracking-wider text-[var(--mg-brown)] active:bg-[var(--mg-press)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Collapse>
        </div>
      )}
    </section>
  );
}

/* ------------------------------- video card --------------------------------------- */
/** YouTube embed that autoplays muted while at least half of it is on screen and pauses when it
 *  leaves. No external script: it talks to the player through postMessage (enablejsapi=1). */
function VideoCard() {
  const sectionRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const near = useInView(sectionRef, "300px 0px", 0);
  const visible = useInView(sectionRef, "0px", 0.5);

  useEffect(() => {
    if (near) setMounted(true);
  }, [near]);

  const command = useCallback((func: string) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: "" }), "*");
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const func = visible ? "playVideo" : "pauseVideo";
    // the player needs a moment after the iframe loads, so retry a couple of times
    const timers = [0, 600, 1500].map((ms) => window.setTimeout(() => command(func), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [loaded, visible, command]);

  const src = mounted
    ? `https://www.youtube-nocookie.com/embed/${MARKETING_VIDEO_ID}?enablejsapi=1&mute=1&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=${MARKETING_VIDEO_ID}&origin=${encodeURIComponent(window.location.origin)}`
    : "";

  return (
    <section ref={sectionRef} aria-label="Mango video">
      <div
        className={`relative aspect-video w-full overflow-hidden rounded-3xl bg-[var(--mg-ink)] bg-cover bg-center ${lift}`}
        style={{ backgroundImage: `url(https://i.ytimg.com/vi/${MARKETING_VIDEO_ID}/hqdefault.jpg)` }}
      >
        {mounted && (
          <iframe
            ref={frameRef}
            src={src}
            title="Mango video"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
      </div>
    </section>
  );
}

/* ------------------------------ coupons (swipeable, centred card turns black) ------ */
function CouponCard({
  coupon, active, wide, copied, onCopy,
}: {
  coupon: MangoCoupon; active: boolean; wide: boolean; copied: boolean; onCopy: (code: string) => void;
}) {
  const m = monoClass;
  return (
    <li className={`shrink-0 snap-center ${wide ? "w-[78%]" : "w-full"}`}>
      <div
        className={`relative overflow-hidden rounded-3xl border transition-all duration-300 motion-reduce:transition-none ${
          active
            ? "scale-100 border-[var(--mg-ink)] bg-[var(--mg-ink)] text-white shadow-[0_14px_28px_-14px_rgba(26,26,26,0.7)]"
            : "scale-[0.97] border-black/5 bg-white text-[var(--mg-ink)] shadow-[0_8px_20px_-14px_rgba(26,26,26,0.35)]"
        }`}
      >
        <div className="p-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <p className="mg-display text-[26px] leading-none tracking-[0.01em]">{coupon.value}</p>
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors duration-300 ${
                active ? "bg-white/10 text-[var(--mg-sand)]" : "bg-[var(--mg-wash)] text-[var(--mg-brown)]"
              }`}
            >
              <Icon name="ticket" className="h-4 w-4" />
            </span>
          </div>
          <p className="mg-display mt-2.5 text-[12px] uppercase tracking-[0.06em]">{coupon.title}</p>
          <p className={`mt-1 text-[12px] leading-snug transition-colors duration-300 ${active ? "text-white/70" : "text-[var(--mg-brown)]"}`}>
            {coupon.description}
          </p>
        </div>

        {/* perforation with side notches */}
        <div className="relative">
          <span aria-hidden="true" className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-[var(--mg-canvas)]" />
          <span aria-hidden="true" className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-[var(--mg-canvas)]" />
          <div className={`border-t-2 border-dashed transition-colors duration-300 ${active ? "border-white/25" : "border-black/20"}`} />
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className={`${m} truncate text-[14px] font-bold tracking-[0.1em]`}>{coupon.code}</p>
            <p className={`mt-0.5 text-[10px] transition-colors duration-300 ${active ? "text-white/55" : "text-[var(--mg-brown)]"}`}>
              Valid till {coupon.validTill}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCopy(coupon.code)}
            aria-live="polite"
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] ${
              active ? "bg-white text-[var(--mg-ink)] active:bg-[var(--mg-sand)]" : "bg-[var(--mg-ink)] text-white active:bg-[var(--mg-brown)]"
            }`}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </li>
  );
}

function CouponsSection({ coupons }: { coupons: MangoCoupon[] }) {
  const [copied, setCopied] = useState("");
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef(0);
  const drag = useRef({ down: false, x: 0, left: 0, moved: false });
  const count = coupons.length;

  /* the card sitting in the middle strip of the track is the active one */
  useEffect(() => {
    const root = trackRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const items = Array.from(root.children);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const i = items.indexOf(e.target);
            if (i >= 0) {
              activeRef.current = i;
              setActive(i);
            }
          }
        });
      },
      { root, rootMargin: "0px -45% 0px -45%", threshold: 0 },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, [count]);

  const goTo = useCallback((i: number) => {
    const el = trackRef.current;
    const child = el?.children[i] as HTMLElement | undefined;
    if (!el || !child) return;
    el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.offsetWidth) / 2, behavior: "smooth" });
  }, []);

  /* mouse drag-to-scroll (touch screens scroll natively) */
  const onPointerDown = (e: ReactPointerEvent<HTMLUListElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = trackRef.current;
    if (!el) return;
    drag.current = { down: true, x: e.clientX, left: el.scrollLeft, moved: false };
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLUListElement>) => {
    const d = drag.current;
    const el = trackRef.current;
    if (!d.down || !el) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 5) d.moved = true;
    el.scrollLeft = d.left - dx;
  };
  const endDrag = () => {
    if (!drag.current.down) return;
    drag.current.down = false;
    setDragging(false);
    goTo(activeRef.current);
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      /* clipboard blocked: ignore */
    }
  };

  return (
    <section aria-label="Coupons">
      <div className="flex items-center justify-between gap-3">
        <h2 className="mg-display text-[18px] uppercase leading-none tracking-[0.05em] text-[var(--mg-ink)]">Coupons</h2>
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--mg-brown)] shadow-[0_4px_12px_-8px_rgba(26,26,26,0.4)]">
          {count} available
        </span>
      </div>

      {count === 0 ? (
        <div className="mt-3 flex flex-col items-center rounded-3xl border-2 border-dashed border-black/20 bg-white px-6 py-7 text-center">
          <Icon name="ticket" className="h-8 w-8 text-[var(--mg-brown)]" />
          <p className="mg-display mt-2 text-[15px] uppercase tracking-[0.05em] text-[var(--mg-ink)]">No coupons available</p>
          <p className="mt-1 text-[13px] text-[var(--mg-brown)]">Please check this section later.</p>
        </div>
      ) : (
        <>
          <ul
            ref={trackRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onPointerCancel={endDrag}
            onClickCapture={(e) => {
              if (drag.current.moved) {
                e.preventDefault();
                e.stopPropagation();
                drag.current.moved = false;
              }
            }}
            className={`relative -mx-4 mt-3 flex select-none gap-3 overflow-x-auto overscroll-x-contain px-4 pb-4 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              dragging ? "cursor-grabbing snap-none" : "cursor-grab snap-x snap-mandatory"
            }`}
          >
            {coupons.map((c, i) => (
              <CouponCard key={c.code} coupon={c} active={i === active} wide={count > 1} copied={copied === c.code} onCopy={copy} />
            ))}
          </ul>

          {count > 1 && (
            <div className="-mt-1 flex justify-center gap-0.5">
              {coupons.map((c, i) => (
                <button key={c.code} type="button" aria-label={`Show coupon ${i + 1} of ${count}`} aria-current={i === active ? "true" : undefined} onClick={() => goTo(i)} className="grid h-5 w-6 place-items-center">
                  <span className={`block h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-5 bg-[var(--mg-ink)]" : "w-1.5 bg-black/20"}`} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ------------------------------ Mango Club: compact tier card ---------------------- */
function TierCard({
  club, mobile, sectionRef,
}: {
  club: MangoClub; mobile: string; sectionRef: RefObject<HTMLElement | null>;
}) {
  const m = monoClass;
  const idx = Math.max(0, TIERS.findIndex((t) => t.name === club.tier));
  const tier = TIERS[idx];
  const next = TIERS[idx + 1];
  const toNext = club.pointsToNext ?? null;
  const total = toNext != null ? club.points + toNext : club.points;
  const pct = !next || toNext == null || total <= 0 ? 100 : Math.min(100, Math.round((club.points / total) * 100));
  /* nodes sit at 0%, 50%, 100%; the fill runs up to the current tier plus progress to the next */
  const fill = idx * 50 + (next ? pct / 2 : 0);

  return (
    <section ref={sectionRef} aria-label="Mango Club" className="scroll-mt-4">
      <div className="mg-sheen relative rounded-3xl bg-[var(--mg-ink)] p-4 text-white shadow-[0_18px_34px_-16px_rgba(26,26,26,0.7)]">
        <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full border-[18px] border-white/[0.06]" />
        <span aria-hidden="true" className="pointer-events-none absolute -right-1 top-16 h-12 w-12 rounded-full border-[7px] border-white/[0.06]" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mg-display text-[10px] uppercase tracking-[0.22em] text-white/55">
              Mango Club <span className={`${m} tracking-[0.14em]`}>· •••• {mobile.slice(-4)}</span>
            </p>
            <p className="mg-display mt-1.5 text-[36px] uppercase leading-none tracking-[0.04em]" style={foilText(tier.foil)}>
              {tier.name}
            </p>
          </div>
          <div className="text-right">
            <p className="mg-display text-[26px] leading-none tabular-nums">{club.points.toLocaleString("en-IN")}</p>
            <p className="mt-1 text-[11px] text-white/55">points</p>
          </div>
        </div>

        <p className="relative mt-4 text-[12px] leading-snug text-white/75">
          {next && toNext != null ? (
            <>
              <span className="mg-display tabular-nums text-white">{toNext.toLocaleString("en-IN")}</span> more points to{" "}
              <span className="mg-display text-white">{next.name}</span>
            </>
          ) : (
            "You are at the top tier"
          )}
        </p>

        <div className="relative mt-3 px-2">
          <div className="relative h-1.5 rounded-full bg-white/15">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fill}%`, background: tier.foil }} />
            {TIERS.map((t, i) => (
              <span
                key={t.name}
                aria-hidden="true"
                className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--mg-ink)] ${i <= idx ? "" : "bg-white/25"}`}
                style={{ left: `${i * 50}%`, ...(i <= idx ? { background: t.foil } : null) }}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 text-[10px] uppercase tracking-[0.1em]">
            {TIERS.map((t, i) => (
              <span
                key={t.name}
                className={`mg-display ${i === 0 ? "text-left" : i === 1 ? "text-center" : "text-right"} ${i === idx ? "text-white" : "text-white/45"}`}
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- profile ----------------------------------------- */
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];

function Toggle({ checked, onChange, disabled = false, label }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative h-7 w-[52px] shrink-0 rounded-full border-2 transition-colors motion-reduce:transition-none ${
        checked ? "border-[var(--mg-brown)] bg-[var(--mg-brown)]" : "border-[var(--mg-edge)] bg-white"
      } ${disabled ? "opacity-70" : ""} ${onPaper}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[3px] h-4 w-4 rounded-full transition-all motion-reduce:transition-none ${checked ? "left-[27px] bg-white" : "left-[3px] bg-[var(--mg-brown)]"}`}
      />
    </button>
  );
}

function ProfileCard({ data, onSave }: { data: MangoReceiptData; onSave?: (v: ProfileValues) => void }) {
  const [form, setForm] = useState<ProfileValues>({
    name: data.customer.name,
    email: data.customer.email,
    gender: "",
    birthday: "",
    anniversary: "",
    offers: false,
  });
  const [saved, setSaved] = useState(false);
  const [emailErr, setEmailErr] = useState("");
  const upd = <K extends keyof ProfileValues>(k: K, v: ProfileValues[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.email && !emailOk(form.email)) {
      setEmailErr("Enter a valid email address, like name@example.com.");
      return;
    }
    setEmailErr("");
    onSave?.(form);
    setSaved(true);
  };

  return (
    <section aria-label="Your profile" className={`rounded-3xl bg-white p-5 text-[var(--mg-brown)] ${lift}`}>
      <Heading sub="Faster service and personalised updates.">Your profile</Heading>
      <form onSubmit={submit} noValidate className="mt-5 space-y-5">
        <label className="block">
          <span className={fieldLabel}>Full name</span>
          <input className={fieldInput} value={form.name} onChange={(e) => upd("name", e.target.value)} autoComplete="name" />
        </label>

        <label className="block">
          <span className={fieldLabel}>Email address</span>
          <input
            type="email"
            className={fieldInput}
            value={form.email}
            onChange={(e) => {
              setEmailErr("");
              upd("email", e.target.value);
            }}
            autoComplete="email"
            aria-invalid={!!emailErr}
          />
          {emailErr && (
            <span role="alert" className="mt-1.5 block text-[13px] font-bold text-[var(--mg-ink)]">
              {emailErr}
            </span>
          )}
        </label>

        <div>
          <span className={fieldLabel}>Mobile number</span>
          <p className="text-base font-bold tabular-nums text-[var(--mg-ink)]">{data.customer.mobile}</p>
        </div>

        <fieldset>
          <legend className={`${fieldLabel} mb-2`}>Gender</legend>
          <div className="flex flex-wrap gap-2">
            {GENDERS.map((g) => {
              const on = form.gender === g;
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={on}
                  onClick={() => upd("gender", on ? "" : g)}
                  className={`rounded-full border-2 px-3.5 py-1.5 text-[14px] transition-colors motion-reduce:transition-none ${onPaper} ${
                    on
                      ? "border-[var(--mg-ink)] bg-[var(--mg-ink)] text-white"
                      : "border-[var(--mg-edge)] bg-white text-[var(--mg-brown-dark)] active:border-[var(--mg-ink)] [@media(hover:hover)]:hover:border-[var(--mg-ink)]"
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <label className="block min-w-0">
            <span className={fieldLabel}>Birthday</span>
            <input type="date" className={fieldInput} value={form.birthday} onChange={(e) => upd("birthday", e.target.value)} autoComplete="bday" />
            <span className="mt-1 block text-[12px]">For birthday offers</span>
          </label>
          <label className="block min-w-0">
            <span className={fieldLabel}>Anniversary</span>
            <input type="date" className={fieldInput} value={form.anniversary} onChange={(e) => upd("anniversary", e.target.value)} />
            <span className="mt-1 block text-[12px]">Optional</span>
          </label>
        </div>

        <fieldset>
          <legend className={`${fieldLabel} mb-1`}>Communication preferences</legend>
          <ul className="border-y-2 border-[var(--mg-ink)]">
            <li className="flex items-center justify-between gap-4 border-b border-dashed border-black/40 py-3.5">
              <div>
                <p className="text-[15px] font-bold text-[var(--mg-ink)]">Purchase and order updates</p>
                <p className="mt-0.5 text-[13px] leading-snug">Receipts and return confirmations. Always on.</p>
              </div>
              <Toggle checked disabled label="Purchase and order updates, always on" />
            </li>
            <li className="flex items-center justify-between gap-4 py-3.5">
              <div>
                <p className="text-[15px] font-bold text-[var(--mg-ink)]">New arrivals and offers</p>
                <p className="mt-0.5 text-[13px] leading-snug">Collections, member offers and seasonal edits.</p>
              </div>
              <Toggle checked={form.offers} onChange={(v) => upd("offers", v)} label="New arrivals and offers" />
            </li>
          </ul>
        </fieldset>

        <div>
          <button type="submit" className={solidBtn}>
            {saved ? (
              <>
                <Icon name="check" className="h-4 w-4" /> Details saved
              </>
            ) : (
              "Save details"
            )}
          </button>
          <p className="mt-3 text-center text-[12px] leading-relaxed">
            Your information is used only for purchase communication and personalisation. We never share your data with third parties.
          </p>
          <span className="sr-only" aria-live="polite">
            {saved ? "Details saved" : ""}
          </span>
        </div>
      </form>
    </section>
  );
}

/* ------------------------------ receipt view ------------------------------------- */
interface ReceiptViewProps extends Omit<MangoReceiptProps, "data" | "receipts" | "onSelectReceipt"> {
  data: MangoReceiptData;
  history: HistoryRow[];
  onSelect: (invoiceNo: string) => void;
}

function ReceiptView({
  data,
  history,
  onSelect,
  qrSrc,
  logoSrc = DEFAULT_MANGO_LOGO,
  rdepLogoSrc = DEFAULT_RDEP_LOGO,
  instagramUrl = DEFAULT_INSTAGRAM_URL,
  storeLocatorUrl = DEFAULT_STORE_LOCATOR_URL,
  onDownload,
  onSendEmail,
  onSaveProfile,
  onSubmitFeedback,
}: ReceiptViewProps) {
  const [openItem, setOpenItem] = useState(-1);
  const [modal, setModal] = useState<ModalId>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const closeModal = useCallback(() => setModal(null), []);
  const exchangeId = useId();
  const contactId = useId();
  const clubRef = useRef<HTMLElement>(null);
  const scale = useFitScale();
  const m = monoClass;
  const { store, exchange, club } = data;
  const t = useMemo(() => totalsOf(data), [data]);
  const firstName = data.customer.name.trim().split(/\s+/)[0] || data.customer.name;
  const tier = club ? TIERS.find((x) => x.name === club.tier) ?? TIERS[0] : null;
  const handleDownload = () => (onDownload ? onDownload(data) : downloadReceipt(data, logoSrc, rdepLogoSrc));

  return (
    <div style={theme} onTouchStart={() => {}} className="mg-root min-h-screen overflow-x-hidden bg-[#f1e7dc] text-[#211b19] antialiased [-webkit-text-size-adjust:100%] sm:py-8">
      <style>{FONT_FACES}{`
        .atelier-grain{background-image:radial-gradient(rgba(255,255,255,.12) .7px,transparent .7px);background-size:5px 5px}
        .atelier-serif{font-family:Georgia,'Times New Roman',serif}
        .atelier-card{box-shadow:0 12px 32px rgba(48,24,20,.08)}
        .atelier-label{font-size:10px;letter-spacing:.18em;text-transform:uppercase;font-weight:700}
        .atelier-cut{background-image:radial-gradient(circle at 0 50%,transparent 7px,#fff7ef 7.5px);background-size:14px 100%;background-repeat:repeat-x}
      `}</style>
      <main style={zoomStyle(scale)} className="mx-auto w-[400px] overflow-hidden bg-[#fff7ef] pb-8 sm:rounded-[30px] sm:shadow-[0_28px_80px_-28px_rgba(45,20,17,.35)]">
        {/* Editorial cover: oxblood, oversized type, acid-coral accent. */}
        <header className="relative overflow-hidden bg-[#551d2a] px-5 pb-6 pt-5 text-[#fff7ef]">
          <div aria-hidden="true" className="atelier-grain pointer-events-none absolute inset-0 opacity-40"/>
          <div aria-hidden="true" className="absolute -right-14 top-14 h-56 w-56 rounded-full border border-[#ffb69c]/30"/>
          <div aria-hidden="true" className="absolute -right-7 top-24 h-40 w-40 rounded-full border-[22px] border-[#ffb69c]/10"/>
          <div className="relative flex items-center justify-between gap-3">
            <BrandImage src={logoSrc} alt="MANGO" width={320} height={80} priority className="h-7 w-auto max-w-[46%] object-contain object-left brightness-0 invert" fallbackClassName="mg-display text-[24px] uppercase tracking-[.14em] text-white"/>
            <span className="rounded-full border border-[#ffb69c]/60 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.18em] text-[#ffb69c]">The style receipt</span>
          </div>
          <div className="relative mt-8">
            <p className="atelier-label text-[#ffb69c]">A little something, just for you</p>
            <h1 className="atelier-serif mt-2 text-[53px] leading-[.88] tracking-[-.055em]">{firstName}<span className="text-[#ff9c80]">.</span></h1>
            <div className="mt-5 flex items-end justify-between gap-4">
              <p className="max-w-[205px] text-[12px] leading-relaxed text-white/75">Good style stays with you.<br/>Thanks for making Mango part of yours.</p>
              <div className="text-right">
                <p className="atelier-label text-white/50">Purchase date</p>
                <p className={`${m} mt-1 text-[11px] text-white`}>{data.date.split(" ")[0]}</p>
              </div>
            </div>
          </div>
          {club && tier && <button type="button" onClick={() => clubRef.current?.scrollIntoView({behavior:"smooth",block:"start"})} className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-[#ffb69c] px-3 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#551d2a]"><Icon name="star" className="h-3.5 w-3.5"/>{club.tier} member <span aria-hidden="true">↗</span></button>}
        </header>

        {/* Bright fashion-campaign strip: expressive, but still restrained enough for a receipt. */}
        <div className="relative mx-4 -mt-1 flex items-center justify-between gap-3 bg-[#f5a58d] px-4 py-3 text-[#551d2a]">
          <div><p className="atelier-label">Your look. Your moment.</p><p className="atelier-serif mt-1 text-[19px] leading-none">Wear it your way.</p></div>
          <div aria-hidden="true" className="atelier-serif flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#551d2a]/50 text-[22px] italic">M.</div>
        </div>

        {/* Purchase value is intentionally high on the page. */}
        <section aria-label="Purchase total" className="px-4 pt-5">
          <div className="atelier-card overflow-hidden rounded-[24px] bg-[#efe4d8]">
            <div className="flex items-start justify-between gap-3 px-4 pb-4 pt-4">
              <div><p className="atelier-label text-[#8d6b60]">You paid</p><p className="atelier-serif mt-1 text-[39px] leading-none tracking-[-.04em] text-[#551d2a]">₹{inr(t.total)}</p>{t.discount>0 && <p className="mt-2 text-[11px] font-semibold text-[#8b443d]">You saved ₹{inr(t.discount)} today</p>}</div>
              <button type="button" onClick={() => setModal("qr")} className="flex flex-col items-center gap-1 rounded-2xl bg-[#fff7ef] p-2.5 text-[#551d2a]" aria-label="Open receipt QR code"><div className="h-12 w-12">{qrSrc ? <img src={qrSrc} alt="Receipt QR code" className="h-full w-full object-contain"/> : <PlaceholderQR seed={data.invoiceNo}/>}</div><span className="atelier-label text-[8px]">View QR</span></button>
            </div>
            <div className="grid grid-cols-2 border-t border-[#d8c2b4]">
              <div className="border-r border-[#d8c2b4] px-4 py-3"><p className="atelier-label text-[#8d6b60]">Invoice</p><p className={`${m} mt-1 text-[10px] font-semibold`}>{data.invoiceNo}</p></div>
              <div className="px-4 py-3"><p className="atelier-label text-[#8d6b60]">Items</p><p className={`${m} mt-1 text-[10px] font-semibold`}>{t.pieces} {t.pieces===1?"piece":"pieces"}</p></div>
            </div>
          </div>
        </section>

        {/* Receipt details, redesigned as a magazine-style invoice. */}
        <section aria-label="Purchase details" className="mx-4 mt-5 overflow-hidden rounded-[24px] bg-white atelier-card">
          <div className="bg-[#24201f] px-4 pb-4 pt-4 text-white">
            <div className="flex items-center justify-between"><p className="atelier-label text-[#ffb69c]">01 / The details</p><span className="atelier-serif text-[17px] italic">Mango</span></div>
            <h2 className="atelier-serif mt-2 text-[29px] leading-none">Your purchase.</h2>
            <p className={`${m} mt-2 text-[10px] text-white/55`}>{data.date} · {store.name}</p>
          </div>
          <div className="px-4 pb-4 pt-3">
            <div className="flex justify-between border-b border-dashed border-[#d8c2b4] pb-2 text-[9px] font-bold uppercase tracking-[.15em] text-[#8d6b60]"><span>Item / size</span><span>Amount</span></div>
            <ul aria-label="Items purchased">{data.items.map((item,i)=><PaperItem key={`${item.sku}-${i}`} item={item} open={openItem===i} onToggle={()=>setOpenItem(openItem===i?-1:i)}/>)}</ul>
            <dl className={`${m} mt-3 space-y-2 border-t border-[#e7d9cf] pt-3 text-[11px]`}>
              <Leader label="Subtotal (MRP)" value={`₹${inr(t.subtotal)}`}/>
              <Leader label="Discount" value={`− ₹${inr(t.discount)}`}/>
              <Leader label="SGST" value={`₹${inr(data.sgst)}`}/>
              <Leader label="CGST" value={`₹${inr(data.cgst)}`}/>
            </dl>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-[#f5a58d] px-3.5 py-3 text-[#551d2a]"><span className="atelier-label">Total paid</span><strong className="atelier-serif text-[25px] leading-none">₹{inr(t.total)}</strong></div>
            <div className="mt-3 rounded-xl border border-[#e7d9cf] px-3.5 py-3"><p className="atelier-label text-[#8d6b60]">Payment method</p><div className="mt-1 flex items-center justify-between gap-2 text-[11px]"><span>{data.payment.mode} · {data.payment.ref}</span><strong className={`${m} text-[10px]`}>₹{inr(t.total)}</strong></div></div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {([{icon:"history",label:"History",onClick:()=>setModal("history")},{icon:"mail",label:"Email",onClick:()=>setModal("email")},{icon:"download",label:"Save",onClick:handleDownload}] as {icon:IconName;label:string;onClick:()=>void}[]).map(a=><button key={a.label} type="button" onClick={a.onClick} className="flex flex-col items-center gap-1.5 rounded-xl border border-[#551d2a]/20 px-1 py-3 text-[9px] font-bold uppercase tracking-[.12em] text-[#551d2a] active:bg-[#f5a58d]"><Icon name={a.icon} className="h-4 w-4"/>{a.label}</button>)}
            </div>
          </div>
        </section>

        <div className="space-y-5 px-4 pt-6">
          <VideoCard/>
          {club && <CouponsSection coupons={club.coupons}/>}
          {club && <TierCard club={club} mobile={data.customer.mobile} sectionRef={clubRef}/>}
          <ProfileCard data={data} onSave={onSaveProfile}/>

          <section aria-label="Exchange policy" className="overflow-hidden rounded-[22px] border border-[#e3d0c3] bg-[#f5e9df]">
            <button type="button" aria-expanded={exchangeOpen} aria-controls={exchangeId} onClick={()=>setExchangeOpen(v=>!v)} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"><div><p className="atelier-label text-[#8d6b60]">Good to know</p><h2 className="atelier-serif mt-1 text-[23px] leading-none text-[#551d2a]">Exchange policy</h2><p className="mt-1 text-[11px] text-[#765c53]">Within {exchange.days} days of purchase</p></div><Icon name="chevron" className={`h-5 w-5 transition-transform ${exchangeOpen?"rotate-180":""}`}/></button>
            {exchangeOpen&&<div id={exchangeId} className="border-t border-[#ddc6b8] px-4 pb-4 pt-3"><ul className="space-y-2">{exchange.points.map((p,i)=><li key={i} className="flex gap-2 text-[12px] leading-relaxed text-[#634a42]"><span className="mt-0.5 text-[#a54e43]">✳</span><span>{p}</span></li>)}</ul></div>}
          </section>

          <section aria-label="Contact and store" className="rounded-[22px] bg-[#24201f] p-4 text-white">
            <p className="atelier-label text-[#ffb69c]">We’re here for you</p><h2 className="atelier-serif mt-1 text-[26px] leading-none">Need a hand?</h2>
            <button type="button" aria-expanded={contactOpen} aria-controls={contactId} onClick={()=>setContactOpen(v=>!v)} className="mt-4 flex w-full items-center justify-between border-t border-white/15 pt-3 text-left text-[12px]"><span>{store.name}</span><Icon name="chevron" className={`h-4 w-4 ${contactOpen?"rotate-180":""}`}/></button>
            <p className="mt-2 text-[11px] leading-relaxed text-white/65">{store.address}</p>
            <div className="mt-3 flex gap-2"><a href={`tel:${data.callTo}`} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#f5a58d] px-3 py-3 text-[11px] font-bold text-[#551d2a]"><Icon name="phone" className="h-4 w-4"/> Call store</a><a href={`mailto:${data.emailTo}`} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/25 px-3 py-3 text-[11px] font-bold text-white"><Icon name="mail" className="h-4 w-4"/> Email us</a></div>
            {contactOpen&&<div id={contactId} className="mt-3 space-y-1 border-t border-white/15 pt-3 text-[10px] text-white/65"><p>{store.phone} · {store.email}</p><p>GSTIN: {store.gstin}</p><p>{data.registeredOffice}</p><a className="mt-2 inline-flex items-center gap-1 text-[#ffb69c]" href={storeLocatorUrl} target="_blank" rel="noreferrer">Find Mango stores <Icon name="arrow" className="h-3 w-3"/></a></div>}
          </section>
          <div className="py-3 text-center">
            <p className="atelier-serif text-[30px] italic leading-none text-[#551d2a]">Wear it well.</p>
            <p className="mt-2 text-[10px] text-[#8d6b60]">Thank you for shopping at Mango.</p>
            <a href={instagramUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#551d2a]"><Icon name="instagram" className="h-4 w-4"/> Follow the style</a>
            <div className="mt-5 flex items-center justify-center gap-2 border-t border-[#e3d0c3] pt-4"><span className="text-[9px] uppercase tracking-[.18em] text-[#9a8177]">Powered by</span><BrandImage src={rdepLogoSrc} alt="RDEP" width={160} height={40} className="h-5 w-auto max-w-[90px] object-contain"/></div>
          </div>
        </div>
      </main>

      {modal==="history"&&<Modal title="Purchase history" onClose={closeModal} scale={scale}><ol className="space-y-2">{history.map(h=><li key={h.invoiceNo}><button type="button" onClick={()=>{closeModal();onSelect(h.invoiceNo)}} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left ${h.current?"border-[#551d2a] bg-[#f5e9df]":"border-black/10 bg-white"}`}><span><span className="block text-[12px] font-bold">{h.storeName}</span><span className={`${m} mt-1 block text-[10px] text-black/55`}>{h.date} · {h.items} item(s)</span></span><span className={`${m} text-[11px] font-bold`}>₹{inr(h.amount)}</span></button></li>)}</ol></Modal>}
      {modal==="qr"&&<Modal title="Receipt QR code" onClose={closeModal} scale={scale}><div className="flex flex-col items-center py-2 text-center"><div className="mb-4 flex h-48 w-48 items-center justify-center rounded-2xl border border-black/10 bg-white p-3">{qrSrc?<img src={qrSrc} alt="Receipt QR code" className="h-full w-full object-contain"/>:<PlaceholderQR seed={data.invoiceNo}/>}</div><p className="text-[13px] font-bold">Invoice #{data.invoiceNo}</p><p className="mt-1 text-[12px] text-black/60">Scan this code at the store counter for instant returns or inquiries.</p></div></Modal>}
      {modal==="email"&&<Modal title="Email this receipt" onClose={closeModal} scale={scale}><form className="space-y-4" noValidate onSubmit={e=>{e.preventDefault();if(!emailOk(email)){setEmailErr("Enter a valid email address.");return;}setEmailErr("");onSendEmail?.(email,data);setSentTo(email);}}><label className="block"><span className={fieldLabel}>Email address</span><input type="email" value={email} onChange={e=>{setSentTo("");setEmailErr("");setEmail(e.target.value);}} className={fieldInput} autoComplete="email" aria-invalid={!!emailErr}/>{emailErr&&<span role="alert" className="mt-1 block text-[12px] font-bold text-red-700">{emailErr}</span>}</label><button type="submit" className={solidBtn}>Send receipt</button><p aria-live="polite" className={sentTo?"text-center text-[12px] font-bold":"sr-only"}>{sentTo&&`Receipt sent to ${sentTo}`}</p></form></Modal>}
    </div>
  );
}

/* --------------------------------- main ------------------------------------------ */
export default function MangoReceipt({ data, receipts, onSelectReceipt, ...rest }: MangoReceiptProps) {
  const list = useMemo(() => {
    const base = receipts ?? (data ? [data] : sampleMangoReceipts);
    const merged = data && !base.some((r) => r.invoiceNo === data.invoiceNo) ? [data, ...base] : base;
    return [...merged].sort((a, b) => dateValue(b.date) - dateValue(a.date));
  }, [data, receipts]);

  const [currentId, setCurrentId] = useState(data?.invoiceNo ?? list[0].invoiceNo);
  const current = list.find((r) => r.invoiceNo === currentId) ?? list[0];

  const history = useMemo<HistoryRow[]>(
    () =>
      list.map((r) => {
        const t = totalsOf(r);
        return {
          invoiceNo: r.invoiceNo,
          date: r.date.split(" ")[0],
          storeName: r.store.name.replace(/^Mango\s*/i, ""),
          amount: t.total,
          items: t.pieces,
          current: r.invoiceNo === current.invoiceNo,
        };
      }),
    [list, current.invoiceNo],
  );

  const select = useCallback(
    (invoiceNo: string) => {
      setCurrentId(invoiceNo);
      onSelectReceipt?.(invoiceNo);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [onSelectReceipt],
  );

  return <ReceiptView key={current.invoiceNo} data={current} history={history} onSelect={select} {...rest} />;
}
