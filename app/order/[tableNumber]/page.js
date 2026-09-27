'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

// PAGE STATUS: 'checking' | 'no-session' | 'ordering' | 'closed'

export default function OrderPage({ params }) {
  // Next.js (latest): params is a Promise — must unwrap with use()
  const { tableNumber } = use(params);
  const tableNum = parseInt(tableNumber, 10);

  const [status, setStatus] = useState('checking');
  const [session, setSession] = useState(null);

  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [menuError, setMenuError] = useState('');

  // qty picker per menu item id, before adding to cart (1-5)
  const [qtyPicker, setQtyPicker] = useState({});

  // cart: { [menuItemId]: { id, name, price, quantity } }
  const [cart, setCart] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showSentToast, setShowSentToast] = useState(false);

  const [billOpen, setBillOpen] = useState(false);
  const [billLoading, setBillLoading] = useState(false);
  const [billError, setBillError] = useState('');
  const [billSummary, setBillSummary] = useState(null); // { lines: [...], total }
  const [closing, setClosing] = useState(false);

  const [finalTotal, setFinalTotal] = useState(0);

  // 1) Check for an open session on this table
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      if (!tableNum || tableNum <= 0) {
        setStatus('no-session');
        return;
      }

      const { data, error } = await supabase
        .from('sessions')
        .select('id, table_number, guest_count')
        .eq('table_number', tableNum)
        .eq('status', 'open')
        .limit(1);

      if (cancelled) return;

      if (error || !data || data.length === 0) {
        setStatus('no-session');
        return;
      }

      setSession(data[0]);
      setStatus('ordering');
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [tableNum]);

  // 2) Load menu once we know the session is open
  useEffect(() => {
    if (status !== 'ordering') return;
    let cancelled = false;

    async function loadMenu() {
      setMenuError('');
      const [catRes, itemRes] = await Promise.all([
        supabase
          .from('menu_categories')
          .select('id, name, sort_order')
          .order('sort_order', { ascending: true }),
        supabase.from('menu_items').select('id, category_id, name, price'),
      ]);

      if (cancelled) return;

      if (catRes.error || itemRes.error) {
        setMenuError('โหลดเมนูไม่สำเร็จ กรุณาลองรีเฟรชหน้านี้');
        return;
      }

      setCategories(catRes.data || []);
      setMenuItems(itemRes.data || []);
      if (catRes.data && catRes.data.length > 0) {
        setActiveCategoryId(catRes.data[0].id);
      }
    }

    loadMenu();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const itemsInActiveCategory = useMemo(
    () => menuItems.filter((item) => item.category_id === activeCategoryId),
    [menuItems, activeCategoryId]
  );

  const cartList = useMemo(() => Object.values(cart), [cart]);
  const cartCount = cartList.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = cartList.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const getQty = (itemId) => qtyPicker[itemId] || 1;

  const changeQtyPicker = (itemId, delta) => {
    setQtyPicker((prev) => {
      const current = prev[itemId] || 1;
      const next = Math.min(5, Math.max(1, current + delta));
      return { ...prev, [itemId]: next };
    });
  };

  const addToCart = (item) => {
    const qty = getQty(item.id);
    setCart((prev) => {
      const existing = prev[item.id];
      const newQuantity = existing ? existing.quantity + qty : qty;
      return {
        ...prev,
        [item.id]: {
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: newQuantity,
        },
      };
    });
    setQtyPicker((prev) => ({ ...prev, [item.id]: 1 }));
  };

  const removeFromCart = (itemId) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const changeCartQty = (itemId, delta) => {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      const newQuantity = existing.quantity + delta;
      if (newQuantity <= 0) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: { ...existing, quantity: newQuantity } };
    });
  };

  const handleSubmitOrder = async () => {
    if (cartList.length === 0 || !session) return;
    setSubmitting(true);
    setSubmitError('');

    const orderItems = cartList.map((i) => ({
      name: i.name,
      price: i.price,
      quantity: i.quantity,
    }));

    const { error } = await supabase.from('orders').insert([
      {
        session_id: session.id,
        table_number: session.table_number,
        items: orderItems,
        status: 'received',
      },
    ]);

    setSubmitting(false);

    if (error) {
      setSubmitError('ส่งออเดอร์ไม่สำเร็จ: ' + error.message);
      return;
    }

    setCart({});
    setCartOpen(false);
    setShowSentToast(true);
    setTimeout(() => setShowSentToast(false), 2500);
  };

  const handleRequestBill = async () => {
    if (!session) return;
    setBillOpen(true);
    setBillLoading(true);
    setBillError('');
    setBillSummary(null);

    const { data, error } = await supabase
      .from('orders')
      .select('items')
      .eq('session_id', session.id);

    setBillLoading(false);

    if (error) {
      setBillError('ดึงยอดไม่สำเร็จ: ' + error.message);
      return;
    }

    // Aggregate every item across every order, combining by name
    const combined = {};
    (data || []).forEach((order) => {
      (order.items || []).forEach((item) => {
        const key = item.name;
        if (!combined[key]) {
          combined[key] = { name: item.name, price: item.price, quantity: 0 };
        }
        combined[key].quantity += item.quantity;
      });
    });

    const lines = Object.values(combined).map((l) => ({
      ...l,
      subtotal: l.price * l.quantity,
    }));
    const total = lines.reduce((sum, l) => sum + l.subtotal, 0);

    setBillSummary({ lines, total });
  };

  const handleConfirmClose = async () => {
    if (!session || !billSummary) return;
    setClosing(true);
    setBillError('');

    const { data: updatedRows, error } = await supabase
      .from('sessions')
      .update({ status: 'closed' })
      .eq('id', session.id)
      .eq('status', 'open')
      .select('id');

    setClosing(false);

    if (error) {
      setBillError('ปิดบิลไม่สำเร็จ: ' + error.message);
      return;
    }

    if (!updatedRows || updatedRows.length === 0) {
      setBillError('บิลนี้ถูกปิดไปแล้ว');
      return;
    }

    setFinalTotal(billSummary.total);
    setBillOpen(false);
    setStatus('closed');
  };

  // ---------- RENDER STATES ----------

  if (status === 'checking') {
    return (
      <main style={styles.centerScreen}>
        <div style={styles.centerText}>กำลังตรวจสอบโต๊ะ...</div>
      </main>
    );
  }

  if (status === 'no-session') {
    return (
      <main style={styles.centerScreen}>
        <div style={styles.bigIcon}>🚫</div>
        <div style={styles.centerTitle}>โต๊ะนี้ยังไม่เปิดใช้งาน</div>
        <div style={styles.centerText}>กรุณาแจ้งพนักงาน</div>
      </main>
    );
  }

  if (status === 'closed') {
    return (
      <main style={styles.centerScreen}>
        <div style={styles.bigIcon}>🙏</div>
        <div style={styles.centerTitle}>ขอบคุณที่ใช้บริการ</div>
        <div style={styles.finalTotalText}>
          ยอดที่ชำระ ฿{finalTotal.toLocaleString()}
        </div>
      </main>
    );
  }

  // status === 'ordering'
  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.tableTitle}>โต๊ะ {session.table_number}</div>
        <button style={styles.billButton} onClick={handleRequestBill}>
          เรียกเก็บเงิน
        </button>
      </header>

      {menuError && <div style={styles.errorBanner}>{menuError}</div>}

      <div style={styles.tabRow}>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategoryId(cat.id)}
            style={{
              ...styles.tabButton,
              ...(cat.id === activeCategoryId ? styles.tabButtonActive : {}),
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div style={styles.menuList}>
        {itemsInActiveCategory.map((item) => (
          <div key={item.id} style={styles.menuCard}>
            <div style={styles.menuCardInfo}>
              <div style={styles.menuItemName}>{item.name}</div>
              <div style={styles.menuItemPrice}>฿{item.price}</div>
            </div>
            <div style={styles.menuCardActions}>
              <div style={styles.qtyStepper}>
                <button
                  style={styles.qtyBtn}
                  onClick={() => changeQtyPicker(item.id, -1)}
                >
                  −
                </button>
                <span style={styles.qtyValue}>{getQty(item.id)}</span>
                <button
                  style={styles.qtyBtn}
                  onClick={() => changeQtyPicker(item.id, 1)}
                >
                  +
                </button>
              </div>
              <button
                style={styles.addButton}
                onClick={() => addToCart(item)}
              >
                เพิ่มลงตะกร้า
              </button>
            </div>
          </div>
        ))}
        {itemsInActiveCategory.length === 0 && !menuError && (
          <div style={styles.centerText}>ไม่มีเมนูในหมวดนี้</div>
        )}
        {/* spacing so content isn't hidden behind the floating cart bar */}
        <div style={{ height: 100 }} />
      </div>

      {cartCount > 0 && (
        <button style={styles.floatingCart} onClick={() => setCartOpen(true)}>
          🛒 {cartCount} รายการ · ฿{cartTotal.toLocaleString()}
        </button>
      )}

      {showSentToast && (
        <div style={styles.toast}>ส่งออเดอร์แล้ว ✓ สั่งรอบต่อไปได้เลย</div>
      )}

      {cartOpen && (
        <div style={styles.modalOverlay} onClick={() => setCartOpen(false)}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>ตะกร้าของคุณ</div>

            {cartList.length === 0 && (
              <div style={styles.centerText}>ยังไม่มีรายการในตะกร้า</div>
            )}

            <div style={styles.cartItemList}>
              {cartList.map((item) => (
                <div key={item.id} style={styles.cartItemRow}>
                  <div style={styles.cartItemInfo}>
                    <div style={styles.menuItemName}>{item.name}</div>
                    <div style={styles.menuItemPrice}>
                      ฿{item.price} × {item.quantity} = ฿
                      {(item.price * item.quantity).toLocaleString()}
                    </div>
                  </div>
                  <div style={styles.qtyStepper}>
                    <button
                      style={styles.qtyBtn}
                      onClick={() => changeCartQty(item.id, -1)}
                    >
                      −
                    </button>
                    <span style={styles.qtyValue}>{item.quantity}</span>
                    <button
                      style={styles.qtyBtn}
                      onClick={() => changeCartQty(item.id, 1)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    style={styles.removeButton}
                    onClick={() => removeFromCart(item.id)}
                  >
                    ลบ
                  </button>
                </div>
              ))}
            </div>

            {cartList.length > 0 && (
              <>
                <div style={styles.cartTotalRow}>
                  <span>ยอดรวม</span>
                  <span>฿{cartTotal.toLocaleString()}</span>
                </div>

                {submitError && (
                  <div style={styles.errorText}>{submitError}</div>
                )}

                <div style={styles.modalButtonRow}>
                  <button
                    style={styles.secondaryButton}
                    onClick={() => setCartOpen(false)}
                    disabled={submitting}
                  >
                    สั่งเพิ่ม
                  </button>
                  <button
                    style={styles.primaryButton}
                    onClick={handleSubmitOrder}
                    disabled={submitting}
                  >
                    {submitting ? 'กำลังส่ง...' : 'ส่งออเดอร์'}
                  </button>
                </div>
              </>
            )}

            {cartList.length === 0 && (
              <button
                style={styles.secondaryButton}
                onClick={() => setCartOpen(false)}
              >
                ปิด
              </button>
            )}
          </div>
        </div>
      )}

      {billOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalSheet}>
            <div style={styles.modalTitle}>สรุปยอดโต๊ะ {session.table_number}</div>

            {billLoading && <div style={styles.centerText}>กำลังคำนวณยอด...</div>}
            {billError && <div style={styles.errorText}>{billError}</div>}

            {billSummary && (
              <>
                <div style={styles.cartItemList}>
                  {billSummary.lines.map((line) => (
                    <div key={line.name} style={styles.billLineRow}>
                      <div>
                        {line.name} × {line.quantity}
                      </div>
                      <div>฿{line.subtotal.toLocaleString()}</div>
                    </div>
                  ))}
                  {billSummary.lines.length === 0 && (
                    <div style={styles.centerText}>ยังไม่มีออเดอร์ในโต๊ะนี้</div>
                  )}
                </div>

                <div style={styles.cartTotalRow}>
                  <span>ยอดรวมทั้งหมด</span>
                  <span>฿{billSummary.total.toLocaleString()}</span>
                </div>

                <div style={styles.modalButtonRow}>
                  <button
                    style={styles.secondaryButton}
                    onClick={() => setBillOpen(false)}
                    disabled={closing}
                  >
                    ยกเลิก
                  </button>
                  <button
                    style={styles.dangerButton}
                    onClick={handleConfirmClose}
                    disabled={closing || billSummary.lines.length === 0}
                  >
                    {closing ? 'กำลังปิดบิล...' : 'ยืนยันปิดบิล'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    fontFamily: 'sans-serif',
    backgroundColor: '#fafafa',
    paddingBottom: '1rem',
  },
  centerScreen: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '2rem',
    fontFamily: 'sans-serif',
  },
  bigIcon: { fontSize: '3.5rem', marginBottom: '1rem' },
  centerTitle: { fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '0.5rem' },
  centerText: { fontSize: '1.2rem', color: '#555', padding: '1rem 0' },
  finalTotalText: { fontSize: '1.6rem', fontWeight: 'bold', color: '#16a34a' },

  header: {
    position: 'sticky',
    top: 0,
    zIndex: 5,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.25rem',
    backgroundColor: '#fff',
    borderBottom: '1px solid #eee',
  },
  tableTitle: { fontSize: '1.6rem', fontWeight: 'bold' },
  billButton: {
    fontSize: '1rem',
    fontWeight: 'bold',
    padding: '0.6rem 1rem',
    borderRadius: 999,
    border: '2px solid #dc2626',
    backgroundColor: '#fff',
    color: '#dc2626',
  },

  errorBanner: {
    margin: '1rem 1.25rem',
    padding: '0.75rem 1rem',
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    borderRadius: 8,
    fontWeight: 'bold',
  },

  tabRow: {
    display: 'flex',
    gap: '0.6rem',
    overflowX: 'auto',
    padding: '1rem 1.25rem 0.5rem',
    WebkitOverflowScrolling: 'touch',
  },
  tabButton: {
    flexShrink: 0,
    fontSize: '1.05rem',
    fontWeight: 'bold',
    padding: '0.6rem 1.1rem',
    borderRadius: 999,
    border: '2px solid #ddd',
    backgroundColor: '#fff',
    color: '#333',
    whiteSpace: 'nowrap',
  },
  tabButtonActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
    color: '#fff',
  },

  menuList: {
    padding: '0.5rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
  },
  menuCard: {
    backgroundColor: '#fff',
    border: '1px solid #eee',
    borderRadius: 14,
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  menuCardInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  menuItemName: { fontSize: '1.15rem', fontWeight: 'bold' },
  menuItemPrice: { fontSize: '1.15rem', fontWeight: 'bold', color: '#16a34a' },
  menuCardActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.75rem',
  },
  qtyStepper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    border: '2px solid #ddd',
    borderRadius: 10,
    padding: '0.25rem 0.5rem',
  },
  qtyBtn: {
    fontSize: '1.4rem',
    fontWeight: 'bold',
    width: 40,
    height: 40,
    borderRadius: 8,
    border: 'none',
    backgroundColor: '#f3f4f6',
    color: '#333',
  },
  qtyValue: {
    fontSize: '1.2rem',
    fontWeight: 'bold',
    minWidth: 24,
    textAlign: 'center',
  },
  addButton: {
    flex: 1,
    fontSize: '1.05rem',
    fontWeight: 'bold',
    padding: '0.75rem',
    borderRadius: 10,
    border: 'none',
    backgroundColor: '#16a34a',
    color: '#fff',
  },

  floatingCart: {
    position: 'fixed',
    bottom: '1rem',
    left: '1.25rem',
    right: '1.25rem',
    fontSize: '1.2rem',
    fontWeight: 'bold',
    padding: '1rem',
    borderRadius: 14,
    border: 'none',
    backgroundColor: '#111827',
    color: '#fff',
    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
    zIndex: 10,
  },

  toast: {
    position: 'fixed',
    bottom: '5.5rem',
    left: '1.25rem',
    right: '1.25rem',
    textAlign: 'center',
    fontSize: '1.05rem',
    fontWeight: 'bold',
    padding: '0.85rem',
    borderRadius: 12,
    backgroundColor: '#dcfce7',
    color: '#166534',
    zIndex: 20,
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'flex-end',
    zIndex: 30,
  },
  modalSheet: {
    width: '100%',
    maxHeight: '85vh',
    overflowY: 'auto',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: '1.5rem 1.25rem 2rem',
  },
  modalTitle: {
    fontSize: '1.4rem',
    fontWeight: 'bold',
    marginBottom: '1rem',
  },
  cartItemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.9rem',
  },
  cartItemRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.6rem',
    borderBottom: '1px solid #f0f0f0',
    paddingBottom: '0.75rem',
  },
  cartItemInfo: { flex: 1 },
  removeButton: {
    fontSize: '0.95rem',
    fontWeight: 'bold',
    color: '#dc2626',
    background: 'none',
    border: 'none',
    padding: '0.5rem',
  },
  cartTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '1.3rem',
    fontWeight: 'bold',
    padding: '1rem 0',
    borderTop: '2px solid #eee',
    marginTop: '0.5rem',
  },
  billLineRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '1.1rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid #f5f5f5',
  },
  modalButtonRow: {
    display: 'flex',
    gap: '1rem',
    marginTop: '0.5rem',
  },
  primaryButton: {
    flex: 1,
    fontSize: '1.2rem',
    fontWeight: 'bold',
    padding: '1rem',
    borderRadius: 12,
    border: 'none',
    backgroundColor: '#16a34a',
    color: '#fff',
  },
  secondaryButton: {
    flex: 1,
    fontSize: '1.1rem',
    fontWeight: 'bold',
    padding: '1rem',
    borderRadius: 12,
    border: '2px solid #999',
    backgroundColor: '#fff',
    color: '#333',
  },
  dangerButton: {
    flex: 1,
    fontSize: '1.1rem',
    fontWeight: 'bold',
    padding: '1rem',
    borderRadius: 12,
    border: 'none',
    backgroundColor: '#dc2626',
    color: '#fff',
  },
  errorText: {
    color: '#dc2626',
    fontWeight: 'bold',
    fontSize: '1rem',
    padding: '0.5rem 0',
  },
};
