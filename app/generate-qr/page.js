export default function GenerateQrPage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Generate QR</h1>
      <p>
        หน้านี้เป็นจุดเริ่มต้นสำหรับสร้าง QR code ต่อโต๊ะ (ผูกกับ session ในตาราง{' '}
        <code>sessions</code>). ยังไม่ได้ใส่ logic จริง — ใช้สำหรับทดสอบว่า deploy
        สำเร็จ
      </p>
    </main>
  );
}
