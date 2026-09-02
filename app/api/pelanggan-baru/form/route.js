import { dataForm } from '@/lib/newcustomer';
import { ok, handler } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => ok(await dataForm()));
