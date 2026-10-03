export const dynamic = 'force-dynamic';

/** Web runtime availability only; database readiness is checked by the API. */
export function GET() {
  return Response.json(
    { status: 'ok', service: 'housemate-web' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
