import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Maratonou',
    short_name: 'Maratonou',
    description: 'Seu guia de filmes e séries',
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    background_color: '#0D0D0F',
    theme_color: '#0D0D0F',
    orientation: 'portrait',
    icons: [
      {
        src: '/logo.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
