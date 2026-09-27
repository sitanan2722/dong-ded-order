import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>ดองเด็ด</h1>
      <p>กุ้งดอง · แซลมอนดองสไตล์เกาหลี (คิดราคาต่อจาน)</p>

      <nav style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
        <Link href="/generate-qr">ไปหน้า Generate QR</Link>
        <Link href="/kitchen">ไปหน้าครัว (Kitchen)</Link>
      </nav>
    </main>
  );
}
