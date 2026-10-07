import { PosThemeProvider } from './pos-theme';
import TaxConditionGate from './TaxConditionGate';

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <PosThemeProvider>
      <TaxConditionGate>{children}</TaxConditionGate>
    </PosThemeProvider>
  );
}
