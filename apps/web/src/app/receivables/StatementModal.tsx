'use client';

import CustomerStatementView from './CustomerStatementView';

interface Props {
  customerId: string;
  onClose: () => void;
}

export default function StatementModal({ customerId, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Cuenta Corriente</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <CustomerStatementView customerId={customerId} />
      </div>
    </div>
  );
}
