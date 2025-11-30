import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import prisma from "../../../lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ error: "Login and password required" });
    const user = await prisma.user.findUnique({
      where: { login },
      include: {},
    });
    if (!user) return res.status(401).json({ error: "User not found" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid password" });
    
    const role = (user as any).role || 'user';
    
    return res.status(200).json({ user: { id: user.id, login: user.login, role } });
  } catch (e: any) {
    console.error("/api/auth/login error:", e);
    return res.status(500).json({ error: e.message || "Internal server error" });
  }
}
