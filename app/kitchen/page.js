'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const ACTIVE_STATUSES = ['received', 'preparing'];

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [loadError, setLoadError] = useState('');
  // bump this every 30s just to re-render elapsed-time labels
  const [, forceTick] = useState(0);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  // Sort oldest -> newest, so new orders land at the end of the grid
  const sortByCreatedAt = (list) =>
    [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const upsertOrder = (order) => {
    setOrders((prev) => {
      const withoutThis = prev.filter((o) => o.id !== order.id);
      return sortByCreatedAt([...withoutThis, order]);
    });
  };

  const removeOrder = (orderId) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  };

  // 1) Initial load
  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      const { data, error } = await supabase
        .from('orders')
        .select('id, table_number, items, status, created_at')
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: true });

      if (cancelled) return;

      if (error) {
        setLoadError('โหลดออเดอร์ไม่สำเร็จ: ' + error.message);
        return;
      }
      setOrders(data || []);
    }

    loadOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Realtime subscription for INSERT and UPDATE on orders
  useEffect(() => {
    const channel = supabase
      .channel('kitchen-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const newOrder = payload.new;
          if (ACTIVE_STATUSES.includes(newOrder.status)) {
            upsertOrder(newOrder);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const updated = payload.new;
          if (ACTIVE_STATUSES.includes(updated.status)) {
            upsertOrder(updated);
          } else {
            // e.g. moved to 'served' (possibly from another station) — drop it
            removeOrder(updated.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Keep "N นาทีที่แล้ว" labels fresh
  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleStartPreparing = async (order) => {
    // optimistic update
    upsertOrder({ ...order, status: 'preparing' });
    const { error } = await supabase
      .from('orders')
      .update({ status: 'preparing' })
      .eq('id', order.id);
    if (error) {
      // revert on failure
      upsertOrder({ ...order, status: order.status });
    }
  };

  const handleMarkServed = async (order) => {
    // optimistic removal
    removeOrder(order.id);
    const { error } = await supabase
      .from('orders')
      .update({ status: 'served' })
      .eq('id', order.id);
    if (error) {
      // put it back if the update failed
      upsertOrder(order);
    }
  };

  const formatTime = (createdAt) => {
    const d = new Date(createdAt);
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };

  const formatElapsed = (createdAt) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
    if (mins < 1) return 'เพิ่งสั่ง';
    return `${mins} นาทีที่แล้ว`;
  };

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.heading}>สเตชันจัดเตรียม — ดองเด็ด</h1>
        <div style={styles.countBadge}>{orders.length} ออเดอร์</div>
      </header>

      {loadError && <div style={styles.errorBanner}>{loadError}</div>}

      {orders.length === 0 && !loadError && (
        <div style={styles.emptyState}>ยังไม่มีออเดอร์ค้างอยู่</div>
      )}

      <div style={styles.grid}>
        {orders.map((order) => {
          const isPreparing = order.status === 'preparing';
          return (
            <div
              key={order.id}
              style={{
                ...styles.card,
                ...(isPreparing ? styles.cardPreparing : styles.cardReceived),
              }}
            >
              <div style={styles.cardTop}>
                <div style={styles.tableNumber}>โต๊ะ {order.table_number}</div>
                <div style={styles.timeBlock}>
                  <div style={styles.timeText}>{formatTime(order.created_at)}</div>
                  <div style={styles.elapsedText}>{formatElapsed(order.created_at)}</div>
                </div>
              </div>

              <div style={styles.itemList}>
                {(order.items || []).map((item, idx) => (
                  <div key={idx} style={styles.itemRow}>
                    <span style={styles.itemName}>{item.name}</span>
                    <span style={styles.itemQty}>× {item.quantity}</span>
                  </div>
                ))}
              </div>

              <div style={styles.buttonRow}>
                {!isPreparing && (
                  <button
                    style={styles.prepareButton}
                    onClick={() => handleStartPreparing(order)}
                  >
                    เริ่มจัดเตรียม
                  </button>
                )}
                <button
                  style={styles.servedButton}
                  onClick={() => handleMarkServed(order)}
                >
                  จัดเสิร์ฟแล้ว
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#111827',
    fontFamily: 'sans-serif',
    padding: '1.5rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  heading: {
    color: '#fff',
    fontSize: '2rem',
    margin: 0,
  },
  countBadge: {
    fontSize: '1.3rem',
    fontWeight: 'bold',
    color: '#111827',
    backgroundColor: '#fbbf24',
    padding: '0.4rem 1rem',
    borderRadius: 999,
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    fontWeight: 'bold',
    fontSize: '1.1rem',
    padding: '1rem',
    borderRadius: 10,
    marginBottom: '1rem',
  },
  emptyState: {
    color: '#9ca3af',
    fontSize: '1.5rem',
    textAlign: 'center',
    padding: '4rem 0',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '1.25rem',
  },
  card: {
    borderRadius: 16,
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    border: '4px solid transparent',
  },
  cardReceived: {
    backgroundColor: '#1f2937',
    borderColor: '#3b82f6',
  },
  cardPreparing: {
    backgroundColor: '#78350f',
    borderColor: '#f59e0b',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tableNumber: {
    fontSize: '2.4rem',
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: 1,
  },
  timeBlock: {
    textAlign: 'right',
  },
  timeText: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    color: '#e5e7eb',
  },
  elapsedText: {
    fontSize: '1rem',
    color: '#d1d5db',
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 10,
    padding: '0.75rem 1rem',
  },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '1.3rem',
    color: '#fff',
  },
  itemName: { fontWeight: 'bold' },
  itemQty: { fontWeight: 'bold', color: '#fbbf24' },
  buttonRow: {
    display: 'flex',
    gap: '0.75rem',
  },
  prepareButton: {
    flex: 1,
    fontSize: '1.15rem',
    fontWeight: 'bold',
    padding: '0.9rem',
    borderRadius: 10,
    border: 'none',
    backgroundColor: '#f59e0b',
    color: '#111827',
  },
  servedButton: {
    flex: 1,
    fontSize: '1.15rem',
    fontWeight: 'bold',
    padding: '0.9rem',
    borderRadius: 10,
    border: 'none',
    backgroundColor: '#16a34a',
    color: '#fff',
  },
};
