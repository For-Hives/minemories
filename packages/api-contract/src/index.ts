import { oc } from '@orpc/contract';
import * as z from 'zod';

export const apiContract = {
  pairing: {
    create: oc.output(
      z.object({
        code: z.string().regex(/^\d{6}$/),
        expiresAt: z.string().datetime(),
      }),
    ),
  },
  memories: {
    list: oc.output(
      z.array(
        z.object({
          id: z.string().uuid(),
          name: z.string(),
          size: z.number().int().nonnegative(),
          createdAt: z.string().datetime(),
        }),
      ),
    ),
  },
};
