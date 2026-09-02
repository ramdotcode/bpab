import { listRT } from '@/lib/customers';
import { ok, handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => ok({ rt: await listRT() }));
