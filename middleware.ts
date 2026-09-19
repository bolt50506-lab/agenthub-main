import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: ['/api/whatsapp/incoming'],
};

/**
 * WhatsApp incoming requests must keep their request body untouched.
 * The previous middleware cloned and parsed the JSON body before the route,
 * which can result in an empty body reaching the Next.js route on Netlify.
 * Group targeting is handled by the incoming route after it parses the body.
 */
export async function middleware(_req: NextRequest) {
  return NextResponse.next();
}
