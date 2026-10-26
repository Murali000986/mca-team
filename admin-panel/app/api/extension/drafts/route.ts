import { NextRequest, NextResponse } from "next/server";
import { requestsForUser } from "@/lib/mock-data";

async function verifyExtToken(req: NextRequest): Promise<{ sub: string; name: string; email: string; role: "ADMIN" | "SUPERADMIN"; exp: number } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload || payload.iss !== "ledgerly-ext") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    // Re-verify signature
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sigBytes = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return null;

    return payload;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const payload = await verifyExtToken(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const all = requestsForUser(payload.role, payload.name);
  const drafts = all
    .filter(r => r.currentStage === "READY_FOR_PART_A")
    .map(r => ({
      id: r.id,
      clientName: r.clientName,
      companyType: r.companyType,
      currentStage: r.currentStage,
      proposedNames: r.proposedNames,
      submittedFields: r.submittedFields,
      validation: r.validation,
      nextAction: r.nextAction,
    }));

  return NextResponse.json({ drafts });
}
