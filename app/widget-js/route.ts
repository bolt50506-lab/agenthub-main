import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Backwards-compatible widget endpoint.
 *
 * Older customer embeds use /widget-js. Return the current widget JavaScript
 * directly instead of redirecting: browsers execute a script response from
 * the original script src reliably, while Next.js 13's redirect typing also
 * stays compatible with the project's installed Next.js version.
 */
export async function GET(req: NextRequest) {
  const business = req.nextUrl.searchParams.get('business');
  if (!business) {
    return new NextResponse('Missing business parameter', { status: 400 });
  }

  const widgetUrl = new URL('/widget.js', req.url);
  widgetUrl.searchParams.set('business', business);
  widgetUrl.searchParams.set('v', '2');

  const response = await fetch(widgetUrl.toString(), {
    cache: 'no-store',
  });

  if (!response.ok) {
    return new NextResponse('Widget unavailable', { status: 502 });
  }

  const script = await response.text();
  return new NextResponse(script, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
