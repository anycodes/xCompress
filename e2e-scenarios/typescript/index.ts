import { z } from "zod";
import { nanoid } from "nanoid";

const InputSchema = z.object({
  name: z.string().default("world"),
  count: z.number().int().positive().default(1),
});

export const handler = async (event: unknown) => {
  const input = InputSchema.parse(event || {});
  const ids = Array.from({ length: input.count }, () => nanoid());

  return {
    statusCode: 200,
    body: JSON.stringify({
      greeting: `Hello, ${input.name}!`,
      ids,
    }),
  };
};
