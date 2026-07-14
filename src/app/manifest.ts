import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Our Recipes',
    short_name: 'Our Recipes',
    description: 'A self-hosted household recipe manager.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f3ea',
    theme_color: '#637a45',
    icons: [
      {
        src: '/icons/our-recipes-mark.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
