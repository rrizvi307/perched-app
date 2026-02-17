import { Href, Link } from 'expo-router';
import { type ComponentProps } from 'react';
import { openExternalLink } from '@/services/externalLinks';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: Href & string };

export function ExternalLink({ href, ...rest }: Props) {
  return (
    <Link
      target="_blank"
      {...rest}
      href={href}
      onPress={async (event) => {
        if (process.env.EXPO_OS !== 'web') {
          event.preventDefault();
          await openExternalLink(String(href));
        }
      }}
    />
  );
}
