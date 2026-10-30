import { Poppins } from 'next/font/google';
import SpotStudio from './SpotStudio';

// Sólo para el video (canvas): la pantalla en sí usa la tipografía del admin.
const poppins = Poppins({ subsets: ['latin'], weight: ['500', '600', '700'], display: 'swap' });

export default function AdminMarketingVideosPage() {
  return <SpotStudio fontFamily={poppins.style.fontFamily} />;
}
