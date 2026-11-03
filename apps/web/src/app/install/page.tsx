import { Logo } from '@/components/ui';
import { LanguageToggle } from '@/components/forms';
import { InstallationClaim } from '@/components/enterprise/enterprise-console';
export default function Install() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <header className="mb-6 flex items-center justify-between">
        <Logo />
        <LanguageToggle />
      </header>
      <InstallationClaim />
    </main>
  );
}
