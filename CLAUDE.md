# ดองเด็ด — Project Notes

ระบบสั่งอาหารร้าน "ดองเด็ด" (กุ้งดอง, แซลมอนดองสไตล์เกาหลี) — Next.js App Router
(JavaScript) + Supabase, deploy บน Vercel

## Stack
- Next.js (App Router, JavaScript — ไม่ใช่ TypeScript)
- Supabase (Postgres + client library `@supabase/supabase-js`)
- Deploy target: Vercel

## Environment Variables
ตั้งค่าทั้งใน `.env.local` (local dev) และใน Vercel Project Settings → Environment
Variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

ดู `.env.local.example` เป็นแม่แบบ

## Database Schema (มีอยู่แล้วใน Supabase — ห้ามสร้างใหม่)
โครงสร้างนี้มีอยู่แล้วในโปรเจกต์ Supabase จริง ให้ใช้อ้างอิงเวลาเขียน query/insert
ในทุกฟีเจอร์ของโปรเจกต์นี้ ไม่ต้องสร้างตารางใหม่หรือ migration ใด ๆ เว้นแต่จะถูกขอ
โดยตรง:

- **sessions**: `id`, `table_number`, `guest_count`, `status`, `created_at`
- **menu_categories**: `id`, `name`, `sort_order`
- **menu_items**: `id`, `category_id`, `name`, `price`
- **orders**: `id`, `session_id`, `table_number`, `items` (jsonb array — แต่ละ
  รายการมี `name`, `price`, `quantity`), `status`, `created_at`

## กฎสำคัญ: ราคาคิดต่อจาน ไม่ใช่ต่อหัวลูกค้า
ร้านนี้ขายเป็นรายจาน (กุ้งดอง/แซลมอนดอง คิดราคาต่อจานที่สั่ง) **ไม่มีสูตรคงที่
ต่อหัวลูกค้า**. ทุกหน้าหรือฟังก์ชันที่คำนวณยอดเงินของ session ใด ๆ (หน้าครัว, ใบเช็ก
บิล, สรุปยอด, ฯลฯ) ต้องคำนวณโดย:

```js
// ยอดรวมของ session = ผลรวมของ (price × quantity) ของทุก item
// ในทุก order ที่อยู่ใน session นั้น
const sessionTotal = orders
  .flatMap((order) => order.items)
  .reduce((sum, item) => sum + item.price * item.quantity, 0);
```

`guest_count` ใน `sessions` ใช้เพื่อแสดงจำนวนลูกค้าเท่านั้น **ห้ามนำมาคูณกับราคา
หรือใช้เป็นตัวหารในการคำนวณยอดเงินเด็ดขาด**.

## หมายเหตุสำคัญ: Dynamic Route params เป็น Promise
โปรเจกต์นี้ใช้ Next.js เวอร์ชันล่าสุด ซึ่ง `params` (และ `searchParams`) ใน Dynamic
Route ของ App Router ถูกเปลี่ยนเป็น **Promise** แล้ว ต้อง unwrap ด้วย `use()` จาก
React เสมอ (หรือ `await` ถ้าอยู่ใน Server Component ที่เป็น async function)

ตัวอย่างที่ถูกต้อง (Client Component):

```jsx
'use client';
import { use } from 'react';

export default function TablePage({ params }) {
  const { tableId } = use(params);
  // ...
}
```

ตัวอย่างที่ถูกต้อง (Server Component):

```jsx
export default async function TablePage({ params }) {
  const { tableId } = await params;
  // ...
}
```

**ห้าม** เข้าถึง `params.tableId` ตรง ๆ แบบ synchronous เหมือน Next.js เวอร์ชันเก่า
เพราะจะ error หรือ warning เวลา build/run บน Vercel

## โครงสร้างไฟล์ปัจจุบัน
- `app/page.js` — หน้าแรก แสดงชื่อร้านและลิงก์ทดสอบ
- `app/generate-qr/page.js` — placeholder หน้าสร้าง QR ต่อโต๊ะ
- `app/kitchen/page.js` — placeholder หน้าแสดงออเดอร์ในครัว
- `lib/supabaseClient.js` — Supabase client จาก env vars

## Next Steps (ยังไม่ได้ทำ)
- เขียน query จริงเชื่อม `menu_categories` / `menu_items` สำหรับหน้าเมนูลูกค้า
- เขียน insert เข้า `orders` เวลาลูกค้าสั่งอาหาร
- ทำหน้า kitchen ให้ subscribe realtime จาก Supabase
- ทำหน้า generate-qr ให้สร้าง session จริงและ QR code ต่อโต๊ะ
