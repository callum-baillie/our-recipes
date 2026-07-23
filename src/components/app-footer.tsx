import { BordIcon } from '@/components/bord-brand';
import { kitchenFooterCopy } from '@/lib/brand';

export function AppFooter({ kitchenName }: { kitchenName: string }) {
  return (
    <footer className="home-footer app-footer">
      <BordIcon size={16} />
      <span>{kitchenFooterCopy(kitchenName)}</span>
    </footer>
  );
}
