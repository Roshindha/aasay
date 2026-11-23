import express from "express";
import { z } from "zod";
import { validateBody } from "express-validator-pro";
import { formatCurrency } from "@/utils";
import { applyDiscount, PAGE_SIZE } from "./pricing";

const app = express();
const Body = z.object({ price: z.number(), percent: z.number() });

app.post("/price", validateBody(Body), (req, res) => {
  const { price, percent } = Body.parse(req.body);
  res.json({ total: formatCurrency(applyDiscount(price, percent, 0)), pageSize: PAGE_SIZE });
});

export default app;
