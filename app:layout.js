export const metadata = {
  title: 'ดองเด็ด',
  description: 'ระบบสั่งอาหารร้านดองเด็ด — กุ้งดอง แซลมอนดองสไตล์เกาหลี',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
