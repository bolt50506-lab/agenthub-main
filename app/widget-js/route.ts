import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Backwards-compatible widget endpoint.
 *
 * The landing page and older customer embeds use /widget-js. Keep that URL
 * working, but serve the current production widget implementation from
 * /widget.js so there is only one widget client and one reply flow to maintain.
 */
export async function GET(req: NextRequest) {
  const business = req.nextUrl.searchParams.get('business');
  if (!business) {
    return new NextResponse('Missing business parameter', { status: 400 });
  }

  const url = new URL('/widget.js', req.url);
  url.searchParams.set('business', business);
  url.searchParams.set('v', '2');

  return NextResponse.redirect(url, 307, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
