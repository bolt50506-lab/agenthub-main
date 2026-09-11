'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

type LandingContent = {
  heroBadge?: string;
  heroHeading?: string;
  heroHighlight?: string;
  heroDescription?: string;
  primaryCta?: string;
  secondaryCta?: string;
  heroImage?: string;
  trialBadgeEnabled?: boolean;
  trialBadgeText?: string;
  contactPhone?: string;
};

export function WebsiteContentHydrator() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/') return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase.from('site_content').select('value').eq('key', 'landing').maybeSingle();
      if (cancelled || error || !data?.value) return;
      const content = data.value as LandingContent;

      const hero = document.querySelector('main > section:first-of-type');
      if (!hero) return;

      const heading = hero.querySelector('h1');
      if (heading) {
        const highlight = heading.querySelector('span');
        if (highlight) {
          const headingText = content.heroHeading?.trim();
          if (headingText) {
            const nodes = Array.from(heading.childNodes).filter((node) => node !== highlight);
            nodes.forEach((node) => node.remove());
            heading.insertBefore(document.createTextNode(headingText), highlight);
          }
          if (content.heroHighlight?.trim()) highlight.textContent = content.heroHighlight.trim();
        }
      }

      const badge = hero.querySelector('[class*="bg-cyan-400\\/10"]');
      if (badge && content.heroBadge?.trim()) {
        const textNodes = Array.from(badge.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
        const textNode = textNodes[textNodes.length - 1];
        if (textNode) textNode.textContent = ` ${content.heroBadge.trim()}`;
      }

      const paragraphs = Array.from(hero.querySelectorAll('p'));
      const description = paragraphs.find((p) => p.className.includes('text-lg'));
      if (description && content.heroDescription?.trim()) description.textContent = content.heroDescription.trim();

      const buttons = Array.from(hero.querySelectorAll('button'));
      if (buttons[0] && content.primaryCta?.trim()) {
        const arrow = buttons[0].querySelector('svg');
        buttons[0].textContent = content.primaryCta.trim();
        if (arrow) buttons[0].appendChild(arrow);
      }
      if (buttons[1] && content.secondaryCta?.trim()) {
        const icon = buttons[1].querySelector('svg');
        buttons[1].textContent = content.secondaryCta.trim();
        if (icon) buttons[1].prepend(icon);
      }

      const heroImage = hero.querySelector('img');
      if (heroImage && content.heroImage?.trim()) heroImage.setAttribute('src', content.heroImage.trim());

      const trial = document.querySelector('[data-agenthub-trial-cta]');
      if (trial) {
        trial.setAttribute('data-enabled', String(content.trialBadgeEnabled !== false));
        const label = trial.querySelector('[data-trial-label]');
        if (label && content.trialBadgeText?.trim()) label.textContent = content.trialBadgeText.trim();
        if (content.trialBadgeEnabled === false) (trial as HTMLElement).style.display = 'none';
        else (trial as HTMLElement).style.display = '';
      }

      if (content.contactPhone?.trim()) {
        document.querySelectorAll('[data-agenthub-contact]').forEach((node) => {
          node.textContent = content.contactPhone!.trim();
          if (node instanceof HTMLAnchorElement) node.href = `https://wa.me/${content.contactPhone!.replace(/\\D/g, '')}`;
        });
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [pathname]);

  return null;
}
