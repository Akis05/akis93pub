import { zValidator } from "@hono/zod-validator";
import { createFeatureApp, errorResponse } from "@/core/features/_shared";
import { sendSmsViaSmpp, checkSmppConnection } from "../queries/send-sms";
import { sendSmsBodySchema } from "../zod/send-sms";
import { z } from "zod";

const app = createFeatureApp();

app.post("/send", zValidator("json", sendSmsBodySchema), async (c) => {
  try {
    const body = c.req.valid("json");
    const result = await sendSmsViaSmpp(body);
    return c.json(result);
  } catch (e) {
    return errorResponse(c, e);
  }
});

app.get(
  "/check/:connectorId",
  zValidator("param", z.object({ connectorId: z.string().min(1) })),
  async (c) => {
    try {
      const { connectorId } = c.req.valid("param");
      return c.json(await checkSmppConnection(connectorId));
    } catch (e) {
      return errorResponse(c, e);
    }
  }
);

export default app;
