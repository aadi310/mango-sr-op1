"use client";

/**
 * Mango x RDEP — Smart receipt
 *
 * Concept: a poster on a light canvas. Logo + greeting, a "total paid" card, then the actual
 * receipt as torn thermal paper (mono lines, dotted leaders, [+] / [−] toggles). White cards with
 * soft shadows pop off the canvas; Mango brown is used for emphasis, black for the main actions.
 * After the receipt: rate your visit (stars flash until the first tap), profile, exchange,
 * "Reach us" and a Mango brand card for the store (brown header band, address always visible,
 * contact rows / associate / GSTIN copy expand). The page closes with a dark panel carrying a large
 * white Mango wordmark, a two-tone thank-you, the registered office, a back-to-top button and a
 * single "Powered by [RDEP]" line. Popups are rounded white sheets with a grab handle; the history
 * popup lists purchases as date tiles.
 *
 * Mango allows curves, so cards, buttons, chips and switches are rounded.
 *
 * Phone first: hover styles only apply on devices that can hover. On touch screens every button and
 * link dips slightly while pressed and uses `active:` colours instead.
 *
 * Fixed layout: designed at 400px wide. On phones (<= 520px) it is scaled with CSS `zoom` to fill
 * the screen, on larger screens it stays a centred 400px column, so it looks identical everywhere.
 *
 * Stars: nothing redirects. Tapping an overall star opens the detailed ratings (service, product,
 * sizes, value), the comment box and Submit, all in place.
 *
 * Colours (brand): background #F5F5F5, headings #1A1A1A, text #8B6F5E.
 *
 * FONTS (MangoSans, .ttf, already in /public/fonts)
 *   MangoSans Regular.ttf   (400)   <- the file name has a space; it is URL-encoded below.
 *   MangoSans-Bold.ttf      (700)      If you rename it to MangoSans-Regular.ttf, update FONT_FACES.
 *   No italics are used anywhere.
 *
 * ASSETS (in /public/images/design-mode)
 *   mango.png       the Mango logo
 *   RDEP-logo.png   the RDEP logo
 *
 * Stack: Next.js (app router) + Tailwind. No other dependencies.
 *
 * Usage:  app/mango-receipt/page.tsx
 *   import MangoReceipt from "@/components/MangoReceipt";
 *   export default function Page() { return <MangoReceipt />; }
 *
 * With real data: <MangoReceipt receipts={[...]} data={currentReceipt} />
 *   `receipts` = every receipt of this customer (the history popup is built from it).
 *   `data`     = the receipt to open first (defaults to the newest one in `receipts`).
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
  type ReactNode,
} from "react";
import Image from "next/image";
import { JetBrains_Mono } from "next/font/google";

/* Type system: MangoSans (Bold for headings and numbers, Regular for everything else).
 * The printed-receipt lines keep a monospace face; set USE_RECEIPT_MONO to false to print them
 * in MangoSans too.
 * MangoSans is a wide geometric face, so headings are kept at 18-24px and big numbers at 30-40px.
 * Body copy is 15px, captions 13px, receipt 12-13px. */
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

@media (prefers-reduced-motion:reduce){
  .mg-star-flash{animation:none}
  .mg-root a,.mg-root button:not(:disabled){transition:none}
  .mg-root a:active,.mg-root button:not(:disabled):active{transform:none}
}
`;

/* Brand tokens. Tints are variables (Tailwind cannot apply opacity modifiers to var() colours). */
const theme = {
  "--mg-brown": "#8B6F5E", // text, accents
  "--mg-brown-dark": "#6E5445", // hover / pressed, small captions on the canvas
  "--mg-ink": "#1A1A1A", // headings, outlines, main buttons
  "--mg-canvas": "#F5F5F5", // the receipt column background
  "--mg-page": "#E8E5E2", // page behind the column on desktop
  "--mg-wash": "#F3EEEA", // tiles and hovers inside white cards
  "--mg-line": "rgba(139,111,94,0.3)", // hairlines
  "--mg-edge": "rgba(139,111,94,0.75)", // input underlines
  "--mg-sand": "#D8C3B4", // light brown accent on dark panels
} as CSSProperties;

/* Assets + links */
const DEFAULT_MANGO_LOGO = "/images/design-mode/mango.png";
const DEFAULT_RDEP_LOGO = "/images/design-mode/RDEP-logo.png";
const DEFAULT_INSTAGRAM_URL = "https://www.instagram.com/mango/";
const DEFAULT_STORE_LOCATOR_URL = "https://shop.mango.com/in";

/* ------------------------------- types ------------------------------------------- */
export interface MangoItem {
  name: string;
  size: string;
  sku: string;
  hsn: string;
  qty: number;
  /** Unit price (MRP) */
  mrp: number;
  /** Total discount on this line */
  discount: number;
}

export interface MangoReceiptData {
  invoiceNo: string;
  /** "DD-MM-YYYY HH:mm:ss" — the date part is used to sort the history */
  date: string;
  customer: { name: string; mobile: string; email: string };
  items: MangoItem[];
  sgst: number;
  cgst: number;
  payment: { mode: string; ref: string };
  store: { name: string; address: string; email: string; phone: string; gstin: string; associate: string };
  registeredOffice: string;
  exchange: { days: number; points: string[] };
  /** Number opened by "Call us" */
  callTo: string;
  /** Address opened by "Email us" */
  emailTo: string;
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
  /** Receipt to open first. Defaults to the newest receipt in `receipts`. */
  data?: MangoReceiptData;
  /** All receipts of this customer. Drives the history popup; tapping a row opens that receipt. */
  receipts?: MangoReceiptData[];
  /** Real QR image URL (a placeholder is drawn if omitted) */
  qrSrc?: string;
  logoSrc?: string;
  rdepLogoSrc?: string;
  instagramUrl?: string;
  storeLocatorUrl?: string;
  /** Overrides the built-in download. Receives the receipt currently on screen. */
  onDownload?: (receipt: MangoReceiptData) => void;
  onSendEmail?: (email: string, receipt: MangoReceiptData) => void;
  onSaveProfile?: (values: ProfileValues) => void;
  onSubmitFeedback?: (values: FeedbackValues) => void;
  /** Fires when a receipt is opened from the history popup */
  onSelectReceipt?: (invoiceNo: string) => void;
}

type IconName = "history" | "mail" | "download" | "phone" | "instagram" | "pin" | "close" | "check" | "arrow";
type ModalId = "history" | "email" | null;

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

/** "14-07-2026 11:14:04" -> timestamp (date part only), used to sort the history newest first. */
function dateValue(d: string): number {
  const [dd, mm, yyyy] = d.split(" ")[0].split("-").map(Number);
  return Date.UTC(yyyy, (mm || 1) - 1, dd || 1);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "14-07-2026" -> { day: "14", mon: "Jul", year: "2026" } */
function splitDate(d: string) {
  const [dd, mm, yyyy] = d.split("-");
  return { day: dd, mon: MONTHS[Number(mm) - 1] ?? "", year: yyyy };
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

/** Standalone, print-ready HTML for one receipt. The "Save as PDF" button inside it opens the print dialog. */
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

/* ----------------------------------------------------------------------------------
 * Sample data (shape mirrors the current receipt). The first receipt is the real one; the other
 * two (and the exchange copy) are SAMPLE values. Replace with the real API response.
 * -------------------------------------------------------------------------------- */
/** 18% GST included in the price, split equally into SGST / CGST. */
const halfTax = (total: number): number => Math.floor(((total - total / 1.18) / 2) * 100) / 100;

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
  close: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="m5 12 5 5 9-10" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
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
const onDark = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Soft lift so white cards pop off the light canvas. */
const lift = "border border-black/5 shadow-[0_10px_28px_-14px_rgba(26,26,26,0.35)]";

/* Inputs use 16px text so iOS does not zoom the page on focus. */
const fieldInput =
  "w-full rounded-none border-0 border-b-2 border-[var(--mg-edge)] bg-transparent px-0 py-2.5 text-base text-[var(--mg-ink)] outline-none transition-colors [-webkit-appearance:none] [appearance:none] placeholder:text-[var(--mg-brown)] focus:border-[var(--mg-ink)]";
const fieldLabel = "mb-1 block text-[13px] text-[var(--mg-brown)]";
const solidBtn = `w-full rounded-xl bg-[var(--mg-ink)] py-4 text-[13px] font-bold uppercase tracking-[0.12em] text-white transition-colors active:bg-[var(--mg-brown)] [@media(hover:hover)]:hover:bg-[var(--mg-brown)] motion-reduce:transition-none ${onPaper}`;
const outlineBtn = `flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--mg-ink)] bg-white py-4 text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--mg-ink)] transition-colors active:border-[var(--mg-ink)] [@media(hover:hover)]:hover:border-[var(--mg-ink)] active:bg-[var(--mg-ink)] [@media(hover:hover)]:hover:bg-[var(--mg-ink)] active:text-white [@media(hover:hover)]:hover:text-white motion-reduce:transition-none ${onPaper}`;

/* ---------- fixed-width scaling ---------- */
const DESIGN_W = 400;
const PHONE_MAX = 520;
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** 1 on tablets/desktop (centred 400px column); viewport/400 on phones so the layout is identical. */
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

/** Logo image that falls back to a text wordmark instead of a broken-image icon. */
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

/** Label ...... value, like a printed receipt line. */
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

/** Height-animated disclosure body (respects reduced motion). Closed content is also hidden from
 *  keyboard and screen readers via `visibility`. */
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

/** Torn-paper edge (white teeth). Used on the receipt paper only. */
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

/** Heading with the short brown bar underneath. */
function Heading({ children, sub, size = 22 }: { children: ReactNode; sub?: string; size?: number }) {
  return (
    <div>
      <h2 className="mg-display uppercase leading-[1.1] tracking-[0.05em] text-[var(--mg-ink)]" style={{ fontSize: size }}>
        {children}
      </h2>
      <span aria-hidden="true" className="mt-3 block h-1 w-10 rounded-full bg-[var(--mg-brown)]" />
      {sub && <p className="mt-3 text-[15px] leading-snug text-[var(--mg-brown)]">{sub}</p>}
    </div>
  );
}

/** Popups are rounded white sheets with a grab handle. */
function Modal({
  title,
  subtitle,
  onClose,
  scale,
  children,
}: {
  title: string;
  subtitle?: string;
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
          <div className="px-5 pb-8 pt-3 text-[var(--mg-brown)]">
            <span aria-hidden="true" className="mx-auto mb-4 block h-1.5 w-12 rounded-full bg-[var(--mg-line)]" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id={titleId} className="mg-display text-[22px] uppercase leading-[1.1] tracking-[0.05em] text-[var(--mg-ink)]">
                  {title}
                </h2>
                {subtitle && <p className="mt-2 text-[14px] leading-snug">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--mg-wash)] text-[var(--mg-ink)] transition-colors active:bg-[var(--mg-ink)] active:text-white [@media(hover:hover)]:hover:bg-[var(--mg-ink)] [@media(hover:hover)]:hover:text-white motion-reduce:transition-none ${onPaper}`}
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

/* ------------------------------- star rating ------------------------------------- */
const RATING_WORDS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

function StarRow({
  value, onChange, label, size = "lg", pulse = false,
}: {
  value: number; onChange: (v: number) => void; label: string; size?: "lg" | "sm"; pulse?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const flashing = pulse && !hover && value === 0;
  return (
    <div role="radiogroup" aria-label={label} className={`flex ${size === "lg" ? "gap-1" : "gap-0"}`} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? "star" : "stars"}${size === "lg" ? `, ${RATING_WORDS[n - 1]}` : ""}`}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          className={`grid place-items-center rounded-lg ${size === "lg" ? "h-12 w-12" : "h-8 w-8"} ${onPaper}`}
        >
          <svg
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            strokeLinejoin="round"
            style={flashing ? { animationDelay: `${(n - 1) * 0.18}s` } : undefined}
            className={`${size === "lg" ? "h-9 w-9" : "h-6 w-6"} stroke-[var(--mg-brown)] transition-colors motion-reduce:transition-none ${
              n <= shown ? "fill-[var(--mg-brown)]" : "fill-[var(--mg-wash)]"
            } ${flashing ? "mg-star-flash" : ""}`}
          >
            <path d={STAR_PATH} />
          </svg>
        </button>
      ))}
    </div>
  );
}

const FEEDBACK_CATEGORIES = [
  { key: "service", label: "Service quality" },
  { key: "product", label: "Product offering" },
  { key: "sizes", label: "Sizes availability" },
  { key: "value", label: "Value for money" },
] as const;

function RateVisit({ data, onSubmit }: { data: MangoReceiptData; onSubmit?: (v: FeedbackValues) => void }) {
  const [overall, setOverall] = useState(0);
  const [cats, setCats] = useState({ service: 0, product: 0, sizes: 0, value: 0 });
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const panelId = useId();
  const commentId = useId();
  const m = monoClass;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.({ invoiceNo: data.invoiceNo, overall, categories: cats, comment: comment.trim() });
    setSubmitted(true);
  };

  return (
    <section aria-label="Rate your visit" className={`rounded-3xl bg-white p-5 text-[var(--mg-brown)] ${lift}`}>
      <Heading sub="How was your experience at Mango?">Rate your visit</Heading>

      {submitted ? (
        <div className="mt-6 flex items-start gap-4" aria-live="polite">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--mg-ink)] text-white">
            <Icon name="check" className="h-6 w-6" />
          </span>
          <div>
            <p className="mg-display text-[18px] uppercase leading-tight tracking-[0.05em] text-[var(--mg-ink)]">Thank you</p>
            <p className="mt-1.5 text-[15px] leading-snug">
              You rated this visit {overall} out of 5 ({RATING_WORDS[overall - 1].toLowerCase()}).
            </p>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className={`${m} mt-2 rounded py-1 text-[13px] font-semibold text-[var(--mg-ink)] underline underline-offset-4 active:no-underline [@media(hover:hover)]:hover:no-underline ${onPaper}`}
            >
              [ Edit feedback ]
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="mt-4 flex flex-col items-start">
            <div className="-ml-1.5">
              <StarRow value={overall} onChange={setOverall} label="Overall rating" pulse={overall === 0} />
            </div>
            <p aria-live="polite" className="mt-1 h-5 text-[15px]">
              {overall ? RATING_WORDS[overall - 1] : "Tap a star to rate"}
            </p>
          </div>

          <Collapse open={overall > 0} id={panelId}>
            <div className="pt-5">
              <ul className="border-t-2 border-[var(--mg-ink)]">
                {FEEDBACK_CATEGORIES.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-2 border-b border-dashed border-black/40 py-1.5">
                    <span className={`${m} text-[13px] uppercase text-[var(--mg-ink)]`}>{c.label}</span>
                    <div className="-mr-1">
                      <StarRow size="sm" label={c.label} value={cats[c.key]} onChange={(v) => setCats((p) => ({ ...p, [c.key]: v }))} />
                    </div>
                  </li>
                ))}
              </ul>

              <label htmlFor={commentId} className={`${fieldLabel} mt-5`}>
                Additional comments (optional)
              </label>
              <textarea
                id={commentId}
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What stood out, good or bad?"
                className={`${fieldInput} resize-none`}
              />
              <button type="submit" className={`${solidBtn} mt-5`}>
                Submit feedback
              </button>
              <p className="mt-3 text-center text-[13px]">Your feedback helps us improve every store.</p>
            </div>
          </Collapse>
        </form>
      )}
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
      <Heading sub="Save your details for faster service and personalised updates.">Your profile</Heading>
      <form onSubmit={submit} noValidate className="mt-6 space-y-6">
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
                  className={`rounded-full border-2 px-4 py-2 text-[14px] transition-colors motion-reduce:transition-none ${onPaper} ${
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

        <div className="grid grid-cols-2 gap-x-4 gap-y-6">
          <label className="block min-w-0">
            <span className={fieldLabel}>Birthday</span>
            <input type="date" className={fieldInput} value={form.birthday} onChange={(e) => upd("birthday", e.target.value)} autoComplete="bday" />
            <span className="mt-1.5 block text-[13px]">For birthday offers</span>
          </label>
          <label className="block min-w-0">
            <span className={fieldLabel}>Anniversary</span>
            <input type="date" className={fieldInput} value={form.anniversary} onChange={(e) => upd("anniversary", e.target.value)} />
            <span className="mt-1.5 block text-[13px]">Optional</span>
          </label>
        </div>

        <fieldset>
          <legend className={`${fieldLabel} mb-1`}>Communication preferences</legend>
          <ul className="border-y-2 border-[var(--mg-ink)]">
            <li className="flex items-center justify-between gap-4 border-b border-dashed border-black/40 py-4">
              <div>
                <p className="text-[15px] font-bold text-[var(--mg-ink)]">Purchase and order updates</p>
                <p className="mt-0.5 text-[14px] leading-snug">Receipts and return confirmations. Always on.</p>
              </div>
              <Toggle checked disabled label="Purchase and order updates, always on" />
            </li>
            <li className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="text-[15px] font-bold text-[var(--mg-ink)]">New arrivals and offers</p>
                <p className="mt-0.5 text-[14px] leading-snug">Collections, member offers and seasonal edits.</p>
              </div>
              <Toggle checked={form.offers} onChange={(v) => upd("offers", v)} label="New arrivals and offers" />
            </li>
          </ul>
        </fieldset>

        <button type="submit" className={solidBtn}>
          Save details
        </button>
        <p aria-live="polite" className="flex min-h-5 items-center justify-center gap-1.5 text-center text-sm font-bold text-[var(--mg-ink)]">
          {saved && (
            <>
              <Icon name="check" className="h-4 w-4 text-[var(--mg-brown)]" /> Details saved
            </>
          )}
        </p>
        <p className="text-center text-[13px] leading-relaxed">
          Your information is used only for purchase communication and personalisation. We never share your data with third parties.
        </p>
      </form>
    </section>
  );
}

/* ------------------------------ receipt view ------------------------------------- */
interface ReceiptViewProps extends Omit<MangoReceiptProps, "data" | "receipts" | "onSelectReceipt"> {
  data: MangoReceiptData;
  history: { invoiceNo: string; date: string; amount: number; items: number; current: boolean }[];
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
  const [storeOpen, setStoreOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [copied, setCopied] = useState(false);
  const closeModal = useCallback(() => setModal(null), []);
  const exchangeId = useId();
  const storeId = useId();
  const scale = useFitScale();
  const m = monoClass;

  const { store, exchange } = data;
  const t = useMemo(() => totalsOf(data), [data]);
  const firstName = data.customer.name.trim().split(/\s+/)[0] || data.customer.name;
  /* MangoSans is wide: ~0.72em per uppercase character. Fits ~180px next to the logo. */
  const nameSize = Math.min(30, Math.max(18, Math.floor(180 / (0.72 * (firstName.length + 1)))));
  const handleDownload = () => (onDownload ? onDownload(data) : downloadReceipt(data, logoSrc, rdepLogoSrc));

  const copyGstin = async () => {
    try {
      await navigator.clipboard.writeText(store.gstin);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: ignore */
    }
  };

  return (
    <div
      style={theme}
      onTouchStart={() => {}} /* lets :active press states fire on iOS Safari */
      className="mg-root min-h-screen overflow-x-hidden bg-[var(--mg-page)] text-[var(--mg-brown)] antialiased [-webkit-text-size-adjust:100%] sm:py-8"
    >
      <style>{FONT_FACES}</style>

      <main
        style={zoomStyle(scale)}
        className="mx-auto w-[400px] overflow-hidden bg-[var(--mg-canvas)] pb-0 sm:rounded-3xl sm:shadow-[0_24px_60px_-24px_rgba(26,26,26,0.3)]"
      >
        {/* ---------- Compact hero: logo left, greeting right ---------- */}
        <header className="flex items-center justify-between gap-4 px-5 pb-7 pt-6">
          <BrandImage
            src={logoSrc}
            alt="MANGO"
            width={320}
            height={80}
            priority
            className="h-9 w-auto max-w-[46%] shrink-0 object-contain object-left"
            fallbackClassName="mg-display inline-block text-[26px] uppercase leading-none tracking-[0.12em] text-[var(--mg-ink)]"
          />
          <h1 className="min-w-0 text-right uppercase">
            <span className="mg-display block text-[12px] leading-none tracking-[0.2em] text-[var(--mg-brown-dark)]">Thank you</span>
            <span
              className="mg-display mt-1.5 block leading-[1.05] tracking-[0.02em] text-[var(--mg-ink)] [overflow-wrap:anywhere]"
              style={{ fontSize: nameSize }}
            >
              {firstName}
            </span>
          </h1>
        </header>

        {/* ---------- Total paid card ---------- */}
        <div className="px-4">
          <section aria-label="Total paid" className={`rounded-3xl bg-white p-5 text-[var(--mg-ink)] ${lift}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] text-[var(--mg-brown)]">Total paid</p>
                <p className="mg-display mt-1.5 text-[34px] leading-none tabular-nums">₹{inr(t.total)}</p>
              </div>
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-black/15">
                {qrSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrSrc} alt="Receipt QR code" className="h-full w-full object-contain" />
                ) : (
                  <PlaceholderQR seed={data.invoiceNo} />
                )}
              </div>
            </div>
            <dl className={`${m} mt-5 space-y-1.5 border-t border-dashed border-black/40 pt-4 text-xs text-[var(--mg-brown)]`}>
              <Leader label="Invoice no" value={data.invoiceNo} strong />
              <Leader label="Date" value={data.date} strong />
            </dl>
          </section>
        </div>

        {/* ---------- The receipt: thermal paper ---------- */}
        <section
          aria-label="Purchase summary"
          className="mx-3 mt-8 text-[var(--mg-brown)]"
          style={{ filter: "drop-shadow(0 12px 14px rgba(26,26,26,0.16))" }}
        >
          <ZigZag />
          <div className="bg-white px-5 pb-6 pt-4">
            <h2 className="mg-display text-[22px] uppercase leading-[1.1] tracking-[0.05em] text-[var(--mg-ink)]">Purchase summary</h2>
            <p className={`${m} mt-2 text-xs`}>
              {t.pieces} {t.pieces === 1 ? "item" : "items"}
            </p>

            <div className={`${m} mt-4 flex justify-between border-y-2 border-[var(--mg-ink)] py-2 text-xs font-semibold uppercase tracking-wide text-[var(--mg-ink)]`}>
              <span>Item name</span>
              <span>Net amount</span>
            </div>
            <ul aria-label="Items purchased">
              {data.items.map((item, i) => (
                <PaperItem key={`${item.sku}-${i}`} item={item} open={openItem === i} onToggle={() => setOpenItem(openItem === i ? -1 : i)} />
              ))}
            </ul>

            {/* totals */}
            <dl className={`${m} space-y-2 border-t-2 border-[var(--mg-ink)] pt-3.5 text-sm`}>
              <Leader label="Subtotal (MRP)" value={`₹${inr(t.subtotal)}`} strong />
              <Leader label="Discount" value={`− ₹${inr(t.discount)}`} strong />
              <Leader label="SGST" value={`₹${inr(data.sgst)}`} strong />
              <Leader label="CGST" value={`₹${inr(data.cgst)}`} strong />
            </dl>

            <div className="mt-3.5 border-y-2 border-[var(--mg-ink)] py-3.5">
              <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                <span className="mg-display text-[15px] uppercase leading-none tracking-[0.06em] text-[var(--mg-ink)]">Total paid</span>
                <span className="mg-display text-[30px] leading-none tabular-nums text-[var(--mg-brown)]">₹{inr(t.total)}</span>
              </div>
            </div>

            {/* payment */}
            <h3 className="mg-display mt-5 text-[15px] uppercase leading-none tracking-[0.06em] text-[var(--mg-ink)]">Payment method</h3>
            <div className={`${m} mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-[var(--mg-ink)] px-4 py-3.5 text-white`}>
              <span className="text-sm">
                {data.payment.mode} &ndash; {data.payment.ref}
              </span>
              <span className="text-base font-bold tabular-nums">₹{inr(t.total)}</span>
            </div>

            {/* actions */}
            <div className="mt-6 grid grid-cols-3 gap-2">
              {(
                [
                  { icon: "history", label: "History", onClick: () => setModal("history") },
                  { icon: "mail", label: "Email", onClick: () => setModal("email") },
                  { icon: "download", label: "Download", onClick: handleDownload },
                ] as { icon: IconName; label: string; onClick: () => void }[]
              ).map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 border-[var(--mg-ink)] px-1 py-3.5 text-center text-[11px] font-bold uppercase leading-tight tracking-[0.08em] text-[var(--mg-ink)] transition-colors active:bg-[var(--mg-ink)] [@media(hover:hover)]:hover:bg-[var(--mg-ink)] active:text-white [@media(hover:hover)]:hover:text-white motion-reduce:transition-none ${onPaper}`}
                >
                  <Icon name={a.icon} className="h-5 w-5" />
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <ZigZag down />
        </section>

        {/* ---------- After the receipt ---------- */}
        <div className="space-y-7 px-4 pt-8">
          <RateVisit data={data} onSubmit={onSubmitFeedback} />

          <ProfileCard data={data} onSave={onSaveProfile} />

          {/* Exchange */}
          <section aria-label="Exchange" className={`rounded-3xl bg-white text-[var(--mg-brown)] ${lift}`}>
            <h2>
              <button
                type="button"
                onClick={() => setExchangeOpen((o) => !o)}
                aria-expanded={exchangeOpen}
                aria-controls={exchangeId}
                className={`flex w-full items-center justify-between gap-4 rounded-3xl p-5 text-left active:bg-[var(--mg-wash)] ${onPaper}`}
              >
                <span>
                  <span className="mg-display block text-[22px] uppercase leading-[1.1] tracking-[0.05em] text-[var(--mg-ink)]">Exchange</span>
                  <span className="mt-2 block text-[15px] font-normal">{exchange.days}-day exchange policy</span>
                </span>
                <span aria-hidden="true" className={`${m} text-sm font-bold text-[var(--mg-ink)]`}>
                  [{exchangeOpen ? "−" : "+"}]
                </span>
              </button>
            </h2>
            <Collapse open={exchangeOpen} id={exchangeId}>
              <ol className={`${m} list-decimal space-y-2.5 border-t border-dashed border-black/40 py-5 pl-10 pr-5 text-xs leading-relaxed`}>
                {exchange.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            </Collapse>
          </section>

          {/* Reach us */}
          <section aria-label="Reach us">
            <h2 className="mg-display text-[22px] uppercase leading-[1.1] tracking-[0.05em] text-[var(--mg-ink)]">Reach us</h2>
            <p className="mt-2 text-[15px] text-[var(--mg-brown-dark)]">Get in touch or find us online.</p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className={`${outlineBtn} flex-col gap-1.5 !px-1 !py-3.5 !text-[11px]`}>
                <Icon name="instagram" className="h-[18px] w-[18px]" />
                Instagram
              </a>
              <a href={`tel:${data.callTo}`} className={`${outlineBtn} flex-col gap-1.5 !px-1 !py-3.5 !text-[11px]`}>
                <Icon name="phone" className="h-[18px] w-[18px]" />
                Call us
              </a>
              <a href={`mailto:${data.emailTo}`} className={`${outlineBtn} flex-col gap-1.5 !px-1 !py-3.5 !text-[11px]`}>
                <Icon name="mail" className="h-[18px] w-[18px]" />
                Email us
              </a>
            </div>

            <a
              href={storeLocatorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`group mt-3 flex items-center justify-between gap-4 rounded-3xl bg-[var(--mg-ink)] p-5 text-white shadow-[0_14px_28px_-14px_rgba(26,26,26,0.7)] transition-colors active:bg-white [@media(hover:hover)]:hover:bg-white active:text-[var(--mg-ink)] [@media(hover:hover)]:hover:text-[var(--mg-ink)] motion-reduce:transition-none ${onDark}`}
            >
              <span>
                <span className="mg-display block text-[18px] uppercase leading-[1.15] tracking-[0.05em]">Find a MANGO store</span>
                <span className="mt-2 block text-[14px] leading-snug">Locate your nearest store in India</span>
              </span>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[var(--mg-ink)] transition-colors group-active:bg-[var(--mg-ink)] [@media(hover:hover)]:group-hover:bg-[var(--mg-ink)] group-active:text-white [@media(hover:hover)]:group-hover:text-white motion-reduce:transition-none">
                <Icon name="arrow" className="h-5 w-5" />
              </span>
            </a>
          </section>

          {/* ---------- Store: brand card ---------- */}
          <section aria-label="Store" className={`overflow-hidden rounded-3xl bg-white ${lift}`}>
            <div className="relative overflow-hidden bg-[var(--mg-brown)] px-5 pb-5 pt-5 text-white">
              <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border-[16px] border-white/10" />
              <span aria-hidden="true" className="pointer-events-none absolute -right-2 top-10 h-14 w-14 rounded-full border-[8px] border-white/10" />
              <p className="mg-display text-[11px] uppercase tracking-[0.22em] text-white/75">Bought at</p>
              <h2 className="mg-display relative mt-2 max-w-[85%] text-[22px] uppercase leading-[1.1] tracking-[0.04em]">{store.name}</h2>
            </div>

            <div className="p-5 text-[var(--mg-ink)]">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--mg-wash)] text-[var(--mg-brown)]">
                  <Icon name="pin" className="h-[18px] w-[18px]" />
                </span>
                <p className="pt-1.5 text-[15px] font-bold leading-snug">{store.address}</p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name}, ${store.address}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${outlineBtn} !py-3 !text-[12px]`}
                >
                  <Icon name="pin" className="h-4 w-4" />
                  Directions
                </a>
                <a href={`tel:${store.phone}`} className={`${outlineBtn} !py-3 !text-[12px]`}>
                  <Icon name="phone" className="h-4 w-4" />
                  Call store
                </a>
              </div>

              <button
                type="button"
                onClick={() => setStoreOpen((o) => !o)}
                aria-expanded={storeOpen}
                aria-controls={storeId}
                className={`mt-4 flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left ${onPaper} ${
                  storeOpen ? "bg-[var(--mg-ink)] text-white" : "bg-[var(--mg-wash)] text-[var(--mg-ink)] active:bg-[#E9DFD7]"
                }`}
              >
                <span className="mg-display text-[13px] uppercase tracking-[0.08em]">
                  {storeOpen ? "Hide store details" : "Contact and store details"}
                </span>
                <span
                  aria-hidden="true"
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${storeOpen ? "bg-white text-[var(--mg-ink)]" : "bg-[var(--mg-ink)] text-white"}`}
                >
                  <Icon name="close" className={`h-3.5 w-3.5 transition-transform duration-300 motion-reduce:transition-none ${storeOpen ? "rotate-0" : "rotate-45"}`} />
                </span>
              </button>

              <Collapse open={storeOpen} id={storeId}>
                <ul className="space-y-2 pt-3">
                  {(
                    [
                      { icon: "mail", label: "Email", value: store.email, href: `mailto:${store.email}` },
                      { icon: "phone", label: "Phone", value: store.phone, href: `tel:${store.phone}` },
                    ] as { icon: IconName; label: string; value: string; href: string }[]
                  ).map((r) => (
                    <li key={r.label}>
                      <a
                        href={r.href}
                        className={`flex items-center gap-3 rounded-2xl bg-[var(--mg-wash)] p-3 active:bg-[#E9DFD7] [@media(hover:hover)]:hover:bg-[#E9DFD7] ${onPaper}`}
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[var(--mg-brown)]">
                          <Icon name={r.icon} className="h-[18px] w-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] text-[var(--mg-brown)]">{r.label}</span>
                          <span className={`${m} mt-0.5 block truncate text-[13px] font-bold text-[var(--mg-ink)]`}>{r.value}</span>
                        </span>
                        <Icon name="arrow" className="h-4 w-4 shrink-0 text-[var(--mg-brown)]" />
                      </a>
                    </li>
                  ))}

                  <li className="flex items-center gap-3 rounded-2xl bg-[var(--mg-wash)] p-3">
                    <span className="mg-display grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--mg-ink)] text-[16px] uppercase text-white">
                      {store.associate.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] text-[var(--mg-brown)]">Sales associate</span>
                      <span className="mg-display mt-0.5 block text-[15px] text-[var(--mg-ink)]">{store.associate}</span>
                    </span>
                  </li>

                  <li className="flex items-center gap-3 rounded-2xl bg-[var(--mg-wash)] p-3">
                    <span className="min-w-0 flex-1 pl-1">
                      <span className="block text-[12px] text-[var(--mg-brown)]">GSTIN</span>
                      <span className={`${m} mt-0.5 block break-all text-[13px] font-bold text-[var(--mg-ink)]`}>{store.gstin}</span>
                    </span>
                    <button
                      type="button"
                      onClick={copyGstin}
                      aria-live="polite"
                      className={`shrink-0 rounded-full border-2 border-[var(--mg-ink)] bg-white px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--mg-ink)] active:bg-[var(--mg-ink)] active:text-white ${onPaper}`}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </li>
                </ul>
              </Collapse>
            </div>
          </section>
        </div>

        {/* ---------- Closing panel ---------- */}
        <footer className="relative mt-10 overflow-hidden rounded-t-[40px] bg-[var(--mg-ink)] px-6 pb-10 pt-11 text-white">
          <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full border-[26px]" style={{ borderColor: "rgba(139,111,94,0.35)" }} />
          <span aria-hidden="true" className="pointer-events-none absolute -right-3 top-24 h-20 w-20 rounded-full border-[10px]" style={{ borderColor: "rgba(139,111,94,0.35)" }} />

          <div className="relative">
            <BrandImage
              src={logoSrc}
              alt="MANGO"
              width={320}
              height={80}
              className="h-12 w-auto max-w-full object-contain object-left brightness-0 invert"
              fallbackClassName="mg-display inline-block text-[40px] uppercase leading-none tracking-[0.14em] text-white"
            />

            <h2 className="mg-display mt-8 text-[24px] uppercase leading-[1.1] tracking-[0.04em]">
              Thank you
              <span className="block text-[var(--mg-sand)]">for shopping with us</span>
            </h2>
            <p className="mt-3 text-[14px] text-white/70">See you in store soon.</p>

            <div className="mt-8 flex items-center justify-between gap-4">
              <p className={`${m} text-[11px] leading-relaxed text-white/60`}>
                Invoice {data.invoiceNo}
                <br />
                {data.date.split(" ")[0]}
              </p>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                aria-label="Back to top"
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[var(--mg-ink)] active:bg-[var(--mg-sand)] ${onDark}`}
              >
                <Icon name="arrow" className="h-5 w-5 -rotate-90" />
              </button>
            </div>

            <div className="mt-7 rounded-2xl border border-white/15 bg-white/5 p-4">
              <h3 className="mg-display text-[11px] uppercase tracking-[0.2em] text-[var(--mg-sand)]">Registered office</h3>
              <p className={`${m} mt-2 text-xs leading-relaxed text-white/75`}>{data.registeredOffice}</p>
            </div>

            <div className="mt-8 flex items-center justify-center gap-2.5 border-t border-white/15 pt-7 text-[13px] text-white/70">
              <span>Powered by</span>
              <span className="inline-flex items-center rounded-full bg-white px-3.5 py-1.5">
                <BrandImage
                  src={rdepLogoSrc}
                  alt="rdep"
                  width={240}
                  height={80}
                  className="h-5 w-auto"
                  fallbackClassName="text-base font-bold tracking-tight text-[var(--mg-ink)]"
                />
              </span>
            </div>
          </div>
        </footer>
      </main>

      {/* ---------------------------- Popups: rounded sheets ---------------------------- */}
      {modal === "history" && (
        <Modal
          title="Your purchases"
          subtitle={`${history.length} ${history.length === 1 ? "receipt" : "receipts"} · ₹${inr(history.reduce((a, h) => a + h.amount, 0))} spent`}
          onClose={closeModal}
          scale={scale}
        >
          <ol className="space-y-3">
            {history.map((h) => {
              const d = splitDate(h.date);
              return (
                <li key={h.invoiceNo}>
                  <button
                    type="button"
                    disabled={h.current}
                    onClick={() => {
                      closeModal();
                      onSelect(h.invoiceNo);
                    }}
                    className={`flex w-full items-center gap-3.5 rounded-2xl p-3 text-left transition-colors motion-reduce:transition-none ${onPaper} ${
                      h.current
                        ? "cursor-default bg-[var(--mg-ink)] text-white"
                        : "bg-[var(--mg-wash)] text-[var(--mg-ink)] active:bg-[#E9DFD7] [@media(hover:hover)]:hover:bg-[#E9DFD7]"
                    }`}
                  >
                    <span className="grid h-[68px] w-[60px] shrink-0 place-items-center rounded-xl bg-white text-center leading-none text-[var(--mg-ink)]">
                      <span>
                        <span className="mg-display block text-[24px]">{d.day}</span>
                        <span className="mg-display mt-1.5 block text-[11px] uppercase tracking-[0.14em] text-[var(--mg-brown)]">{d.mon}</span>
                        <span className="mt-0.5 block text-[10px] text-[var(--mg-brown)]">{d.year}</span>
                      </span>
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="mg-display block text-[13px] uppercase tracking-[0.06em]">
                        {h.items} {h.items === 1 ? "item" : "items"}
                      </span>
                      <span className={`${m} mt-1.5 block truncate text-[11px] ${h.current ? "text-white/70" : "text-[var(--mg-brown)]"}`}>
                        No. {h.invoiceNo}
                      </span>
                    </span>

                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className={`${m} text-[15px] font-bold tabular-nums`}>₹{inr(h.amount)}</span>
                      {h.current ? (
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-[var(--mg-ink)]">Viewing</span>
                      ) : (
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--mg-ink)] text-white">
                          <Icon name="arrow" className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Modal>
      )}

      {modal === "email" && (
        <Modal title="Email this receipt" onClose={closeModal} scale={scale}>
          <form
            className="space-y-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!emailOk(email)) {
                setEmailErr("Enter a valid email address, like name@example.com.");
                return;
              }
              setEmailErr("");
              onSendEmail?.(email, data);
              setSentTo(email);
            }}
          >
            <label className="block">
              <span className={fieldLabel}>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setSentTo("");
                  setEmailErr("");
                  setEmail(e.target.value);
                }}
                className={fieldInput}
                autoComplete="email"
                aria-invalid={!!emailErr}
              />
              {emailErr && (
                <span role="alert" className="mt-1.5 block text-[13px] font-bold text-[var(--mg-ink)]">
                  {emailErr}
                </span>
              )}
            </label>
            <button type="submit" className={solidBtn}>
              Send receipt
            </button>
            <p aria-live="polite" className="flex min-h-5 items-center justify-center gap-1.5 text-sm font-bold text-[var(--mg-ink)]">
              {sentTo && (
                <>
                  <Icon name="check" className="h-4 w-4 text-[var(--mg-brown)]" /> Receipt sent to {sentTo}
                </>
              )}
            </p>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* --------------------------------- main ------------------------------------------ */
/** Holds which receipt is open. Each receipt is a keyed ReceiptView, so switching resets the
 *  open item, popups, ratings and forms instead of carrying them over from the previous receipt. */
export default function MangoReceipt({ data, receipts, onSelectReceipt, ...rest }: MangoReceiptProps) {
  const list = useMemo(() => {
    const base = receipts ?? (data ? [data] : sampleMangoReceipts);
    const merged = data && !base.some((r) => r.invoiceNo === data.invoiceNo) ? [data, ...base] : base;
    return [...merged].sort((a, b) => dateValue(b.date) - dateValue(a.date));
  }, [data, receipts]);

  const [currentId, setCurrentId] = useState(data?.invoiceNo ?? list[0].invoiceNo);
  const current = list.find((r) => r.invoiceNo === currentId) ?? list[0];

  const history = useMemo(
    () =>
      list.map((r) => {
        const t = totalsOf(r);
        return { invoiceNo: r.invoiceNo, date: r.date.split(" ")[0], amount: t.total, items: t.pieces, current: r.invoiceNo === current.invoiceNo };
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
