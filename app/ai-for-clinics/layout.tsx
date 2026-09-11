import IndustrySeoFooter from '@/components/IndustrySeoFooter';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<IndustrySeoFooter industry="clinics" /></>;
}
