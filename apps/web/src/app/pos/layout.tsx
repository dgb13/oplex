import { PosThemeProvider } from './pos-theme';

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <PosThemeProvider>{children}</PosThemeProvider>;
}
