export default function StoreNotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f6f6f4', color: '#1d1d1b', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 420, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Esta tienda no está disponible</h1>
        <p style={{ color: '#6b6a64', lineHeight: 1.6 }}>
          Puede que la dirección esté mal escrita o que la tienda todavía no esté publicada.
        </p>
        <a href="https://oplex.com.ar" style={{ color: '#4f46e5', fontWeight: 600 }}>
          Hecho con Oplex
        </a>
      </div>
    </main>
  );
}
