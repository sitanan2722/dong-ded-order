'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// STEP states: 'form' | 'existing-open' | 'confirm-close' | 'qr'

export default function GenerateQrPage() {
  const [step, setStep] = useState('form');
  const [tableNumber, setTableNumber] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  // Existing open session found for this table
  const [existingSession, setExistingSession] = useState(null);

  // Newly created session (for QR display)
  const [newSession, setNewSession] = useState(null);

  const resetForm = () => {
    setStep('form');
    setTableNumber('');
    setGuestCount('');
    setErrorMsg('');
    setExistingSession(null);
    setNewSession(null);
    setCopied(false);
  };

  const handleOpenTable = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const tableNum = parseInt(tableNumber, 10);
    const guests = parseInt(guestCount, 10);

    if (!tableNum || tableNum <= 0) {
      setErrorMsg('กรุณากรอกเลขโต๊ะให้ถูกต้อง');
      return;
    }
    if (!guests || guests <= 0) {
      setErrorMsg('กรุณากรอกจำนวนลูกค้าให้ถูกต้อง');
      return;
    }

    setLoading(true);

    // 1) Check if this table already has an open session
    const { data: existingRows, error: checkError } = await supabase
      .from('sessions')
      .select('id, guest_count, created_at')
      .eq('table_number', tableNum)
      .eq('status', 'open')
      .limit(1);

    if (checkError) {
      setLoading(false);
      setErrorMsg('เกิดข้อผิดพลาดในการตรวจสอบโต๊ะ: ' + checkError.message);
      return;
    }

    if (existingRows && existingRows.length > 0) {
      // Table already occupied — show warning instead of creating a new row
      setExistingSession({ ...existingRows[0], table_number: tableNum });
      setLoading(false);
      setStep('existing-open');
      return;
    }

    // 2) No open session — insert a new one
    const { data: insertedRows, error: insertError } = await supabase
      .from('sessions')
      .insert([{ table_number: tableNum, guest_count: guests, status: 'open' }])
      .select('id, table_number, guest_count, created_at');

    setLoading(false);

    if (insertError) {
      setErrorMsg('เปิดโต๊ะไม่สำเร็จ: ' + insertError.message);
      return;
    }

    const created = insertedRows && insertedRows[0];
    setNewSession(created);
    setStep('qr');
  };

  const handleConfirmClose = async () => {
    if (!existingSession) return;
    setLoading(true);
    setErrorMsg('');

    // Guard: only close if it's still 'open' (prevents double-close race conditions)
    const { data: updatedRows, error: updateError } = await supabase
      .from('sessions')
      .update({ status: 'closed' })
      .eq('id', existingSession.id)
      .eq('status', 'open')
      .select('id');

    setLoading(false);

    if (updateError) {
      setErrorMsg('ปิดโต๊ะเดิมไม่สำเร็จ: ' + updateError.message);
      return;
    }

    if (!updatedRows || updatedRows.length === 0) {
      // Someone else already closed/changed it in the meantime
      setErrorMsg('โต๊ะนี้ถูกปิดไปแล้ว หรือมีการเปลี่ยนแปลงสถานะ กรุณาลองใหม่');
      setStep('form');
      setExistingSession(null);
      return;
    }

    // Go back to the form with the same table/guest values still filled in,
    // ready for the staff member to press "เปิดโต๊ะ" again.
    setStep('form');
    setExistingSession(null);
  };

  const minutesOpen = (createdAt) => {
    if (!createdAt) return 0;
    const diffMs = Date.now() - new Date(createdAt).getTime();
    return Math.max(0, Math.round(diffMs / 60000));
  };

  const buildOrderUrl = (tableNum) => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/order/${tableNum}`;
  };

  const handleCopyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMsg('คัดลอกลิงก์ไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง');
    }
  };

  return (
    <main style={styles.page}>
      <h1 style={styles.heading}>เปิดโต๊ะ — ดองเด็ด</h1>

      {step === 'form' && (
        <form onSubmit={handleOpenTable} style={styles.form}>
          <label style={styles.label}>
            เลขโต๊ะ
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              style={styles.input}
              placeholder="เช่น 4"
              disabled={loading}
            />
          </label>

          <label style={styles.label}>
            จำนวนลูกค้า
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              style={styles.input}
              placeholder="เช่น 2"
              disabled={loading}
            />
            <span style={styles.hint}>ไว้อ้างอิงเฉย ๆ ไม่ใช้คิดราคา</span>
          </label>

          {errorMsg && <div style={styles.errorText}>{errorMsg}</div>}

          <button type="submit" style={styles.primaryButton} disabled={loading}>
            {loading ? 'กำลังตรวจสอบ...' : 'เปิดโต๊ะ'}
          </button>
        </form>
      )}

      {step === 'existing-open' && existingSession && (
        <div style={styles.warningBox}>
          <div style={styles.warningTitle}>⚠️ โต๊ะนี้มีลูกค้าอยู่ระหว่างทานอาหาร</div>
          <p style={styles.warningText}>กรุณาปิดออเดอร์เดิมก่อน</p>

          <div style={styles.warningDetails}>
            <div>โต๊ะ {existingSession.table_number}</div>
            <div>ลูกค้า {existingSession.guest_count} ท่าน</div>
            <div>เปิดมาแล้ว {minutesOpen(existingSession.created_at)} นาที</div>
          </div>

          {errorMsg && <div style={styles.errorText}>{errorMsg}</div>}

          <div style={styles.buttonRow}>
            <button
              style={styles.secondaryButton}
              onClick={resetForm}
              disabled={loading}
            >
              ยกเลิก
            </button>
            <button
              style={styles.dangerButton}
              onClick={() => setStep('confirm-close')}
              disabled={loading}
            >
              ปิดออเดอร์เดิม
            </button>
          </div>
        </div>
      )}

      {step === 'confirm-close' && existingSession && (
        <div style={styles.warningBox}>
          <div style={styles.warningTitle}>ยืนยันปิดโต๊ะเดิม?</div>

          <div style={styles.warningDetails}>
            <div>โต๊ะ {existingSession.table_number}</div>
            <div>ลูกค้า {existingSession.guest_count} ท่าน</div>
            <div>เปิดมาแล้ว {minutesOpen(existingSession.created_at)} นาที</div>
          </div>

          {errorMsg && <div style={styles.errorText}>{errorMsg}</div>}

          <div style={styles.buttonRow}>
            <button
              style={styles.secondaryButton}
              onClick={() => setStep('existing-open')}
              disabled={loading}
            >
              ยกเลิก
            </button>
            <button
              style={styles.dangerButton}
              onClick={handleConfirmClose}
              disabled={loading}
            >
              {loading ? 'กำลังปิด...' : 'ยืนยันปิดโต๊ะเดิม'}
            </button>
          </div>
        </div>
      )}

      {step === 'qr' && newSession && (
        <div style={styles.qrBox}>
          {(() => {
            const orderUrl = buildOrderUrl(newSession.table_number);
            const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
              orderUrl
            )}`;
            return (
              <>
                <img
                  src={qrImgUrl}
                  alt={`QR code สำหรับโต๊ะ ${newSession.table_number}`}
                  width={300}
                  height={300}
                  style={styles.qrImage}
                />
                <div style={styles.qrCaption}>
                  โต๊ะ {newSession.table_number} · ลูกค้า {newSession.guest_count} ท่าน
                </div>
                <div style={styles.qrLinkText}>{orderUrl}</div>

                <div style={styles.buttonRow}>
                  <button
                    style={styles.secondaryButton}
                    onClick={() => handleCopyLink(orderUrl)}
                  >
                    {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
                  </button>
                  <button style={styles.primaryButton} onClick={resetForm}>
                    เปิดโต๊ะใหม่
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </main>
  );
}

const styles = {
  page: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '2rem 1.5rem',
    fontFamily: 'sans-serif',
  },
  heading: {
    fontSize: '2rem',
    marginBottom: '1.5rem',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    fontSize: '1.25rem',
    fontWeight: 'bold',
  },
  input: {
    fontSize: '1.5rem',
    padding: '0.75rem 1rem',
    borderRadius: 8,
    border: '2px solid #ccc',
  },
  hint: {
    fontSize: '0.95rem',
    fontWeight: 'normal',
    color: '#666',
  },
  primaryButton: {
    fontSize: '1.4rem',
    fontWeight: 'bold',
    padding: '1rem',
    borderRadius: 10,
    border: 'none',
    backgroundColor: '#16a34a',
    color: '#fff',
    cursor: 'pointer',
  },
  secondaryButton: {
    fontSize: '1.2rem',
    fontWeight: 'bold',
    padding: '0.9rem 1.2rem',
    borderRadius: 10,
    border: '2px solid #999',
    backgroundColor: '#fff',
    color: '#333',
    cursor: 'pointer',
    flex: 1,
  },
  dangerButton: {
    fontSize: '1.2rem',
    fontWeight: 'bold',
    padding: '0.9rem 1.2rem',
    borderRadius: 10,
    border: 'none',
    backgroundColor: '#dc2626',
    color: '#fff',
    cursor: 'pointer',
    flex: 1,
  },
  buttonRow: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1.5rem',
  },
  errorText: {
    color: '#dc2626',
    fontWeight: 'bold',
    fontSize: '1.05rem',
  },
  warningBox: {
    backgroundColor: '#fff3e0',
    border: '3px solid #f97316',
    borderRadius: 14,
    padding: '1.5rem',
    marginTop: '1rem',
  },
  warningTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#c2410c',
    marginBottom: '0.5rem',
  },
  warningText: {
    fontSize: '1.15rem',
    color: '#9a3412',
    marginBottom: '1rem',
  },
  warningDetails: {
    fontSize: '1.3rem',
    fontWeight: 'bold',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    backgroundColor: '#ffffffaa',
    borderRadius: 8,
    padding: '1rem',
  },
  qrBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    marginTop: '1rem',
  },
  qrImage: {
    border: '2px solid #eee',
    borderRadius: 12,
  },
  qrCaption: {
    fontSize: '1.6rem',
    fontWeight: 'bold',
  },
  qrLinkText: {
    fontSize: '1rem',
    color: '#555',
    wordBreak: 'break-all',
    textAlign: 'center',
  },
};
