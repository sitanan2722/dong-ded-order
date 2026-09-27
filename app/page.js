import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={styles.page}>
      <div style={styles.heroWrap}>
        <img
          src="/hero.jpg"
          alt="ดองเด็ด — ตำนานความอร่อย ดองแท้ ซีอิ๊วชั้นดี"
          style={styles.heroImage}
        />
      </div>

      <div style={styles.linkSection}>
        <Link href="/generate-qr" style={styles.linkCard}>
          <span style={styles.linkIcon}>📋</span>
          <span style={styles.linkText}>เปิดโต๊ะ (พนักงานหน้าร้าน)</span>
        </Link>
        <Link href="/kitchen" style={styles.linkCard}>
          <span style={styles.linkIcon}>🍳</span>
          <span style={styles.linkText}>สเตชันจัดเตรียม (ครัว)</span>
        </Link>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    fontFamily: 'sans-serif',
    backgroundColor: '#fafafa',
  },
  heroWrap: {
    width: '100%',
    lineHeight: 0,
  },
  heroImage: {
    width: '100%',
    height: 'auto',
    display: 'block',
    objectFit: 'cover',
  },
  linkSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    maxWidth: 480,
    margin: '0 auto',
    padding: '1.5rem 1.25rem 2.5rem',
  },
  linkCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.85rem',
    fontSize: '1.25rem',
    fontWeight: 'bold',
    padding: '1.1rem 1.3rem',
    borderRadius: 14,
    backgroundColor: '#fff',
    border: '2px solid #eee',
    color: '#111827',
    textDecoration: 'none',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  linkIcon: {
    fontSize: '1.6rem',
  },
  linkText: {
    flex: 1,
  },
};
