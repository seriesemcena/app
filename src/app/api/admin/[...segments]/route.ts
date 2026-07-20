import { NextResponse } from 'next/server';

const retired = () => NextResponse.json({
  error: 'A API administrativa foi movida para a API central versionada.',
  code: 'ADMIN_API_MOVED',
}, {
  status: 410,
  headers: {
    'Cache-Control': 'no-store',
    'Location': 'https://api.maratonou.com/v1/admin',
  },
});

export const GET = retired;
export const POST = retired;
export const PATCH = retired;
export const DELETE = retired;
